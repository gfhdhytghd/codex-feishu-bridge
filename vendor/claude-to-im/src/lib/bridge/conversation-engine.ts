/**
 * Conversation Engine — processes inbound IM messages through Claude.
 *
 * Takes a ChannelBinding + inbound message, calls the LLM provider,
 * consumes the SSE stream server-side, saves messages to DB,
 * and returns the response text for delivery.
 */

import fs from 'fs';
import path from 'path';
import type { ChannelBinding } from './types';
import type {
  FileAttachment,
  SSEEvent,
  TokenUsage,
  MessageContentBlock,
} from './host';
import { getBridgeContext } from './context';
import crypto from 'crypto';

export interface PermissionRequestInfo {
  permissionRequestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  suggestions?: unknown[];
}

/**
 * Callback invoked immediately when a permission_request SSE event arrives.
 * This breaks the deadlock: the stream blocks until the permission is resolved,
 * so we must forward the request to the IM *during* stream consumption,
 * not after it returns.
 */
export type OnPermissionRequest = (perm: PermissionRequestInfo) => Promise<void>;

/**
 * Callback invoked when the user-visible stream preview changes.
 * Must return synchronously — the bridge-manager handles throttling and fire-and-forget.
 */
export type OnPartialText = (fullText: string, options?: { force?: boolean }) => void;

export interface ConversationResult {
  responseText: string;
  tokenUsage: TokenUsage | null;
  hasError: boolean;
  errorMessage: string;
  /** Permission request events that were forwarded during streaming */
  permissionRequests: PermissionRequestInfo[];
  /** SDK session ID captured from status/result events, for session resume */
  sdkSessionId: string | null;
  /** Full preview content, including tool activity and user-facing text. */
  previewText?: string;
}

/**
 * Process an inbound message: send to Claude, consume the response stream,
 * save to DB, and return the result.
 */
