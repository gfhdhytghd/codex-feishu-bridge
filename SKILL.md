---
name: claude-to-im
description: |
  This skill bridges Codex or Claude Code to IM platforms (Telegram, Discord, Feishu/Lark).
  It should be used when the user wants to start a background daemon that forwards
  IM messages to Codex or Claude Code sessions, or manage that daemon's lifecycle.
  Trigger on: "claude-to-im", "codex-to-im", "start bridge", "stop bridge",
  "bridge status", "查看日志", "启动桥接", "停止桥接", or any mention of IM bridge management.
  Subcommands: setup, start, stop, status, logs, reconfigure, doctor.
argument-hint: "setup | start | stop | status | logs [N] | reconfigure | doctor"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - AskUserQuestion
  - Grep
  - Glob
---

# Codex / Claude-to-IM Bridge Skill

You are managing the Codex / Claude-to-IM bridge.
User data is stored at `~/.claude-to-im/`.

First, locate the skill directory by finding this SKILL.md file:
- Use Glob with pattern `**/skills/**/claude-to-im/SKILL.md` to find its path, then derive the skill root directory from it.
- Store that path mentally as SKILL_DIR for all subsequent file references.

## Command parsing

Parse the user's intent from `$ARGUMENTS` into one of these subcommands:

| User says (examples) | Subcommand |
|---|---|
| `claude-to-im setup`, `codex-to-im setup`, `setup`, `configure`, `配置` | setup |
| `claude-to-im start`, `codex-to-im start`, `start`, `start bridge`, `启动`, `启动桥接` | start |
| `claude-to-im stop`, `codex-to-im stop`, `stop`, `stop bridge`, `停止`, `停止桥接` | stop |
| `claude-to-im status`, `codex-to-im status`, `status`, `bridge status`, `状态` | status |
| `claude-to-im logs`, `codex-to-im logs`, `logs`, `logs 200`, `查看日志`, `查看日志 200` | logs |
| `claude-to-im reconfigure`, `codex-to-im reconfigure`, `reconfigure`, `修改配置` | reconfigure |
| `claude-to-im doctor`, `codex-to-im doctor`, `doctor`, `diagnose`, `诊断` | doctor |

Extract optional numeric argument for `logs` (default 50).

Also detect whether the user explicitly invoked one of these command aliases:

- `codex-to-im ...` — force this operation to use Codex runtime by exporting `CTI_RUNTIME_OVERRIDE=codex`
- `claude-to-im ...` — force this operation to use Claude runtime by exporting `CTI_RUNTIME_OVERRIDE=claude`
- No explicit alias — respect the saved `CTI_RUNTIME` from `~/.claude-to-im/config.env`

This alias rule takes precedence over the current tool you are running in. For example:

- In Codex, `claude-to-im start` should still start a Claude-backed bridge
- In Claude Code, `codex-to-im start` should still start a Codex-backed bridge

**IMPORTANT:** Before asking users for any platform credentials, first read `SKILL_DIR/references/setup-guides.md` to get the detailed step-by-step guidance for that platform. Present the relevant guide text to the user via AskUserQuestion so they know exactly what to do.

## Runtime detection

Before executing any subcommand, detect which environment you are running in:

1. **Claude Code** — `AskUserQuestion` tool is available. Use it for interactive setup wizards.
2. **Codex / other** — `AskUserQuestion` is NOT available. Fall back to non-interactive guidance: explain the steps, show `SKILL_DIR/config.env.example`, and ask the user to create `~/.claude-to-im/config.env` manually.

You can test this by checking if AskUserQuestion is in your available tools list.

## Config check (applies to `start`, `stop`, `status`, `logs`, `reconfigure`, `doctor`)

Before running any subcommand other than `setup`, check if `~/.claude-to-im/config.env` exists:

- **If it does NOT exist:**
  - In Claude Code: tell the user "No configuration found" and automatically start the `setup` wizard using AskUserQuestion.
  - In Codex: tell the user "No configuration found. Please create `~/.claude-to-im/config.env` based on the example:" then show the contents of `SKILL_DIR/config.env.example` and stop. Do NOT attempt to start the daemon.
- **If it exists:** proceed with the requested subcommand.

## Subcommands

### `setup`

Run an interactive setup wizard. This subcommand requires `AskUserQuestion`. If it is not available (Codex environment), instead show the contents of `SKILL_DIR/config.env.example` with field-by-field explanations and instruct the user to create the config file manually.

When AskUserQuestion IS available, collect input **one field at a time**. After each answer, confirm the value back to the user (masking secrets to last 4 chars only) before moving to the next question.

**Step 1 — Choose channels**

Ask which channels to enable (telegram, discord, feishu). Accept comma-separated input. Briefly describe each:
- **telegram** — Best for personal use. Streaming preview, inline permission buttons.
- **discord** — Good for team use. Server/channel/user-level access control.
- **feishu** (Lark) — For Feishu/Lark teams. Event-based messaging.

**Step 2 — Collect tokens per channel**

For each enabled channel, read `SKILL_DIR/references/setup-guides.md` and present the relevant platform guide to the user. Collect one credential at a time:

