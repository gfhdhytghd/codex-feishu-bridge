---
name: feishu-bot-send
description: Use when Codex needs to proactively send text, images, or files to the currently connected Feishu/Lark chat through the claude-to-im bot. Trigger on requests to send a file, upload an image, share an attachment, deliver an artifact, or notify the user in Feishu/Lark from the bridge environment.
---

# Feishu Bot Send

Use the bundled helper instead of GUI automation when sending text, images, or files to Feishu/Lark from this machine.

Read `../../references/feishu-send-helper.md` when you need examples or details.

## Helper

Script:

```bash
/Users/linhaikuo/.codex/skills/claude-to-im/scripts/feishu-send.mjs
```

The helper reads credentials from `~/.claude-to-im/config.env` and defaults to the active/recent Feishu chat in `~/.claude-to-im/data/bindings.json`.

## Common Commands

```bash
# Preview target without sending
/Users/linhaikuo/.codex/skills/claude-to-im/scripts/feishu-send.mjs --dry-run --file /path/to/file

# Send text
/Users/linhaikuo/.codex/skills/claude-to-im/scripts/feishu-send.mjs --text "done"

# Send image
/Users/linhaikuo/.codex/skills/claude-to-im/scripts/feishu-send.mjs --image /path/to/image.png

# Send file
/Users/linhaikuo/.codex/skills/claude-to-im/scripts/feishu-send.mjs --file /path/to/file.pdf
```

## Safety

Sending images or files transmits local data to Feishu. Confirm the exact path and destination chat unless the user explicitly requested that exact send.
