# Feishu Bot Send Helper

Use this helper when the user wants to send text, images, or files through the
currently connected Feishu/Lark bot instead of using GUI automation.

Script:

```bash
/Users/linhaikuo/.codex/skills/claude-to-im/scripts/feishu-send.mjs
```

Defaults:

- Reads bot credentials from `~/.claude-to-im/config.env`.
- Sends to the active/recent Feishu chat from `~/.claude-to-im/data/bindings.json`.
- Use `--chat <chat_id>` to override the destination.

Examples:

```bash
# Text
/Users/linhaikuo/.codex/skills/claude-to-im/scripts/feishu-send.mjs --text "done"

# File
/Users/linhaikuo/.codex/skills/claude-to-im/scripts/feishu-send.mjs --file ~/Downloads/Homework14.pdf

# Image
/Users/linhaikuo/.codex/skills/claude-to-im/scripts/feishu-send.mjs --image ~/Downloads/example.png

# Caption + attachment, sends text first
/Users/linhaikuo/.codex/skills/claude-to-im/scripts/feishu-send.mjs --text "Here it is" --file ~/Downloads/Homework14.pdf

# Preview without sending
/Users/linhaikuo/.codex/skills/claude-to-im/scripts/feishu-send.mjs --dry-run --file ~/Downloads/Homework14.pdf
```

Safety:

- Sending a file/image transmits local data to Feishu. Confirm the exact file and
  target chat before sending unless the user explicitly requested that exact send.
