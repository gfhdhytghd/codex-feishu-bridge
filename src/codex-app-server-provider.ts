/**
 * Codex app-server backed LLMProvider.
 *
 * Uses `codex app-server --listen stdio://` directly instead of the current
 * @openai/codex-sdk wrapper. The app-server protocol exposes `turn/steer`,
 * which lets the bridge inject user guidance into an active turn.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import type { LLMProvider, StreamChatParams } from './vendor/bridge-host.js';
import type { PendingPermissions } from './permission-gateway.js';
import { approvalPolicyForCodex, type PermissionPolicy } from './permission-policy.js';
import { buildSubprocessEnv } from './llm-provider.js';
import { sseEvent } from './sse-utils.js';
import { CodexProvider as CodexSdkProvider } from './codex-provider.js';

type JsonRpcMessage = {
  id?: string;
  method?: string;
  params?: any;
  result?: any;
  error?: { message?: string };
};

type RequestWaiter = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

type TurnState = {
  sessionId: string;
  threadId: string;
  turnId: string | null;
  controller: ReadableStreamDefaultController<string>;
  completed: boolean;
  tokenUsage: any;
  seenToolUses: Set<string>;
  tempFiles: string[];
  idleTimer: ReturnType<typeof setTimeout> | null;
  lastActivityAt: number;
};

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

function codexPath(): string {
  return process.env.CTI_CODEX_EXECUTABLE || 'codex';
}

function codexReasoningEffort(): string | undefined {
  const effort = process.env.CTI_CODEX_REASONING_EFFORT;
  return effort && ['minimal', 'low', 'medium', 'high', 'xhigh'].includes(effort)
    ? effort
    : undefined;
}

function shouldPassModelToCodex(): boolean {
  return process.env.CTI_CODEX_PASS_MODEL === 'true';
}

function appServerDisabled(): boolean {
  return process.env.CTI_CODEX_APP_SERVER === 'false';
}

function requestTimeoutMs(): number {
  return Number.parseInt(process.env.CTI_CODEX_APP_SERVER_REQUEST_TIMEOUT_MS || '', 10) || 30_000;
}

function turnIdleTimeoutMs(): number {
  return Number.parseInt(process.env.CTI_CODEX_APP_SERVER_TURN_IDLE_TIMEOUT_MS || '', 10) || 60_000;
}

function appServerArgs(): string[] {
  if (process.env.CTI_CODEX_APP_SERVER_CONNECT === 'proxy') {
    const args = ['app-server', 'proxy'];
    const sock = process.env.CTI_CODEX_APP_SERVER_SOCKET;
    if (sock) args.push('--sock', sock);
    return args;
  }
  return ['app-server', '--listen', 'stdio://'];
}

class AppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private waiters = new Map<string, RequestWaiter>();
  private turnStates = new Map<string, TurnState>();
  private threadToTurn = new Map<string, TurnState>();
  private closed = false;

  async ensureReady(): Promise<void> {
    if (this.closed) throw new Error('Codex app-server client is closed');
    if (this.ready) return this.ready;
    this.ready = this.start();
    return this.ready;
  }

  private async start(): Promise<void> {
    const child = spawn(codexPath(), appServerArgs(), {
      cwd: process.cwd(),
      env: buildSubprocessEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;

    child.once('exit', (code, signal) => {
      this.closed = true;
      const exitReason = signal || (code ?? 'unknown');
      const err = new Error(`Codex app-server exited (${exitReason})`);
      for (const waiter of this.waiters.values()) waiter.reject(err);
      this.waiters.clear();
      for (const turn of this.turnStates.values()) {
        if (!turn.completed) {
          try {
            turn.controller.enqueue(sseEvent('error', err.message));
            turn.controller.close();
          } catch { /* controller already closed */ }
        }
        if (turn.idleTimer) clearTimeout(turn.idleTimer);
        cleanupFiles(turn.tempFiles);
      }
      for (const turn of this.threadToTurn.values()) {
        if (turn.idleTimer) clearTimeout(turn.idleTimer);
      }
      this.turnStates.clear();
      this.threadToTurn.clear();
    });

    child.stderr.on('data', (data) => {
      const text = String(data).trim();
      if (text) console.warn('[codex-app-server]', text);
    });

    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => this.handleLine(line));

    await this.request('initialize', {
      clientInfo: {
        name: 'claude-to-im',
        title: 'Claude to IM',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: [
          'command/exec/outputDelta',
          'item/agentMessage/delta',
          'item/plan/delta',
          'item/fileChange/outputDelta',
          'item/reasoning/summaryTextDelta',
          'item/reasoning/textDelta',
        ],
      },
    });
    this.notify('initialized', {});
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(line);
    } catch {
      console.warn('[codex-app-server] Non-JSON stdout:', line);
      return;
    }

    if (msg.id && (msg.result !== undefined || msg.error)) {
      const waiter = this.waiters.get(msg.id);
      if (waiter) {
        this.waiters.delete(msg.id);
        if (msg.error) waiter.reject(new Error(msg.error.message || 'Codex app-server request failed'));
        else waiter.resolve(msg.result);
      }
      return;
    }

    if (msg.id && msg.method) {
      void this.handleServerRequest(msg);
      return;
    }

    if (msg.method) this.handleNotification(msg);
  }

  request(method: string, params: any): Promise<any> {
    if (!this.child || this.closed) throw new Error('Codex app-server is not running');
    const id = crypto.randomUUID();
    const payload = JSON.stringify({ id, method, params });
    const timeout = requestTimeoutMs();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        this.child?.kill('SIGTERM');
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, timeout);
      this.waiters.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.child!.stdin.write(`${payload}\n`);
    });
  }

  notify(method: string, params: any): void {
    if (!this.child || this.closed) return;
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  async startThread(params: any): Promise<string> {
    const result = await this.request('thread/start', params);
    const threadId = result?.thread?.id;
    if (!threadId) throw new Error('Codex app-server thread/start returned no thread id');
    return threadId;
  }

  async resumeThread(params: any): Promise<string> {
    const result = await this.request('thread/resume', params);
    const threadId = result?.thread?.id;
    if (!threadId) throw new Error('Codex app-server thread/resume returned no thread id');
    return threadId;
  }

  registerTurn(state: TurnState): void {
    if (state.turnId) this.turnStates.set(state.turnId, state);
    this.threadToTurn.set(state.threadId, state);
    this.touchTurn(state);
  }

  updateTurnId(state: TurnState, turnId: string): void {
    state.turnId = turnId;
    this.turnStates.set(turnId, state);
    this.threadToTurn.set(state.threadId, state);
  }

  getActiveTurnBySession(sessionId: string): TurnState | undefined {
    for (const turn of this.threadToTurn.values()) {
      if (turn.sessionId === sessionId && !turn.completed) return turn;
    }
    return undefined;
  }

  private handleNotification(msg: JsonRpcMessage): void {
    const params = msg.params || {};
    const turn = params.turnId
      ? this.turnStates.get(params.turnId)
      : params.threadId
        ? this.threadToTurn.get(params.threadId)
      : undefined;
    if (turn) this.touchTurn(turn);

    switch (msg.method) {
      case 'turn/started': {
        if (turn && params.turn?.id) this.updateTurnId(turn, params.turn.id);
        break;
      }
      case 'item/completed': {
        if (turn) this.emitCompletedItem(turn, params.item);
        break;
      }
      case 'item/agentMessage/delta': {
        if (turn && params.delta) turn.controller.enqueue(sseEvent('text', params.delta));
        break;
      }
      case 'thread/tokenUsage/updated': {
        if (turn) turn.tokenUsage = params.tokenUsage?.last || params.tokenUsage?.total || null;
        break;
      }
      case 'turn/completed': {
        if (!turn) break;
        turn.completed = true;
        const usage = turn.tokenUsage;
        turn.controller.enqueue(sseEvent('result', {
          usage: usage ? {
            input_tokens: usage.inputTokens ?? 0,
            output_tokens: usage.outputTokens ?? 0,
            cache_read_input_tokens: usage.cachedInputTokens ?? 0,
          } : undefined,
          session_id: turn.threadId,
        }));
        turn.controller.close();
        if (turn.turnId) this.turnStates.delete(turn.turnId);
        this.threadToTurn.delete(turn.threadId);
        if (turn.idleTimer) clearTimeout(turn.idleTimer);
        cleanupFiles(turn.tempFiles);
        break;
      }
      case 'error': {
        if (!turn) break;
        turn.controller.enqueue(sseEvent('error', params.message || 'Codex app-server error'));
        break;
      }
    }
  }

  private async handleServerRequest(msg: JsonRpcMessage): Promise<void> {
    const method = msg.method || '';
    const id = msg.id!;
    const params = msg.params || {};
    const turn = params.turnId
      ? this.turnStates.get(params.turnId)
      : params.threadId
        ? this.threadToTurn.get(params.threadId)
        : undefined;
    if (turn) this.touchTurn(turn);

    try {
      if (method === 'item/commandExecution/requestApproval') {
        const decision = await this.resolveApproval(turn, id, 'Bash', { command: params.command, cwd: params.cwd });
        this.respond(id, { decision });
        return;
      }
      if (method === 'item/fileChange/requestApproval') {
        const decision = await this.resolveApproval(turn, id, 'Edit', { reason: params.reason, grantRoot: params.grantRoot });
        this.respond(id, { decision });
        return;
      }
      if (method === 'item/permissions/requestApproval') {
        this.respond(id, {
          permissions: params.permissions,
          scope: 'turn',
        });
        return;
      }
      this.respond(id, {});
    } catch (err) {
      console.warn('[codex-app-server] approval request failed:', err instanceof Error ? err.message : err);
      if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
        this.respond(id, { decision: 'decline' });
      } else {
        this.respond(id, {});
      }
    }
  }

  private async resolveApproval(turn: TurnState | undefined, requestId: string, toolName: string, input: Record<string, unknown>): Promise<string> {
    const provider = (turn as any)?.provider as CodexAppServerProvider | undefined;
    if (!provider || provider.permissionPolicy === 'never') return 'accept';

    turn?.controller.enqueue(sseEvent('permission_request', {
      permissionRequestId: requestId,
      toolName,
      toolInput: input,
      suggestions: [
        { type: 'allow', toolName },
        { type: 'deny', toolName },
      ],
    }));

    const result = await provider.pendingPerms.waitFor(requestId);
    return result.behavior === 'allow' ? 'accept' : 'decline';
  }

  private respond(id: string, result: any): void {
    if (!this.child || this.closed) return;
    this.child.stdin.write(`${JSON.stringify({ id, result })}\n`);
  }

  private touchTurn(turn: TurnState): void {
    turn.lastActivityAt = Date.now();
    if (turn.idleTimer) clearTimeout(turn.idleTimer);
    const timeout = turnIdleTimeoutMs();
    turn.idleTimer = setTimeout(() => {
      if (turn.completed) return;
      const idleMs = Date.now() - turn.lastActivityAt;
      const err = new Error(`Codex app-server turn idle timed out after ${idleMs}ms`);
      console.warn('[codex-app-server]', err.message);
      turn.completed = true;
      try {
        turn.controller.error(err);
      } catch { /* controller already closed */ }
      if (turn.turnId) this.turnStates.delete(turn.turnId);
      this.threadToTurn.delete(turn.threadId);
      cleanupFiles(turn.tempFiles);
      this.child?.kill('SIGTERM');
    }, timeout);
  }

  private emitCompletedItem(turn: TurnState, item: any): void {
    if (!item || typeof item !== 'object') return;
    switch (item.type) {
      case 'agentMessage':
        if (item.text) turn.controller.enqueue(sseEvent('text', item.text));
        break;
      case 'commandExecution': {
        const toolId = item.id || `tool-${Date.now()}`;
        if (!turn.seenToolUses.has(toolId)) {
          turn.seenToolUses.add(toolId);
          turn.controller.enqueue(sseEvent('tool_use', {
            id: toolId,
            name: 'Bash',
            input: { command: item.command, cwd: item.cwd },
          }));
        }
        turn.controller.enqueue(sseEvent('tool_result', {
          tool_use_id: toolId,
          content: item.aggregatedOutput || (item.exitCode ? `Exit code: ${item.exitCode}` : 'Done'),
          is_error: item.status === 'failed' || (item.exitCode != null && item.exitCode !== 0),
        }));
        break;
      }
      case 'fileChange': {
        const toolId = item.id || `tool-${Date.now()}`;
        const changes = Array.isArray(item.changes) ? item.changes : [];
        turn.controller.enqueue(sseEvent('tool_use', {
          id: toolId,
          name: 'Edit',
          input: { files: changes },
        }));
        turn.controller.enqueue(sseEvent('tool_result', {
          tool_use_id: toolId,
          content: changes.map((c: any) => `${c.kind}: ${c.path}`).join('\n') || 'File changes applied',
          is_error: item.status === 'failed',
        }));
        break;
      }
      case 'mcpToolCall':
      case 'dynamicToolCall': {
        const toolId = item.id || `tool-${Date.now()}`;
        const name = item.type === 'mcpToolCall'
          ? `mcp__${item.server || ''}__${item.tool || ''}`
          : `dynamic__${item.namespace || ''}__${item.tool || ''}`;
        turn.controller.enqueue(sseEvent('tool_use', {
          id: toolId,
          name,
          input: item.arguments ?? {},
        }));
        turn.controller.enqueue(sseEvent('tool_result', {
          tool_use_id: toolId,
          content: item.error?.message || stringifyResult(item.result ?? item.contentItems) || 'Done',
          is_error: item.status === 'failed' || item.success === false || !!item.error,
        }));
        break;
      }
    }
  }
}

