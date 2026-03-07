# Codex-Claude-to-IM Skill

Bridge Codex or Claude Code to Telegram, Discord, and Feishu/Lark so you can chat with your coding agent from IM.

[中文说明](README_CN.md)

> Derived from [op7418/Claude-to-IM-skill](https://github.com/op7418/Claude-to-IM-skill), published under the MIT License. This repository keeps the original MIT license notice and adds packaging, documentation, and compatibility updates for direct reuse.

## Start Here

Choose the path that matches your tool:

- **I use Codex**
  Go to [For Codex Users](#for-codex-users)
- **I use Claude Code**
  Go to [For Claude Code Users](#for-claude-code-users)
- **I want to compare both**
  Go to [Runtime Modes](#runtime-modes)
- **I only need platform setup**
  Go to [Platform Setup](#platform-setup)
- **I want to develop or modify the project**
  Go to [Development](#development)

## What This Repository Includes

- `SKILL.md` for agent discovery
- full source code in `src/`
- scripts in `scripts/`
- setup guides in `references/`
- tests, build config, and packaging files

## For Codex Users

### 1. Install

Recommended:

```bash
git clone https://github.com/viewer12/Codex-Claude-to-IM-skill.git ~/code/Codex-Claude-to-IM-skill
bash ~/code/Codex-Claude-to-IM-skill/scripts/install-codex.sh
```

Development symlink mode:

```bash
bash ~/code/Codex-Claude-to-IM-skill/scripts/install-codex.sh --link
```

Manual install:

```bash
git clone https://github.com/viewer12/Codex-Claude-to-IM-skill.git ~/.codex/skills/claude-to-im
cd ~/.codex/skills/claude-to-im
npm install
npm run build
```

### 2. Configure

Inside Codex:

```text
claude-to-im setup
```

If interactive setup is unavailable, create:

```bash
~/.claude-to-im/config.env
```

from:

```bash
config.env.example
```

### 3. Start

Inside Codex:

```text
claude-to-im start
```

### Codex-Specific Notes

- Set `CTI_RUNTIME=codex` to force Codex
- The bridge skips the Git trust check for IM-managed Codex sessions
- On macOS, launchd automatically forwards custom provider secrets declared as `env_key` in `~/.codex/config.toml`
- This means third-party Codex API providers can usually be reused without duplicating credentials in the bridge config

## For Claude Code Users

### 1. Install

```bash
git clone https://github.com/viewer12/Codex-Claude-to-IM-skill.git ~/.claude/skills/claude-to-im
cd ~/.claude/skills/claude-to-im
npm install
npm run build
```

### 2. Configure

Inside Claude Code:

```text
/claude-to-im setup
```

If interactive setup is unavailable, create:

```bash
~/.claude-to-im/config.env
```

from:

```bash
config.env.example
```

### 3. Start

Inside Claude Code:

```text
/claude-to-im start
```

## Shared User Flow

After setup and start:

1. Send a message to your Telegram, Discord, or Feishu bot
2. The daemon creates or resumes an agent session
3. Responses, tool calls, and permission prompts return to chat

## Commands

Use these commands inside Codex or Claude Code:

| Command | Purpose |
|---|---|
| `claude-to-im setup` | Configure platform credentials and runtime |
| `claude-to-im start` | Start the daemon |
| `claude-to-im stop` | Stop the daemon |
| `claude-to-im status` | Show current status |
| `claude-to-im logs` | Tail recent logs |
| `claude-to-im logs 200` | Tail more logs |
| `claude-to-im reconfigure` | Update existing config |
| `claude-to-im doctor` | Run diagnostics |

Claude Code users can also use slash-command form:

```text
/claude-to-im setup
/claude-to-im start
/claude-to-im stop
```

## Runtime Modes

Set `CTI_RUNTIME` in `~/.claude-to-im/config.env`:

- `codex`: use Codex SDK and Codex CLI
- `claude`: use Claude Agent SDK and Claude Code CLI
- `auto`: try Claude first, then Codex fallback

## Prerequisites

- Node.js 20+
- At least one runtime installed:
  - Codex CLI for `codex` or `auto`
  - Claude Code CLI for `claude` or `auto`
- Bot/app credentials for at least one IM platform

Optional but common:

- existing Codex login or provider setup in `~/.codex/config.toml`
- `OPENAI_API_KEY`, `CODEX_API_KEY`, or provider-specific environment variables

## Minimal Config Example

```env
CTI_RUNTIME=codex
CTI_ENABLED_CHANNELS=telegram
CTI_DEFAULT_WORKDIR=/Users/yourname/project
CTI_DEFAULT_MODE=code
CTI_TG_BOT_TOKEN=123456:your_bot_token
CTI_TG_CHAT_ID=123456789
```

Full template:

- [config.env.example](config.env.example)

## Platform Setup

### Telegram

1. Create a bot with `@BotFather`
2. Copy the bot token
3. Send at least one message to the bot
4. Obtain your chat ID or allowed user IDs

### Discord

1. Create an app in Discord Developer Portal
2. Create or reset the bot token
3. Enable Message Content Intent
4. Invite the bot to your server
5. Configure allowed users or channels

### Feishu / Lark

1. Create a custom app
2. Get App ID and App Secret
3. Add required permissions
4. Enable the bot capability
5. Configure long-connection events
6. Publish the app version

Detailed guides:

- [references/setup-guides.md](references/setup-guides.md)
- [references/usage.md](references/usage.md)
- [references/troubleshooting.md](references/troubleshooting.md)

## Operations

Runtime data is stored in:

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

### Codex works in terminal but not in IM

Restart the bridge so the service reloads environment variables:

```bash
bash scripts/daemon.sh stop
bash scripts/daemon.sh start
```

### Bridge starts but agent requests fail

Check:

- `bash scripts/doctor.sh`
- your runtime CLI works directly
- required provider env vars exist
- `~/.codex/config.toml` or Claude auth is valid

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

```bash
~/.claude-to-im/logs/bridge.log
```

## Development

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

Run dev mode:

```bash
npm run dev
```

## Upstream and License

Original upstream project:

- [op7418/Claude-to-IM-skill](https://github.com/op7418/Claude-to-IM-skill)

This repository is a redistribution and modification of that MIT-licensed project. The original copyright notice and license text are preserved in [LICENSE](LICENSE), with an additional modification copyright notice for this repository.

Security notes:

- bot tokens are stored in `~/.claude-to-im/config.env`
- keep that file at permission mode `600`
- logs redact common secret patterns

See:

- [SECURITY.md](SECURITY.md)
- [LICENSE](LICENSE)