export async function processMessage(
  binding: ChannelBinding,
  text: string,
  onPermissionRequest?: OnPermissionRequest,
  abortSignal?: AbortSignal,
  files?: FileAttachment[],
  onPartialText?: OnPartialText,
): Promise<ConversationResult> {
  const { store, llm } = getBridgeContext();
  const sessionId = binding.codepilotSessionId;

  // Acquire session lock
  const lockId = crypto.randomBytes(8).toString('hex');
  const lockAcquired = store.acquireSessionLock(sessionId, lockId, `bridge-${binding.channelType}`, 600);
  if (!lockAcquired) {
    return {
      responseText: '',
      tokenUsage: null,
      hasError: true,
      errorMessage: 'Session is busy processing another request',
      permissionRequests: [],
      sdkSessionId: null,
    };
  }

  store.setSessionRuntimeStatus(sessionId, 'running');

  // Lock renewal interval
  const renewalInterval = setInterval(() => {
    try { store.renewSessionLock(sessionId, lockId, 600); } catch { /* best effort */ }
  }, 60_000);

  try {
    // Resolve session early — needed for workingDirectory and provider resolution
    const session = store.getSession(sessionId);

    // Save user message — persist file attachments to disk using the same
    // <!--files:JSON--> format as the desktop chat route, so the UI can render them.
    let savedContent = text;
    if (files && files.length > 0) {
      const workDir = binding.workingDirectory || session?.working_directory || '';
      if (workDir) {
        try {
          const uploadDir = path.join(workDir, '.codepilot-uploads');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          const fileMeta = files.map((f) => {
            const safeName = path.basename(f.name).replace(/[^a-zA-Z0-9._-]/g, '_');
            const filePath = path.join(uploadDir, `${Date.now()}-${safeName}`);
            const buffer = Buffer.from(f.data, 'base64');
            fs.writeFileSync(filePath, buffer);
            return { id: f.id, name: f.name, type: f.type, size: buffer.length, filePath };
          });
          savedContent = `<!--files:${JSON.stringify(fileMeta)}-->${text}`;
        } catch (err) {
          console.warn('[conversation-engine] Failed to persist file attachments:', err instanceof Error ? err.message : err);
          savedContent = `[${files.length} image(s) attached] ${text}`;
        }
      } else {
        savedContent = `[${files.length} image(s) attached] ${text}`;
      }
    }
    store.addMessage(sessionId, 'user', savedContent);

    // Resolve provider
    let resolvedProvider: import('./host').BridgeApiProvider | undefined;
    const providerId = session?.provider_id || '';
    if (providerId && providerId !== 'env') {
      resolvedProvider = store.getProvider(providerId);
    }
    if (!resolvedProvider) {
      const defaultId = store.getDefaultProviderId();
      if (defaultId) resolvedProvider = store.getProvider(defaultId);
    }

    // Effective model
    const effectiveModel = binding.model || session?.model || store.getSetting('default_model') || undefined;

    // Permission mode from binding mode
    let permissionMode: string;
    switch (binding.mode) {
      case 'plan': permissionMode = 'plan'; break;
      case 'ask': permissionMode = 'default'; break;
      default: permissionMode = 'acceptEdits'; break;
    }

    // Load conversation history for context
    const { messages: recentMsgs } = store.getMessages(sessionId, { limit: 50 });
    const historyMsgs = recentMsgs.slice(0, -1).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const abortController = new AbortController();
    if (abortSignal) {
      if (abortSignal.aborted) {
        abortController.abort();
      } else {
        abortSignal.addEventListener('abort', () => abortController.abort(), { once: true });
      }
    }

    const stream = llm.streamChat({
      prompt: text,
      sessionId,
      sdkSessionId: binding.sdkSessionId || undefined,
      model: effectiveModel,
      systemPrompt: session?.system_prompt || undefined,
      workingDirectory: binding.workingDirectory || session?.working_directory || undefined,
      abortController,
      permissionMode,
      provider: resolvedProvider,
      conversationHistory: historyMsgs,
      files,
      onRuntimeStatusChange: (status: string) => {
        try { store.setSessionRuntimeStatus(sessionId, status); } catch { /* best effort */ }
      },
    });

    // Consume the stream server-side (replicate collectStreamResponse pattern).
    // Permission requests are forwarded immediately via the callback during streaming
    // because the stream blocks until permission is resolved — we can't wait until after.
    return await consumeStream(stream, sessionId, onPermissionRequest, onPartialText);
  } finally {
    clearInterval(renewalInterval);
    store.releaseSessionLock(sessionId, lockId);
    store.setSessionRuntimeStatus(sessionId, 'idle');
  }
}

/**
 * Consume an SSE stream and extract response data.
 * Mirrors the collectStreamResponse() logic from chat/route.ts.
 */
