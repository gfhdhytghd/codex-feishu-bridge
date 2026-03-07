import path from 'node:path';

export type PermissionPolicy = 'always' | 'smart' | 'never';

export interface PermissionDecision {
  behavior: 'allow' | 'ask';
  reason: string;
}

interface PermissionDecisionInput {
  policy?: PermissionPolicy;
  toolName: string;
  input: Record<string, unknown>;
  workingDirectory?: string;
}

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS']);
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

const SAFE_BASH_PREFIXES = [
  'pwd',
  'ls',
  'stat',
  'head',
  'tail',
  'cat',
  'sed -n',
  'grep ',
  'rg ',
  'find ',
  'wc ',
  'git status',
  'git diff',
  'git log',
  'git show',
  'git branch',
  'git rev-parse',
  'git remote -v',
  'git stash list',
  'npm test',
  'npm run test',
  'npm run build',
  'npm run lint',
  'npm run typecheck',
  'pnpm test',
  'pnpm build',
  'pnpm lint',
  'yarn test',
  'yarn build',
  'yarn lint',
  'pytest',
  'cargo test',
  'cargo check',
  'go test',
  'go build',
  'tsc --noemit',
  'eslint ',
  'ruff check',
];

const DANGEROUS_BASH_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|\s)(rm|mv|cp|install|mkdir|rmdir|touch|truncate)(\s|$)/, reason: 'shell command mutates files or directories' },
  { pattern: /(^|\s)(chmod|chown|chgrp|xattr)(\s|$)/, reason: 'shell command changes permissions or ownership' },
  { pattern: /(^|\s)(sudo|su|doas)(\s|$)/, reason: 'shell command requests elevated privileges' },
  { pattern: /(^|\s)(launchctl|osascript|sqlite3|defaults)(\s|$)/, reason: 'shell command can control system state or protected macOS data' },
  { pattern: /(^|\s)(kill|pkill|killall|shutdown|reboot)(\s|$)/, reason: 'shell command can interrupt or stop processes and services' },
  { pattern: /(^|\s)(diskutil|fdisk|mount|umount|mkfs|dd)(\s|$)/, reason: 'shell command can modify disks or mounts' },
  { pattern: /(^|\s)(nc|netcat|ftp|sftp|scp|rsync|ssh|telnet)(\s|$)/, reason: 'shell command can open stateful network sessions or transfer local data' },
  { pattern: /(^|\s)(brew|apt|apt-get|yum|dnf|pacman)(\s|$)/, reason: 'shell command installs or removes software' },
  { pattern: /(^|\s)(npm|pnpm|yarn|pip|pip3)(\s)+(install|add|remove|uninstall|update|upgrade|publish)\b/, reason: 'package manager command changes dependencies or publishes artifacts' },
  { pattern: /(^|\s)git(\s)+(commit|push|tag|merge|rebase|reset|clean|checkout|switch|restore|cherry-pick|stash(\s)+(push|pop|apply)|fetch|pull)\b/, reason: 'git command changes repository state or communicates with a remote' },
];

const DANGEROUS_SHELL_TOKENS = ['>', '>>', '|', '&&', '||', ';', '$(', '`'];

const SENSITIVE_PATH_FRAGMENTS = [
  '/.ssh/',
  '/.gnupg/',
  '/.aws/',
  '/.kube/',
  '/.config/',
  '/.claude/',
  '/.codex/',
  '/.cursor/',
  '/library/',
  '/system/',
  '/applications/',
  '/etc/',
  '/private/',
  '/var/db/',
];

const SENSITIVE_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.npmrc',
  '.gitconfig',
  '.zshrc',
  '.bashrc',
  '.bash_profile',
  '.profile',
  '.netrc',
  'id_rsa',
  'id_ed25519',
  'known_hosts',
  'config.env',
]);

const IM_NETWORK_HOSTS = [
  'api.telegram.org',
  'discord.com',
  'discordapp.com',
  'open.feishu.cn',
  'open.larksuite.com',
  'slack.com',
];

const IM_TOOL_HINTS = ['telegram', 'discord', 'feishu', 'lark', 'slack'];
const IM_ACTION_HINTS = ['send', 'post', 'reply', 'notify', 'message', 'chat'];

function normalizePath(value: string, workingDirectory: string): string {
  const expanded = value.startsWith('~/')
    ? path.join(process.env.HOME || '', value.slice(2))
    : value;
  return path.resolve(workingDirectory, expanded);
}

