import type { FileAttachment } from './bridge-host.js';

export type ChannelType = string;

export interface ChannelBinding {
  id: string;
  channelType: ChannelType;
  chatId: string;
  codepilotSessionId: string;
  sdkSessionId: string;
  workingDirectory: string;
  model: string;
  mode: 'code' | 'plan' | 'ask';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InboundMessage {
  messageId: string;
  address: {
    channelType: ChannelType;
    chatId: string;
    userId?: string;
    displayName?: string;
  };
  text: string;
  timestamp: number;
  callbackData?: string;
  callbackMessageId?: string;
  raw?: unknown;
  updateId?: number;
  attachments?: FileAttachment[];
}