- **Telegram**: Bot Token → confirm (masked) → Chat ID (see guide for how to get it) → confirm → Allowed User IDs (optional). **Important:** At least one of Chat ID or Allowed User IDs must be set, otherwise the bot will reject all messages.
- **Discord**: Bot Token → confirm (masked) → Allowed User IDs → Allowed Channel IDs (optional) → Allowed Guild IDs (optional). **Important:** At least one of Allowed User IDs or Allowed Channel IDs must be set, otherwise the bot will reject all messages (default-deny).
- **Feishu**: App ID → confirm → App Secret → confirm (masked) → Domain (optional) → Allowed User IDs (optional). Guide through all 4 steps (A: batch permissions, B: enable bot, C: events & callbacks with long connection, D: publish version).

**Step 3 — General settings**

Ask for runtime, default working directory, model, and mode:
- **Runtime**: `claude` (default), `codex`, `auto`
  - `claude` — uses Claude Code CLI + Claude Agent SDK (requires `claude` CLI installed)
  - `codex` — uses OpenAI Codex SDK (requires `codex` CLI; auth via `codex auth login` or `OPENAI_API_KEY`)
  - `auto` — tries Claude first, falls back to Codex if Claude CLI not found
- If the user invoked `codex-to-im setup`, default the runtime choice to `codex` unless they explicitly ask for something else
- If the user invoked `claude-to-im setup`, default the runtime choice to `claude` unless they explicitly ask for something else
- **Working Directory**: default `$CWD`
- **Model** (optional): Leave blank to inherit the runtime's own default model. If the user wants to override, ask them to enter a model name. Do NOT hardcode or suggest specific model names — the available models change over time.
- **Mode**: `code` (default), `plan`, `ask`

**Step 4 — Write config and validate**

1. Show a final summary table with all settings (secrets masked to last 4 chars)
2. Ask user to confirm before writing
3. Use Bash to create directory structure: `mkdir -p ~/.claude-to-im/{data,logs,runtime,data/messages}`
4. Use Write to create `~/.claude-to-im/config.env` with all settings in KEY=VALUE format
5. Use Bash to set permissions: `chmod 600 ~/.claude-to-im/config.env`
6. Validate tokens:
   - Telegram: `curl -s "https://api.telegram.org/bot${TOKEN}/getMe"` — check for `"ok":true`
   - Feishu: `curl -s -X POST "${DOMAIN}/open-apis/auth/v3/tenant_access_token/internal" -H "Content-Type: application/json" -d '{"app_id":"...","app_secret":"..."}'` — check for `"code":0`
   - Discord: verify token matches format `[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`
7. Report results with a summary table. If any validation fails, explain what might be wrong and how to fix it.
8. On success:
   - if the user invoked `codex-to-im setup`, tell them: "Setup complete! Run `codex-to-im start` to start the Codex bridge."
   - otherwise tell them: "Setup complete! Run `claude-to-im start` to start the Claude bridge."

### `start`

**Pre-check:** Verify `~/.claude-to-im/config.env` exists (see "Config check" above). Do NOT proceed without it.

Run: `bash "SKILL_DIR/scripts/daemon.sh" start`

If the user explicitly invoked `codex-to-im start`, run:
`CTI_RUNTIME_OVERRIDE=codex bash "SKILL_DIR/scripts/daemon.sh" start`

If the user explicitly invoked `claude-to-im start`, run:
`CTI_RUNTIME_OVERRIDE=claude bash "SKILL_DIR/scripts/daemon.sh" start`

Show the output to the user. If it fails, tell the user:
- Run `doctor` to diagnose: `codex-to-im doctor` or `claude-to-im doctor`
- Check recent logs: `codex-to-im logs` or `claude-to-im logs`

### `stop`

Run: `bash "SKILL_DIR/scripts/daemon.sh" stop`

### `status`

Run: `bash "SKILL_DIR/scripts/daemon.sh" status`

### `logs`

Extract optional line count N from arguments (default 50).
Run: `bash "SKILL_DIR/scripts/daemon.sh" logs N`

### `reconfigure`

1. Read current config from `~/.claude-to-im/config.env`
2. Show current settings in a clear table format, with all secrets masked (only last 4 chars visible)
3. Use AskUserQuestion to ask what the user wants to change
4. When collecting new values, read `SKILL_DIR/references/setup-guides.md` and present the relevant guide for that field
5. Update the config file atomically (write to tmp, rename)
6. Re-validate any changed tokens
7. Remind the user to restart with the alias that matches the runtime they want, for example:
   - `codex-to-im stop` then `codex-to-im start`
   - `claude-to-im stop` then `claude-to-im start`

### `doctor`

Run: `bash "SKILL_DIR/scripts/doctor.sh"`

Show results and suggest fixes for any failures. Common fixes:
- SDK cli.js missing → `cd SKILL_DIR && npm install`
- dist/daemon.mjs stale → `cd SKILL_DIR && npm run build`
- Config missing → run `setup`

## Notes

- Always mask secrets in output (show only last 4 characters)
- **Never start the daemon without a valid config.env** — always check first, redirect to setup or show config example
- The daemon runs as a background Node.js process managed by platform supervisor (launchd on macOS, setsid on Linux, WinSW/NSSM on Windows)
- Config persists at `~/.claude-to-im/config.env` — survives across sessions