async function consumeStream(
  stream: ReadableStream<string>,
  sessionId: string,
  onPermissionRequest?: OnPermissionRequest,
  onPartialText?: OnPartialText,
): Promise<ConversationResult> {
  const { store } = getBridgeContext();
  const reader = stream.getReader();
  const contentBlocks: MessageContentBlock[] = [];
  let currentText = '';
  /** User-facing assistant text shown in the streaming preview. */
  let previewUserText = '';
  /** Transient detailed tool log shown above the user-facing assistant text. */
  let previewToolLog = '';
  let tokenUsage: TokenUsage | null = null;
  let hasError = false;
  let errorMessage = '';
  const seenToolResultIds = new Set<string>();
  const toolCalls = new Map<string, { name: string; input: unknown }>();
  const summarizedToolUseIds = new Set<string>();
  const permissionRequests: PermissionRequestInfo[] = [];
  let capturedSdkSessionId: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = value.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        let event: SSEEvent;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        switch (event.type) {
          case 'text':
            currentText += event.data;
            if (onPartialText) {
              previewUserText = appendPreviewUserText(previewUserText, event.data);
              previewToolLog = '';
              try { onPartialText(renderPreview(previewUserText, previewToolLog)); } catch { /* non-critical */ }
            }
            break;

          case 'tool_use': {
            if (currentText.trim()) {
              contentBlocks.push({ type: 'text', text: currentText });
              currentText = '';
            }
            try {
              const toolData = JSON.parse(event.data);
              contentBlocks.push({
                type: 'tool_use',
                id: toolData.id,
                name: toolData.name,
                input: toolData.input,
              });
              toolCalls.set(String(toolData.id || ''), {
                name: String(toolData.name || 'tool'),
                input: toolData.input,
              });
              const summary = formatToolSummaryForPreview(toolData.name, toolData.input);
              if (summary) {
                previewUserText = appendPreviewSummary(previewUserText, summary);
              }
              if (onPartialText) {
                previewToolLog = formatToolUseForPreview(toolData.name, toolData.input);
                try { onPartialText(renderPreview(previewUserText, previewToolLog), { force: true }); } catch { /* non-critical */ }
              }
            } catch { /* skip */ }
            break;
          }

          case 'tool_result': {
            try {
              const resultData = JSON.parse(event.data);
              const newBlock = {
                type: 'tool_result' as const,
                tool_use_id: resultData.tool_use_id,
                content: resultData.content,
                is_error: resultData.is_error || false,
              };
              if (seenToolResultIds.has(resultData.tool_use_id)) {
                const idx = contentBlocks.findIndex(
                  (b) => b.type === 'tool_result' && 'tool_use_id' in b && b.tool_use_id === resultData.tool_use_id
                );
                if (idx >= 0) contentBlocks[idx] = newBlock;
              } else {
                seenToolResultIds.add(resultData.tool_use_id);
                contentBlocks.push(newBlock);
              }
              const toolUseId = String(resultData.tool_use_id || '');
              if (toolUseId && !summarizedToolUseIds.has(toolUseId)) {
                summarizedToolUseIds.add(toolUseId);
                const tool = toolCalls.get(toolUseId);
                const summary = formatToolResultSummaryForPreview(
                  tool?.name,
                  tool?.input,
                  resultData.content,
                  resultData.is_error || false,
                );
                if (summary) {
                  previewUserText = appendPreviewSummary(previewUserText, summary);
                }
              }
              if (onPartialText) {
                previewToolLog += formatToolResultForPreview(resultData.content, resultData.is_error || false);
                try { onPartialText(renderPreview(previewUserText, previewToolLog), { force: true }); } catch { /* non-critical */ }
              }
            } catch { /* skip */ }
            break;
          }

          case 'permission_request': {
            try {
              const permData = JSON.parse(event.data);
              const perm: PermissionRequestInfo = {
                permissionRequestId: permData.permissionRequestId,
                toolName: permData.toolName,
                toolInput: permData.toolInput,
                suggestions: permData.suggestions,
              };
              permissionRequests.push(perm);
              // Forward immediately — the stream blocks until the permission is
              // resolved, so we must send the IM prompt *now*, not after the stream ends.
              if (onPermissionRequest) {
                onPermissionRequest(perm).catch((err) => {
                  console.error('[conversation-engine] Failed to forward permission request:', err);
                });
              }
            } catch { /* skip */ }
            break;
          }

          case 'status': {
            try {
              const statusData = JSON.parse(event.data);
              if (statusData.session_id) {
                capturedSdkSessionId = statusData.session_id;
                store.updateSdkSessionId(sessionId, statusData.session_id);
              }
              if (statusData.model) {
                store.updateSessionModel(sessionId, statusData.model);
              }
            } catch { /* skip */ }
            break;
          }

          case 'task_update': {
            try {
              const taskData = JSON.parse(event.data);
              if (taskData.session_id && taskData.todos) {
                store.syncSdkTasks(taskData.session_id, taskData.todos);
              }
            } catch { /* skip */ }
            break;
          }

          case 'error':
            hasError = true;
            errorMessage = event.data || 'Unknown error';
            break;

          case 'result': {
            try {
              const resultData = JSON.parse(event.data);
              if (resultData.usage) tokenUsage = resultData.usage;
              if (resultData.is_error) hasError = true;
              if (resultData.session_id) {
                capturedSdkSessionId = resultData.session_id;
                store.updateSdkSessionId(sessionId, resultData.session_id);
              }
            } catch { /* skip */ }
            break;
          }

          // tool_output, tool_timeout, mode_changed, done — ignored for bridge
        }
      }
    }

    // Flush remaining text
    if (currentText.trim()) {
      contentBlocks.push({ type: 'text', text: currentText });
    }

    // Save assistant message
    if (contentBlocks.length > 0) {
      const hasToolBlocks = contentBlocks.some(
        (b) => b.type === 'tool_use' || b.type === 'tool_result'
      );
      const content = hasToolBlocks
        ? JSON.stringify(contentBlocks)
        : contentBlocks
            .filter((b): b is Extract<MessageContentBlock, { type: 'text' }> => b.type === 'text')
            .map((b) => b.text)
            .join('\n\n')
            .trim();

      if (content) {
        store.addMessage(sessionId, 'assistant', content, tokenUsage ? JSON.stringify(tokenUsage) : null);
      }
    }

    // Extract text-only response for IM delivery
    const responseText = contentBlocks
      .filter((b): b is Extract<MessageContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .map((text) => text.trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();

    return {
      responseText,
      tokenUsage,
      hasError,
      errorMessage,
      permissionRequests,
      sdkSessionId: capturedSdkSessionId,
      previewText: (previewUserText || responseText).trim(),
    };
  } catch (e) {
    // Best-effort save on stream error
    if (currentText.trim()) {
      contentBlocks.push({ type: 'text', text: currentText });
    }
    if (contentBlocks.length > 0) {
      const hasToolBlocks = contentBlocks.some(
        (b) => b.type === 'tool_use' || b.type === 'tool_result'
      );
      const content = hasToolBlocks
        ? JSON.stringify(contentBlocks)
        : contentBlocks
            .filter((b): b is Extract<MessageContentBlock, { type: 'text' }> => b.type === 'text')
            .map((b) => b.text)
            .join('\n\n')
            .trim();
      if (content) {
        store.addMessage(sessionId, 'assistant', content);
      }
    }

    const isAbort = e instanceof DOMException && e.name === 'AbortError'
      || e instanceof Error && e.name === 'AbortError';

    return {
      responseText: '',
      tokenUsage,
      hasError: true,
      errorMessage: isAbort ? 'Task stopped by user' : (e instanceof Error ? e.message : 'Stream consumption error'),
      permissionRequests,
      sdkSessionId: capturedSdkSessionId,
      previewText: previewUserText.trim(),
    };
  }
}

