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
codex-to-im setup
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
codex-to-im start
```

If you want plain `start` to run in the current foreground Terminal session instead of a background supervisor, add this to `~/.claude-to-im/config.env`:

```env
CTI_RUN_MODE=foreground
```

### Codex-Specific Notes

- Set `CTI_RUNTIME=codex` to force Codex
- Codex bridge sessions enable network access by default; set `CTI_CODEX_NETWORK_ACCESS=false` if you need offline-only behavior
- Codex bridge sessions default to `CTI_CODEX_SANDBOX_MODE=danger-full-access` in this fork so browser / AppleScript / desktop automation can work on a trusted personal machine
- The bridge skips the Git trust check for IM-managed Codex sessions
- On macOS, the default background mode uses a per-user `launchd` LaunchAgent in `gui/<uid>`, so it usually still runs inside your logged-in desktop session
- On macOS, launchd automatically forwards custom provider secrets declared as `env_key` in `~/.codex/config.toml`
- This means third-party Codex API providers can usually be reused without duplicating credentials in the bridge config

### Risk Notes For Codex Runtime

- This fork intentionally favors convenience on a trusted personal machine over strict isolation.
- `CTI_CODEX_SANDBOX_MODE=danger-full-access` gives Telegram-driven Codex sessions broad access to local files, GUI automation entrypoints, browsers, and system commands.
- Codex runtime is backed by non-interactive `codex exec`, not the full interactive TUI. As a result, IM-side per-tool approval prompts are limited and should not be treated as a guaranteed security boundary.
- Startup notifications can include hostnames, usernames, workdirs, and other local runtime metadata in IM chats. Only enable the bridge for chats and channels you trust.
- If you need a safer setup, lower `CTI_CODEX_SANDBOX_MODE` to `workspace-write` or `read-only`, and avoid exposing the bot beyond your own account.

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

On startup, the bridge also tries to push a short status message to already-known IM targets when possible. The message includes connection status, device/host info, runtime (`Claude Code` or `Codex`), model label, run mode, channels, PID, run ID, and workdir so you can quickly verify which machine and session came online.

Current startup notification targets are:

- existing active channel bindings
- Telegram `CTI_TG_CHAT_ID` when configured
- Discord `CTI_DISCORD_ALLOWED_CHANNELS` when configured

If a platform does not yet have a reliable outbound target, the bridge skips the startup notification for that platform instead of failing startup.

## Command Aliases

Command aliases decide the bridge runtime explicitly, regardless of which tool you are currently using:

- `codex-to-im ...` forces the bridge to run with Codex runtime for that command
- `claude-to-im ...` forces the bridge to run with Claude runtime for that command
- plain commands like `start bridge` continue to use `CTI_RUNTIME` from `~/.claude-to-im/config.env`

Examples:

```text
codex-to-im start
claude-to-im start
```

That means:

- in Codex, `claude-to-im start` should still launch a Claude-backed bridge
- in Claude Code, `codex-to-im start` should still launch a Codex-backed bridge

## Tool Approval Policy

Configure `CTI_PERMISSION_POLICY` in `~/.claude-to-im/config.env`:

- `always`: every tool call requires IM approval. This is the default and preserves the old behavior.
- `smart`: the bridge auto-approves low-risk actions and asks for approval only when the tool or operation looks sensitive.
- `never`: auto-approve every tool call. Use only in tightly controlled environments.

`CTI_AUTO_APPROVE=true` is still supported as a legacy alias for `CTI_PERMISSION_POLICY=never`.

Example:

```env
CTI_PERMISSION_POLICY=smart
```

### Smart policy rules

In `smart` mode, the bridge currently applies these rules:

- Auto-approve read-only tools such as `Read`, `Grep`, `Glob`, and `LS`
- Auto-approve file edits only when every target stays inside `CTI_DEFAULT_WORKDIR` and avoids sensitive paths such as `~/.ssh`, `~/.codex`, `~/.claude`, `~/.aws`, `/etc`, and shell profile / secret files
- Auto-approve low-risk shell inspection commands such as `pwd`, `ls`, `rg`, `git status`, `git diff`, and common local test/build checks
- Auto-approve read-only network fetches when they look like plain `GET` / `HEAD` reads without request bodies, local file uploads, or explicit credentials
- Auto-approve network calls that post back to the connected IM platform (for example Telegram / Discord / Feishu delivery APIs), unless they include obvious local file upload payloads
- Require approval for shell commands that can mutate files, change permissions, control the OS, access protected macOS state, install software, upload local data, send authenticated requests to external services, or change Git remote/repository state
- Auto-approve IM-delivery MCP tools and obviously read-like MCP tools (for example `get`, `list`, `search`, `query`); require approval for other write-capable or unknown external-state MCP tools
- Require approval for `WebFetch` only when it includes request bodies, credentials, cookies, custom headers, or non-read-only methods

### Runtime note

- Claude runtime supports the full `smart` policy with per-tool decisions in chat.
- Codex runtime currently only exposes thread-level approval policy in the SDK. In that runtime, `smart` falls back to conservative approval prompts instead of selective auto-approval.

## Commands

Use these commands inside Codex or Claude Code:

| Command | Purpose |
|---|---|
| `codex-to-im setup` | Configure the bridge, defaulting runtime to Codex |
| `codex-to-im start` | Start the bridge with Codex runtime |
| `claude-to-im setup` | Configure the bridge, defaulting runtime to Claude |
| `claude-to-im start` | Start the bridge with Claude runtime |
| `codex-to-im stop` / `claude-to-im stop` | Stop the running bridge |
| `codex-to-im status` / `claude-to-im status` | Show current status |
| `codex-to-im logs 200` / `claude-to-im logs 200` | Tail logs |
| `codex-to-im reconfigure` / `claude-to-im reconfigure` | Update existing config |
| `codex-to-im doctor` / `claude-to-im doctor` | Run diagnostics |

The default and recommended mode on macOS is still the normal background supervisor, because that background path is a `launchd` LaunchAgent attached to the logged-in GUI session rather than a headless system daemon.

If you still want the bridge to stay attached to the current Terminal process for debugging or closer parity with a hand-started CLI session, use:

```bash
bash scripts/daemon.sh foreground
```

or:

```bash
bash scripts/daemon.sh start --foreground
```

On macOS, you do not need foreground mode just to get browser / AppleScript / desktop access in the common case. A launchd-managed background bridge can often access the same desktop session too. Foreground mode is mainly useful when you want the process tied to the current Terminal for debugging or you specifically want to avoid launchd.

If you do not want to remember `--foreground`, set this in `~/.claude-to-im/config.env`:

```env
CTI_RUN_MODE=foreground
```

Then ordinary `claude-to-im start` or `bash scripts/daemon.sh start` will also launch in foreground mode.

Foreground mode tradeoffs:

- Keep that Terminal window open; closing it stops the bridge.
- Foreground mode can still be useful for debugging or for reproducing the exact environment of a manually started CLI session.
- On macOS, it is not a hard requirement for Chrome / AppleScript access if the normal background bridge is already running as a `gui/<uid>` LaunchAgent.

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
CTI_RUN_MODE=background
CTI_PERMISSION_POLICY=smart
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