function isSensitivePath(value: string, workingDirectory: string): boolean {
  const normalized = normalizePath(value, workingDirectory);
  const lower = normalized.toLowerCase();
  const base = path.basename(normalized).toLowerCase();
  if (SENSITIVE_BASENAMES.has(base)) return true;
  return SENSITIVE_PATH_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

function isInsideWorkingDirectory(value: string, workingDirectory: string): boolean {
  const normalized = normalizePath(value, workingDirectory);
  const relative = path.relative(workingDirectory, normalized);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function collectCandidatePaths(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCandidatePaths(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') {
    return out;
  }

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string') {
      const lowered = key.toLowerCase();
      if (
        lowered.includes('path')
        || lowered.includes('file')
        || lowered.includes('filename')
        || lowered.includes('directory')
        || lowered === 'cwd'
      ) {
        out.push(child);
      }
      continue;
    }
    collectCandidatePaths(child, out);
  }
  return out;
}

function isLikelyReadOnlyMcpTool(toolName: string): boolean {
  const parts = toolName.split('__');
  const leaf = (parts[parts.length - 1] || '').toLowerCase();
  if (!leaf) return false;
  const readHints = ['get', 'read', 'list', 'search', 'find', 'query', 'show', 'describe', 'inspect', 'fetch', 'stat'];
  const writeHints = ['create', 'update', 'delete', 'remove', 'write', 'edit', 'apply', 'set', 'post', 'send', 'run', 'execute', 'publish'];

  if (writeHints.some((hint) => leaf.includes(hint))) return false;
  return readHints.some((hint) => leaf.includes(hint));
}