function renderPreview(userText: string, toolLog: string): string {
  const tools = toolLog.trim();
  const user = userText.trim();
  if (tools && user) return `**工具调用**\n${tools}\n\n---\n\n${user}`;
  if (tools) return `**工具调用**\n${tools}`;
  return user;
}

function appendPreviewUserText(current: string, next: unknown): string {
  const text = String(next ?? '').trim();
  if (!text) return current;
  if (!current.trim()) return text;
  return `${current.trimEnd()}\n\n${text}`;
}

function formatToolUseForPreview(name: unknown, input: unknown): string {
  const renderedInput = truncateForPreview(safeJson(input), 1800);
  return `\n▶️ **${String(name || 'tool')}**\n\`\`\`json\n${renderedInput}\n\`\`\`\n`;
}

function formatToolResultForPreview(content: unknown, isError: boolean): string {
  const label = isError ? '❌ 结果' : '✅ 结果';
  const renderedContent = truncateForPreview(
    typeof content === 'string' ? content : safeJson(content),
    2200,
  );
  return `${label}\n\`\`\`\n${renderedContent}\n\`\`\`\n`;
}

function appendPreviewSummary(current: string, next: string): string {
  const text = next.trim();
  if (!text) return current;
  if (!current.trim()) return text;
  const lines = new Set(current.split('\n').map((line) => line.trim()).filter(Boolean));
  if (lines.has(text)) return current;
  return `${current.trimEnd()}\n${text}`;
}

