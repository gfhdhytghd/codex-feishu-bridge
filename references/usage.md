# Usage Guide

This skill works with both **Claude Code** and **Codex**.

Runtime alias rules:

- `codex-to-im ...` forces Codex runtime for that command
- `claude-to-im ...` forces Claude runtime for that command
- plain commands like `start bridge` keep using the saved `CTI_RUNTIME`

## setup

Interactive wizard that configures the bridge.

```
codex-to-im setup
claude-to-im setup
```

The wizard will prompt you for:

1. **Channels to enable** -- Enter comma-separated values: `telegram`, `discord`, `feishu`
2. **Platform credentials** -- Bot tokens, app IDs, and secrets for each enabled channel
3. **Allowed users** (optional) -- Restrict which users can interact with the bot
4. **Working directory** -- Default project directory for Claude Code sessions
5. **Model and mode** -- Claude model and interaction mode (code/plan/ask)

After collecting input, the wizard validates tokens by calling each platform's API and reports results.

Example interaction:

```
> /claude-to-im setup
Which channels to enable? telegram,discord
Enter Telegram bot token: <your-token>
Enter Discord bot token: <your-token>
Default working directory [/current/dir]: /Users/me/projects
Model [claude-sonnet-4-20250514]:
Mode [code]:

Validating tokens...
  Telegram: OK (bot @MyBotName)
  Discord: OK (format valid)

Config written to ~/.claude-to-im/config.env
```

## start

Starts the bridge daemon in the background.

```
codex-to-im start
claude-to-im start
```

The daemon process ID is stored in `~/.claude-to-im/runtime/bridge.pid`. If the daemon is already running, the command reports the existing process.

If startup fails, run `codex-to-im doctor` or `claude-to-im doctor` to diagnose issues.

## stop

Stops the running bridge daemon.

```
codex-to-im stop
claude-to-im stop
```

Sends SIGTERM to the daemon process and cleans up the PID file.

## status

Shows whether the daemon is running and basic health information.

```
codex-to-im status
claude-to-im status
```

Output includes:
- Running/stopped state
- PID (if running)
- Uptime
- Connected channels

## logs

Shows recent log output from the daemon.

```
codex-to-im logs        # Last 50 lines (default)
codex-to-im logs 200    # Last 200 lines
claude-to-im logs 200   # Same log stream, explicit Claude alias
```

Logs are stored in `~/.claude-to-im/logs/` and are automatically redacted to mask secrets.

## reconfigure

Interactively update the current configuration.

```
codex-to-im reconfigure
claude-to-im reconfigure
```

Displays current settings with secrets masked, then prompts for changes. After updating, you must restart the daemon for changes to take effect:

```
codex-to-im stop
codex-to-im start
```

## doctor

Runs diagnostic checks and reports issues.

```
codex-to-im doctor
claude-to-im doctor
```

Checks performed:
- Node.js version (>= 20 required)
- Claude Code CLI availability
- Config file exists and has correct permissions
- Required tokens are set for enabled channels
- Token validity (API calls)
- Daemon process health
- Log directory writability