function stringifyResult(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function cleanupFiles(files: string[]): void {
  for (const file of files) {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  }
}

export class CodexAppServerProvider implements LLMProvider {
  private client = new AppServerClient();
  private threadIds = new Map<string, string>();

  constructor(
    public pendingPerms: PendingPermissions,
    public permissionPolicy: PermissionPolicy = 'always',
    private networkAccessEnabled = true,
    private sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access' = 'danger-full-access',
  ) {}

  async steerTurn(sessionId: string, text: string): Promise<boolean> {
    if (appServerDisabled()) return false;
    await this.client.ensureReady();
    const active = this.client.getActiveTurnBySession(sessionId);
    if (!active?.turnId) return false;
    await this.client.request('turn/steer', {
      threadId: active.threadId,
      expectedTurnId: active.turnId,
      input: [{ type: 'text', text, text_elements: [] }],
    });
    return true;
  }

  streamChat(params: StreamChatParams): ReadableStream<string> {
    const self = this;
    return new ReadableStream<string>({
      start(controller) {
        (async () => {
          const tempFiles: string[] = [];
          try {
            if (appServerDisabled()) throw new Error('Codex app-server disabled by CTI_CODEX_APP_SERVER=false');
            await self.client.ensureReady();

            const threadParams = self.threadParams(params);
            let threadId = self.threadIds.get(params.sessionId) || params.sdkSessionId || '';
            if (threadId) {
              try {
                threadId = await self.client.resumeThread({ threadId, ...threadParams, excludeTurns: true });
              } catch {
                threadId = await self.client.startThread(threadParams);
              }
            } else {
              threadId = await self.client.startThread(threadParams);
            }
            self.threadIds.set(params.sessionId, threadId);
            controller.enqueue(sseEvent('status', { session_id: threadId }));

            const turnState: TurnState = {
              sessionId: params.sessionId,
              threadId,
              turnId: null,
              controller,
              completed: false,
              tokenUsage: null,
              seenToolUses: new Set(),
              tempFiles,
              idleTimer: null,
              lastActivityAt: Date.now(),
            };
            (turnState as any).provider = self;
            self.client.registerTurn(turnState);

            const input = self.buildInput(params, tempFiles);
            const result = await self.client.request('turn/start', {
              threadId,
              input,
              cwd: params.workingDirectory || null,
              approvalPolicy: approvalPolicyForCodex(self.permissionPolicy),
              approvalsReviewer: 'user',
              sandboxPolicy: self.sandboxPolicy(),
              ...(shouldPassModelToCodex() && params.model ? { model: params.model } : {}),
              ...(codexReasoningEffort() ? { effort: codexReasoningEffort() } : {}),
            });
            if (result?.turn?.id) self.client.updateTurnId(turnState, result.turn.id);

            params.abortController?.signal.addEventListener('abort', () => {
              if (turnState.turnId) {
                self.client.request('turn/interrupt', { threadId, turnId: turnState.turnId }).catch(() => {});
              }
            }, { once: true });
          } catch (err) {
            cleanupFiles(tempFiles);
            controller.error(err);
          }
        })();
      },
    });
  }

  private threadParams(params: StreamChatParams): Record<string, unknown> {
    return {
      ...(shouldPassModelToCodex() && params.model ? { model: params.model } : {}),
      cwd: params.workingDirectory || null,
      approvalPolicy: approvalPolicyForCodex(this.permissionPolicy),
      approvalsReviewer: 'user',
      sandbox: this.sandboxMode,
      config: {
        sandbox_workspace_write: { network_access: this.networkAccessEnabled },
      },
    };
  }

  private sandboxPolicy(): Record<string, unknown> | string {
    if (this.sandboxMode === 'danger-full-access') return { type: 'dangerFullAccess' };
    if (this.sandboxMode === 'read-only') return { type: 'readOnly', networkAccess: this.networkAccessEnabled };
    return {
      type: 'workspaceWrite',
      writableRoots: [],
      networkAccess: this.networkAccessEnabled,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    };
  }

  private buildInput(params: StreamChatParams, tempFiles: string[]): Array<Record<string, string | unknown[]>> {
    const input: Array<Record<string, string | unknown[]>> = [
      { type: 'text', text: params.prompt, text_elements: [] },
    ];
    const imageFiles = params.files?.filter((f) => f.type.startsWith('image/')) ?? [];
    for (const file of imageFiles) {
      const ext = MIME_EXT[file.type] || '.png';
      const tmpPath = path.join(os.tmpdir(), `cti-img-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      fs.writeFileSync(tmpPath, Buffer.from(file.data, 'base64'));
      tempFiles.push(tmpPath);
      input.push({ type: 'localImage', path: tmpPath });
    }
    return input;
  }
}

export class CodexAppServerWithFallbackProvider implements LLMProvider {
  private appServer: CodexAppServerProvider;
  private sdk: CodexSdkProvider;

  constructor(
    pendingPerms: PendingPermissions,
    permissionPolicy: PermissionPolicy = 'always',
    networkAccessEnabled = true,
    sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access' = 'danger-full-access',
  ) {
    this.appServer = new CodexAppServerProvider(
      pendingPerms,
      permissionPolicy,
      networkAccessEnabled,
      sandboxMode,
    );
    this.sdk = new CodexSdkProvider(
      pendingPerms,
      permissionPolicy,
      networkAccessEnabled,
      sandboxMode,
    );
  }

  steerTurn(sessionId: string, text: string): Promise<boolean> {
    return this.appServer.steerTurn(sessionId, text).catch((err) => {
      console.warn('[codex-app-server] steer failed:', err instanceof Error ? err.message : err);
      return false;
    });
  }

  streamChat(params: StreamChatParams): ReadableStream<string> {
    const self = this;
    return new ReadableStream<string>({
      start(controller) {
        (async () => {
          let assistantTextEmitted = false;
          try {
            const appReader = self.appServer.streamChat(params).getReader();
            while (true) {
              const { value, done } = await appReader.read();
              if (done) break;
              if (isAssistantTextEvent(value)) {
                assistantTextEmitted = true;
              }
              controller.enqueue(value);
            }
            controller.close();
          } catch (err) {
            if (assistantTextEmitted) {
              const message = err instanceof Error ? err.message : String(err);
              console.warn('[codex-app-server] failed after assistant text began:', message);
              try {
                controller.enqueue(sseEvent('error', message));
                controller.close();
              } catch { /* closed */ }
              return;
            }

            console.warn(
              '[codex-app-server] unavailable before assistant text; falling back to @openai/codex-sdk:',
              err instanceof Error ? err.message : err,
            );
            try {
              const sdkReader = self.sdk.streamChat(params).getReader();
              while (true) {
                const { value, done } = await sdkReader.read();
                if (done) break;
                controller.enqueue(value);
              }
              controller.close();
            } catch (fallbackErr) {
              controller.error(fallbackErr);
            }
          }
        })();
      },
    });
  }
}

function isAssistantTextEvent(chunk: string): boolean {
  if (!chunk.startsWith('event: text\n')) return false;
  for (const line of chunk.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice('data:'.length).trim();
    if (!data) continue;
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === 'string') return parsed.length > 0;
      return true;
    } catch {
      return data.length > 0;
    }
  }
  return false;
}
