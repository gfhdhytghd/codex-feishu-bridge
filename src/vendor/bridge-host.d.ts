import type { ChannelBinding, ChannelType } from './bridge-types.js';

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string;
  filePath?: string;
}

export interface BridgeSession {
  id: string;
  working_directory: string;
  model: string;
  system_prompt?: string;
  provider_id?: string;
}

export interface BridgeMessage {
  role: string;
  content: string;
}

export interface BridgeApiProvider {
  id: string;
  [key: string]: unknown;
}

export interface AuditLogInput {
  channelType: string;
  chatId: string;
  direction: 'inbound' | 'outbound';
  messageId: string;
  summary: string;
}

export interface PermissionLinkInput {
  permissionRequestId: string;
  channelType: string;
  chatId: string;
  messageId: string;
  toolName: string;
  suggestions: string;
}

export interface PermissionLinkRecord {
  permissionRequestId: string;
  chatId: string;
  messageId: string;
  resolved: boolean;
  suggestions: string;
}

export interface OutboundRefInput {
  channelType: string;
  chatId: string;
  codepilotSessionId: string;
  platformMessageId: string;
  purpose: string;
}

export interface UpsertChannelBindingInput {
  channelType: string;
  chatId: string;
  codepilotSessionId: string;
  workingDirectory: string;
  model: string;
}

export interface BridgeStore {
  getSetting(key: string): string | null;
  getChannelBinding(channelType: string, chatId: string): ChannelBinding | null;
  upsertChannelBinding(data: UpsertChannelBindingInput): ChannelBinding;
  updateChannelBinding(id: string, updates: Partial<ChannelBinding>): void;
  listChannelBindings(channelType?: ChannelType): ChannelBinding[];
  getSession(id: string): BridgeSession | null;
  createSession(name: string, model: string, systemPrompt?: string, cwd?: string, mode?: string): BridgeSession;
  updateSessionProviderId(sessionId: string, providerId: string): void;
  addMessage(sessionId: string, role: string, content: string, usage?: string | null): void;
  getMessages(sessionId: string, opts?: { limit?: number }): { messages: BridgeMessage[] };
  acquireSessionLock(sessionId: string, lockId: string, owner: string, ttlSecs: number): boolean;
  renewSessionLock(sessionId: string, lockId: string, ttlSecs: number): void;
  releaseSessionLock(sessionId: string, lockId: string): void;
  setSessionRuntimeStatus(sessionId: string, status: string): void;
  updateSdkSessionId(sessionId: string, sdkSessionId: string): void;
  updateSessionModel(sessionId: string, model: string): void;
  syncSdkTasks(sessionId: string, todos: unknown): void;
  getProvider(id: string): BridgeApiProvider | undefined;
  getDefaultProviderId(): string | null;
  insertAuditLog(entry: AuditLogInput): void;
  checkDedup(key: string): boolean;
  insertDedup(key: string): void;
  cleanupExpiredDedup(): void;
  insertOutboundRef(ref: OutboundRefInput): void;
  insertPermissionLink(link: PermissionLinkInput): void;
  getPermissionLink(permissionRequestId: string): PermissionLinkRecord | null;
  markPermissionLinkResolved(permissionRequestId: string): boolean;
  getChannelOffset(key: string): string;
  setChannelOffset(key: string, offset: string): void;
}

export interface StreamChatParams {
  prompt: string;
  sessionId: string;
  sdkSessionId?: string;
  model?: string;
  systemPrompt?: string;
  workingDirectory?: string;
  abortController?: AbortController;
  permissionMode?: string;
  provider?: BridgeApiProvider;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  files?: FileAttachment[];
  onRuntimeStatusChange?: (status: string) => void;
}

export interface LLMProvider {
  streamChat(params: StreamChatParams): ReadableStream<string>;
}

export interface PermissionResolution {
  behavior: 'allow' | 'deny';
  message?: string;
  updatedPermissions?: unknown[];
}

export interface PermissionGateway {
  resolvePendingPermission(permissionRequestId: string, resolution: PermissionResolution): boolean;
}

export interface LifecycleHooks {
  onBridgeStart?(): void;
  onBridgeStop?(): void;
}
