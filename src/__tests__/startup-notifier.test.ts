import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Config } from '../config.js';
import { formatStartupNotification, resolveStartupTargets } from '../startup-notifier.js';

const baseConfig: Config = {
  runtime: 'codex',
  enabledChannels: ['telegram', 'discord'],
  defaultWorkDir: '/Users/sameral',
  defaultMode: 'code',
  runMode: 'background',
  permissionPolicy: 'smart',
  codexNetworkAccess: true,
  codexSandboxMode: 'danger-full-access',
  tgChatId: 'tg-main',
  discordAllowedChannels: ['dc-ops'],
};

describe('resolveStartupTargets', () => {
  it('deduplicates bindings and merges config-level fallback targets', () => {
    const targets = resolveStartupTargets(baseConfig, {
      listChannelBindings: () => [
        {
          id: '1',
          channelType: 'telegram',
          chatId: 'tg-main',
          codepilotSessionId: 's1',
          sdkSessionId: '',
          workingDirectory: '/tmp',
          model: 'gpt-5',
          mode: 'code',
          active: true,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: '2',
          channelType: 'discord',
          chatId: 'dc-room',
          codepilotSessionId: 's2',
          sdkSessionId: '',
          workingDirectory: '/tmp',
          model: 'gpt-5',
          mode: 'code',
          active: true,
          createdAt: '',
          updatedAt: '',
        },
      ],
    } as never);

    assert.deepEqual(targets, [
      { channelType: 'telegram', chatId: 'tg-main', source: 'config' },
      { channelType: 'discord', chatId: 'dc-room', source: 'binding' },
      { channelType: 'discord', chatId: 'dc-ops', source: 'config' },
    ]);
  });
});

describe('formatStartupNotification', () => {
  it('includes runtime, device, model, and codex runtime details', () => {
    const message = formatStartupNotification({
      config: baseConfig,
      store: {
        listChannelBindings: () => [
          {
            id: '1',
            channelType: 'telegram',
            chatId: 'tg-main',
            codepilotSessionId: 's1',
            sdkSessionId: '',
            workingDirectory: '/tmp',
            model: 'gpt-5',
            mode: 'code',
            active: true,
            createdAt: '',
            updatedAt: '',
          },
        ],
      } as never,
      runId: '12345678-1234-1234-1234-123456789abc',
      startedAt: '2026-03-08T00:00:00.000Z',
      activeRuntime: 'codex',
    });

    assert.match(message, /Bridge online/);
    assert.match(message, /Runtime: Codex/);
    assert.match(message, /Model: runtime default/);
    assert.match(message, /Run mode: background/);
    assert.match(message, /Known chats: telegram:1/);
    assert.match(message, /Codex sandbox: danger-full-access/);
    assert.match(message, /Codex network: enabled/);
    assert.match(message, /Run ID: 12345678/);
  });
});
