import type {
  BridgeStore,
  LLMProvider,
  PermissionGateway,
  LifecycleHooks,
} from './bridge-host.js';

export interface BridgeContext {
  store: BridgeStore;
  llm: LLMProvider;
  permissions: PermissionGateway;
  lifecycle: LifecycleHooks;
}

export function initBridgeContext(ctx: BridgeContext): void;
export function getBridgeContext(): BridgeContext;
export function hasBridgeContext(): boolean;
