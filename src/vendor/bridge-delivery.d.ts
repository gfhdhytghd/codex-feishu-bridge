import type { BaseChannelAdapter } from 'claude-to-im/src/lib/bridge/channel-adapter.js';
import type { OutboundMessage, SendResult } from 'claude-to-im/src/lib/bridge/types.js';

export function deliver(
  adapter: BaseChannelAdapter,
  message: OutboundMessage,
  opts?: {
    sessionId?: string;
    dedupKey?: string;
  },
): Promise<SendResult>;