function formatToolSummaryForPreview(name: unknown, input: unknown): string {
  const toolName = String(name || 'tool');
  const inputRecord = isRecord(input) ? input : {};
  const target = getToolTarget(inputRecord);

  switch (toolName) {
    case 'Bash':
      return target ? `- 运行了 ${target}` : '- 运行了命令';
    case 'Write':
      return target ? `- 创建了 ${target}` : '- 创建了文件';
    case 'Edit':
    case 'MultiEdit':
      return formatEditSummary(toolName, inputRecord, target);
    case 'Read':
      return target ? `- 打开了 ${target}` : '- 打开了文件';
    case 'LS':
      return target ? `- 打开了 ${target}` : '- 打开了目录';
    case 'Glob':
    case 'Grep':
      return target ? `- 检索了 ${target}` : '- 检索了项目';
    default:
      if (target) return `- 调用了 ${toolName}: ${target}`;
      return `- 调用了 ${toolName}`;
  }
}

function formatToolResultSummaryForPreview(
  name: unknown,
  input: unknown,
  content: unknown,
  isError: boolean,
): string {
  if (isError) {
    const toolName = String(name || 'tool');
    return `- ${toolName} 调用失败`;
  }

  const text = typeof content === 'string' ? content : safeJson(content);
  const created = matchFirstPath(text, /\b(?:created|create|wrote|written)\s+(?:file\s+)?([^\s"'`]+)/i);
  if (created) return `- 创建了 ${created}`;

  const modified = matchFirstPath(text, /\b(?:modified|updated|edited)\s+(?:file\s+)?([^\s"'`]+)/i);
  if (modified) return `- 修改了 ${modified}`;

  return '';
}

function formatEditSummary(toolName: string, input: Record<string, unknown>, target: string): string {
  const editStats = toolName === 'MultiEdit'
    ? summarizeMultiEditStats(input.edits)
    : summarizeEditStats(input.old_string, input.new_string);
  const stats = editStats ? ` ${editStats}` : '';
  return target ? `- 修改了 ${target}${stats}` : `- 修改了文件${stats}`;
}

function summarizeMultiEditStats(edits: unknown): string {
  if (!Array.isArray(edits)) return '';
  let added = 0;
  let removed = 0;
  for (const edit of edits) {
    if (!isRecord(edit)) continue;
    const stats = countLineDelta(edit.old_string, edit.new_string);
    added += stats.added;
    removed += stats.removed;
  }
  return formatLineDelta(added, removed);
}

function summarizeEditStats(oldValue: unknown, newValue: unknown): string {
  const stats = countLineDelta(oldValue, newValue);
  return formatLineDelta(stats.added, stats.removed);
}

function countLineDelta(oldValue: unknown, newValue: unknown): { added: number; removed: number } {
  const oldLines = typeof oldValue === 'string' && oldValue.length > 0 ? oldValue.split('\n').length : 0;
  const newLines = typeof newValue === 'string' && newValue.length > 0 ? newValue.split('\n').length : 0;
  return {
    added: Math.max(newLines - oldLines, 0),
    removed: Math.max(oldLines - newLines, 0),
  };
}

function formatLineDelta(added: number, removed: number): string {
  if (added === 0 && removed === 0) return '';
  const parts = [];
  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`-${removed}`);
  return parts.join(' ');
}

function getToolTarget(input: Record<string, unknown>): string {
  const value = input.file_path
    ?? input.path
    ?? input.pattern
    ?? input.command
    ?? input.notebook_path
    ?? input.url;
  return typeof value === 'string' ? truncateForPreview(value, 160).replace(/\n/g, ' ') : '';
}

function matchFirstPath(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match?.[1] ? truncateForPreview(match[1], 160).replace(/\n/g, ' ') : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateForPreview(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…` : text;
}