function extractUrls(text: string): URL[] {
  const matches = text.match(/https?:\/\/[^\s'"]+/gi) ?? [];
  return matches.flatMap((value) => {
    try {
      return [new URL(value)];
    } catch {
      return [];
    }
  });
}

function isBridgeImUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return IM_NETWORK_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function containsUploadLikeFlags(command: string): boolean {
  return /(^|\s)(-d|--data|--data-raw|--data-binary|--data-urlencode|-f|--form|-t|--upload-file)(\s|=|$)/i.test(command)
    || /(^|\s)(-X|--request)(\s|=)+(POST|post|PUT|put|PATCH|patch|DELETE|delete)\b/.test(command)
    || /(^|\s)(--json)(\s|=|$)/i.test(command);
}

function containsSensitiveAuthFlags(command: string): boolean {
  return /(^|\s)(-u|--user)(\s|=|$)/i.test(command)
    || /(^|\s)(-H|--header)(\s|=)+['"]?(authorization|cookie|x-api-key|x-auth-token|proxy-authorization)\b/i.test(command)
    || /\b(authorization:|cookie:|x-api-key:|x-auth-token:)\b/i.test(command)
    || /https?:\/\/[^/\s]+:[^@\s]+@/i.test(command);
}

function containsLocalUploadReference(command: string): boolean {
  return /(^|\s)@([~./]|[A-Za-z]:\\)/.test(command)
    || /file:\/\//i.test(command)
    || /--data-binary(\s|=)+@/i.test(command)
    || /--upload-file(\s|=)+([~./]|[A-Za-z]:\\)/i.test(command);
}

function isLikelySafeReadOnlyFetch(command: string): boolean {
  const lower = command.toLowerCase();
  if (!/(^|\s)(curl|wget)(\s|$)/.test(lower)) return false;
  if (containsUploadLikeFlags(command) || containsSensitiveAuthFlags(command) || containsLocalUploadReference(command)) {
    return false;
  }
  return true;
}

function decideNetworkCommand(command: string): PermissionDecision {
  const urls = extractUrls(command);
  if (urls.some(isBridgeImUrl) && !containsLocalUploadReference(command)) {
    return { behavior: 'allow', reason: 'network request targets the configured IM platform bridge' };
  }
  if (isLikelySafeReadOnlyFetch(command)) {
    return { behavior: 'allow', reason: 'network request looks like a read-only fetch without local data upload or credentials' };
  }
  if (containsLocalUploadReference(command)) {
    return { behavior: 'ask', reason: 'network request may upload a local file or file-backed payload' };
  }
  if (containsUploadLikeFlags(command)) {
    return { behavior: 'ask', reason: 'network request may send data or modify remote state' };
  }
  if (containsSensitiveAuthFlags(command)) {
    return { behavior: 'ask', reason: 'network request includes explicit credentials or authentication headers' };
  }
  return { behavior: 'ask', reason: 'network request is not clearly read-only' };
}

function isImDeliveryMcpTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return IM_TOOL_HINTS.some((hint) => lower.includes(hint))
    && IM_ACTION_HINTS.some((hint) => lower.includes(hint));
}

function decideWebFetch(input: Record<string, unknown>): PermissionDecision {
  const candidates = [
    typeof input.url === 'string' ? input.url : null,
    typeof input.href === 'string' ? input.href : null,
  ].filter((value): value is string => !!value);
  const urls = candidates.flatMap((value) => {
    try {
      return [new URL(value)];
    } catch {
      return [];
    }
  });

  const method = typeof input.method === 'string' ? input.method.toUpperCase() : 'GET';
  const hasBody = input.body != null || input.json != null || input.formData != null || input.form != null;
  const hasHeaders = !!input.headers || !!input.cookies || !!input.auth || !!input.authorization;

  if (urls.some(isBridgeImUrl)) {
    return { behavior: 'allow', reason: 'network request targets the configured IM platform bridge' };
  }
  if ((method === 'GET' || method === 'HEAD') && !hasBody && !hasHeaders) {
    return { behavior: 'allow', reason: 'web fetch looks read-only and does not include outbound data or credentials' };
  }
  if (hasBody) {
    return { behavior: 'ask', reason: 'web fetch may upload request data to an external service' };
  }
  if (hasHeaders) {
    return { behavior: 'ask', reason: 'web fetch includes explicit headers, cookies, or auth data' };
  }
  if (method !== 'GET' && method !== 'HEAD') {
    return { behavior: 'ask', reason: `web fetch uses ${method}, which may modify remote state` };
  }
  return { behavior: 'ask', reason: 'web fetch is not clearly read-only' };
}

function decideSmartPolicy(toolName: string, input: Record<string, unknown>, workingDirectory: string): PermissionDecision {
  if (READ_ONLY_TOOLS.has(toolName)) {
    return { behavior: 'allow', reason: 'read-only inspection tool' };
  }

  if (EDIT_TOOLS.has(toolName)) {
    const paths = collectCandidatePaths(input);
    if (paths.length === 0) {
      return { behavior: 'ask', reason: 'write-capable tool without an explicit target path' };
    }
    for (const filePath of paths) {
      if (isSensitivePath(filePath, workingDirectory)) {
        return { behavior: 'ask', reason: `write target is sensitive: ${filePath}` };
      }
      if (!isInsideWorkingDirectory(filePath, workingDirectory)) {
        return { behavior: 'ask', reason: `write target is outside the working directory: ${filePath}` };
      }
    }
    return { behavior: 'allow', reason: 'file edit is limited to non-sensitive paths inside the working directory' };
  }

  if (toolName === 'Bash') {
    const command = String(input.command || '').trim();
    if (!command) {
      return { behavior: 'ask', reason: 'shell command is empty or missing' };
    }

    const lower = command.toLowerCase();
    for (const token of DANGEROUS_SHELL_TOKENS) {
      if (lower.includes(token)) {
        return { behavior: 'ask', reason: `shell command contains complex shell control operator: ${token}` };
      }
    }
    if (/(^|\s)(curl|wget)(\s|$)/.test(lower)) {
      return decideNetworkCommand(command);
    }
    for (const entry of DANGEROUS_BASH_PATTERNS) {
      if (entry.pattern.test(lower)) {
        return { behavior: 'ask', reason: entry.reason };
      }
    }
    if (SAFE_BASH_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix} `))) {
      return { behavior: 'allow', reason: 'shell command matches the low-risk allowlist' };
    }
    return { behavior: 'ask', reason: 'shell command is not recognized as low-risk' };
  }

  if (toolName.startsWith('mcp__')) {
    if (isImDeliveryMcpTool(toolName)) {
      return { behavior: 'allow', reason: 'MCP tool posts back to the connected IM platform' };
    }
    if (isLikelyReadOnlyMcpTool(toolName)) {
      return { behavior: 'allow', reason: 'MCP tool name looks read-only' };
    }
    return { behavior: 'ask', reason: 'MCP tool may change external state or expose data' };
  }

  if (toolName === 'WebFetch') {
    return decideWebFetch(input);
  }

  return { behavior: 'ask', reason: `tool ${toolName} is not on the low-risk allowlist` };
}

export function normalizePermissionPolicy(value: string | undefined, autoApprove = false): PermissionPolicy {
  if (value === 'always' || value === 'smart' || value === 'never') {
    return value;
  }
  if (autoApprove) {
    return 'never';
  }
  return 'always';
}

export function approvalPolicyForCodex(policy: PermissionPolicy): 'never' | 'on-request' {
  return policy === 'never' ? 'never' : 'on-request';
}

export function decidePermission(input: PermissionDecisionInput): PermissionDecision {
  const policy = input.policy || 'always';
  if (policy === 'never') {
    return { behavior: 'allow', reason: 'permission policy is set to never prompt' };
  }
  if (policy === 'always') {
    return { behavior: 'ask', reason: 'permission policy is set to always prompt' };
  }

  const workingDirectory = input.workingDirectory
    ? path.resolve(input.workingDirectory)
    : process.cwd();
  return decideSmartPolicy(input.toolName, input.input, workingDirectory);
}
