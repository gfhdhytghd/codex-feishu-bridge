# Codex-Claude-to-IM Skill

Bridge Codex or Claude Code to Telegram, Discord, and Feishu/Lark so you can chat with your coding agent from IM.

[中文说明](README_CN.md)

This repository contains the full publishable skill package:

- `SKILL.md` for agent discovery
- full source code in `src/`
- platform scripts in `scripts/`
- setup references in `references/`
- tests and build config

## What It Does

The skill runs a background daemon that connects IM messages to Codex or Claude Code sessions.

```text
Telegram / Discord / Feishu
        <-> bot adapter
        <-> background daemon
        <-> Codex SDK or Claude Agent SDK
        <-> your local workspace
```

Main capabilities:

- Telegram, Discord, and Feishu/Lark support
- Codex runtime, Claude runtime, or auto fallback
- permission approval inside chat
- session persistence across daemon restarts
- streaming responses back to IM
- log redaction for secrets
- setup, start, stop, status, logs, reconfigure, doctor workflows
- reuse of existing Codex CLI config, including custom provider `env_key` variables from `~/.codex/config.toml` on macOS launchd installs

## Repository Layout

```text
.
├── SKILL.md
├── README.md
├── README_CN.md
├── config.env.example
├── references/
├── scripts/
├── src/
├── package.json
└── tsconfig.json
```

## Prerequisites

- Node.js 20+
- One runtime:
  - Codex CLI for `CTI_RUNTIME=codex` or `auto`
  - Claude Code CLI for `CTI_RUNTIME=claude` or `auto`
- A bot/app credential for at least one IM platform

Optional but common:

- existing Codex login or API-based provider setup in `~/.codex/config.toml`
- `OPENAI_API_KEY`, `CODEX_API_KEY`, or provider-specific environment variables if your Codex provider requires them

## Installation

### Option 1: Install for Codex

Clone this repository anywhere:

```bash
git clone https://github.com/viewer12/Codex-Claude-to-IM-skill.git ~/code/Codex-Claude-to-IM-skill
```

Install into Codex skills:

```bash
bash ~/code/Codex-Claude-to-IM-skill/scripts/install-codex.sh
```

For development, use symlink mode:

```bash
bash ~/code/Codex-Claude-to-IM-skill/scripts/install-codex.sh --link
```

This installs the skill to:

```bash
~/.codex/skills/claude-to-im
```

### Option 2: Install for Claude Code

Clone directly into the Claude skills directory:

```bash
git clone https://github.com/viewer12/Codex-Claude-to-IM-skill.git ~/.claude/skills/claude-to-im
cd ~/.claude/skills/claude-to-im
npm install
npm run build
```

### Option 3: Manual Codex install

```bash
git clone https://github.com/viewer12/Codex-Claude-to-IM-skill.git ~/.codex/skills/claude-to-im
cd ~/.codex/skills/claude-to-im
npm install
npm run build
```

## Quick Start

### 1. Configure

Inside Codex or Claude Code:

```text
claude-to-im setup
```

Or in Claude Code slash-command style:

```text
/claude-to-im setup
```

If interactive setup is unavailable, create:

```bash
~/.claude-to-im/config.env
```

starting from:

```bash
config.env.example
```

### 2. Start the bridge

```text
claude-to-im start
```

### 3. Send a message to your bot

Once the daemon is running, send a message in Telegram, Discord, or Feishu. The bridge will create or resume an agent session and return results in chat.

## Supported Commands

Use these commands inside Codex or Claude Code:

| Command | Purpose |
|---|---|
| `claude-to-im setup` | Configure platform credentials and runtime |
| `claude-to-im start` | Start the background daemon |
| `claude-to-im stop` | Stop the daemon |
| `claude-to-im status` | Show current process state |
| `claude-to-im logs` | Tail recent logs |
| `claude-to-im logs 200` | Tail more logs |
| `claude-to-im reconfigure` | Update an existing config |
| `claude-to-im doctor` | Run diagnostics |

## Runtime Modes

Set `CTI_RUNTIME` in `~/.claude-to-im/config.env`:

- `codex`: use Codex SDK and Codex CLI
- `claude`: use Claude Agent SDK and Claude Code CLI
- `auto`: try Claude first, then Codex fallback

Important notes for Codex:

- the bridge now skips the Git trust check for IM-managed sessions
- on macOS, the launchd service forwards custom provider secrets declared as `env_key` in `~/.codex/config.toml`
- this allows third-party API-backed Codex providers to work without duplicating credentials in the bridge config

## Minimal Config Example

```env
CTI_RUNTIME=codex
CTI_ENABLED_CHANNELS=telegram
CTI_DEFAULT_WORKDIR=/Users/yourname/project
CTI_DEFAULT_MODE=code
CTI_TG_BOT_TOKEN=123456:your_bot_token
CTI_TG_CHAT_ID=123456789
```

See the full template in [config.env.example](config.env.example).

## Platform Setup Summary

### Telegram

1. Create a bot with `@BotFather`
2. Copy the bot token
3. Send at least one message to the bot
4. Obtain your chat ID or allowed user IDs

### Discord

1. Create an app in Discord Developer Portal
2. Create/reset the bot token
3. Enable Message Content Intent
4. Invite the bot to your server
5. Configure allowed users or allowed channels

### Feishu / Lark

1. Create a custom app
2. Get App ID and App Secret
3. Add required permissions
4. Enable the bot capability
5. Configure long-connection events
6. Publish the app version

Detailed step-by-step text is in:

- [references/setup-guides.md](references/setup-guides.md)
- [references/troubleshooting.md](references/troubleshooting.md)
- [references/usage.md](references/usage.md)

## Local Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Build:

```bash
npm run build
```

Run in dev mode:

```bash
npm run dev
```

## Operations

The daemon stores runtime data in:

```text
~/.claude-to-im/
├── config.env
├── data/
├── logs/bridge.log
└── runtime/status.json
```

Useful shell commands:

```bash
bash scripts/daemon.sh status
bash scripts/daemon.sh logs 100
bash scripts/doctor.sh
```

## Troubleshooting

### Bridge starts but Codex requests fail

Check:

- `bash scripts/doctor.sh`
- your Codex CLI works directly with the same provider
- required provider env vars exist in your shell or launch environment
- `~/.codex/config.toml` points to a valid provider

### Codex works in terminal but not in IM

On macOS, restart the bridge after changing provider-related environment variables so launchd reloads them:

```bash
bash scripts/daemon.sh stop
bash scripts/daemon.sh start
```

### No configuration found

Create:

```bash
~/.claude-to-im/config.env
```

from:

```bash
config.env.example
```

### Logs

Check:

```bash
~/.claude-to-im/logs/bridge.log
```

## Security

- bot tokens are stored in `~/.claude-to-im/config.env`
- the config file should stay at permission mode `600`
- logs redact common secret patterns
- review allowed users/channels before exposing the bot publicly

See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
