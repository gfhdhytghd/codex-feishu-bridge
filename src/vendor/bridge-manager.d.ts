import type { BaseChannelAdapter } from 'claude-to-im/src/lib/bridge/channel-adapter.js';
import type { BridgeStatus } from 'claude-to-im/src/lib/bridge/types.js';

export function start(): Promise<void>;
export function stop(): Promise<void>;
export function getStatus(): BridgeStatus;
export function getRunningAdapters(): BaseChannelAdapter[];
