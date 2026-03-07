import os from 'node:os';
import type { Config } from './config.js';
import type { BridgeStore } from './vendor/bridge-host.js';
import type { ChannelBinding } from './vendor/bridge-types.js';

type ActiveRuntime = 'claude' | 'codex';

interface StartupTarget {
  channelType: string;
  chatId: string;
  source: 'binding' | 'config';
}

interface StartupNotificationContext {
  config: Config;
  store: BridgeStore;
  runId: string;
  startedAt: string;
  activeRuntime: ActiveRuntime;
}

function uniqueBindings(bindings: ChannelBinding[]): ChannelBinding[] {
  const seen = new Set<string>();
  return bindings.filter((binding) => {
    const key = `${binding.channelType}:${binding.chatId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveStartupTargets(config: Config, store: BridgeStore): StartupTarget[] {
  const targets = new Map<string, StartupTarget>();

  for (const binding of uniqueBindings(store.listChannelBindings())) {
    if (!binding.active) continue;
    if (!config.enabledChannels.includes(binding.channelType)) continue;
    targets.set(`${binding.channelType}:${binding.chatId}`, {
      channelType: binding.channelType,
      chatId: binding.chatId,
      source: 'binding',
    });
  }

  if (config.enabledChannels.includes('telegram') && config.tgChatId) {
    targets.set(`telegram:${config.tgChatId}`, {
      channelType: 'telegram',
      chatId: config.tgChatId,
      source: 'config',
    });
  }

  for (const channelId of config.discordAllowedChannels || []) {
    if (!channelId) continue;
    targets.set(`discord:${channelId}`, {
      channelType: 'discord',
      chatId: channelId,
      source: 'config',
    });
  }

  return Array.from(targets.values());
}

function runtimeLabel(activeRuntime: ActiveRuntime): string {
  return activeRuntime === 'claude' ? 'Claude Code' : 'Codex';
}

function configuredModelLabel(config: Config): string {
  return config.defaultModel || 'runtime default';
}

function summarizeKnownBindings(config: Config, store: BridgeStore): string {
  const bindings = store
    .listChannelBindings()
    .filter((binding) => binding.active && config.enabledChannels.includes(binding.channelType));

  if (bindings.length === 0) return '0 known chats';

  const counts = new Map<string, number>();
  for (const binding of bindings) {
    counts.set(binding.channelType, (counts.get(binding.channelType) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([channelType, count]) => `${channelType}:${count}`)
    .join(', ');
}

export function formatStartupNotification(context: StartupNotificationContext): string {
  const { config, store, runId, startedAt, activeRuntime } = context;
  const hostname = os.hostname();
  const username = os.userInfo().username;
  const lines = [
    'Bridge online',
    '',
    'Status: connected',
    `Runtime: ${runtimeLabel(activeRuntime)}`,
    `Model: ${configuredModelLabel(config)}`,
    `Run mode: ${config.runMode}`,
    `Channels: ${config.enabledChannels.join(', ') || 'none'}`,
    `Known chats: ${summarizeKnownBindings(config, store)}`,
    `Device: ${hostname} (${os.platform()} ${os.release()} ${os.arch()})`,
    `User: ${username}`,
    `Default workdir: ${config.defaultWorkDir}`,
    `PID: ${process.pid}`,
    `Run ID: ${runId.slice(0, 8)}`,
    `Started at: ${startedAt}`,
  ];

  if (activeRuntime === 'codex') {
    lines.push(`Codex sandbox: ${config.codexSandboxMode}`);
    lines.push(`Codex network: ${config.codexNetworkAccess ? 'enabled' : 'disabled'}`);
  }

  lines.push('Delivery check: if you received this message, outbound IM delivery is working.');

  return lines.join('\n');
}

export async function sendStartupNotifications(context: StartupNotificationContext): Promise<void> {
  const targets = resolveStartupTargets(context.config, context.store);
  if (targets.length === 0) {
    console.log('[claude-to-im] No startup notification targets available');
    return;
  }

  const { deliver } = await import('./vendor/bridge-delivery.js');
  const { getRunningAdapters } = await import('./vendor/bridge-manager.js');

  const adapters = new Map(
    getRunningAdapters().map((adapter) => [adapter.channelType, adapter]),
  );
  const message = formatStartupNotification(context);

  for (const target of targets) {
    const adapter = adapters.get(target.channelType);
    if (!adapter) {
      console.log(`[claude-to-im] Skipping startup notification for ${target.channelType}:${target.chatId} (adapter unavailable)`);
      continue;
    }

    try {
      const result = await deliver(adapter, {
        address: {
          channelType: target.channelType,
          chatId: target.chatId,
        },
        text: message,
        parseMode: 'plain',
      }, {
        dedupKey: `startup:${context.runId}:${target.channelType}:${target.chatId}`,
      });

      if (!result.ok) {
        console.warn(
          `[claude-to-im] Startup notification failed for ${target.channelType}:${target.chatId}: ${result.error || 'unknown error'}`,
        );
        continue;
      }

      console.log(
        `[claude-to-im] Startup notification sent to ${target.channelType}:${target.chatId} (${target.source})`,
      );
    } catch (err) {
      console.warn(
        `[claude-to-im] Startup notification error for ${target.channelType}:${target.chatId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
