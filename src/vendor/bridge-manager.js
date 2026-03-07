import { start, stop, getStatus } from 'claude-to-im/src/lib/bridge/bridge-manager.js';

const GLOBAL_KEY = '__bridge_manager__';

export { start, stop, getStatus };

export function getRunningAdapters() {
  const state = globalThis[GLOBAL_KEY];
  if (!state?.adapters) return [];
  return Array.from(state.adapters.values()).filter((adapter) => adapter?.isRunning?.());
}
