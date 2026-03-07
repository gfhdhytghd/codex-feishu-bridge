#!/usr/bin/env bash
set -euo pipefail

# Install claude-to-im skill for Codex.
# Usage: bash scripts/install-codex.sh [--link]
#   --link  Create a symlink instead of copying (for development)

SKILL_NAME="claude-to-im"
CODEX_SKILLS_DIR="$HOME/.codex/skills"
TARGET_DIR="$CODEX_SKILLS_DIR/$SKILL_NAME"
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Installing $SKILL_NAME skill for Codex..."

# Check source
if [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
  echo "Error: SKILL.md not found in $SOURCE_DIR"
  exit 1
fi

# Create skills directory
mkdir -p "$CODEX_SKILLS_DIR"

# Check if already installed
if [ -e "$TARGET_DIR" ]; then
  if [ -L "$TARGET_DIR" ]; then
    EXISTING=$(readlink "$TARGET_DIR")
    echo "Already installed as symlink → $EXISTING"
    echo "To reinstall, remove it first: rm $TARGET_DIR"
    exit 0
  else
    echo "Already installed at $TARGET_DIR"
    echo "To reinstall, remove it first: rm -rf $TARGET_DIR"
    exit 0
  fi
fi

if [ "${1:-}" = "--link" ]; then
  LINK_MODE=true
  ln -s "$SOURCE_DIR" "$TARGET_DIR"
  echo "Symlinked: $TARGET_DIR → $SOURCE_DIR"
else
  LINK_MODE=false
  cp -R "$SOURCE_DIR" "$TARGET_DIR"
  echo "Copied to: $TARGET_DIR"
fi

# Ensure dependencies (need devDependencies for build step)
if [ ! -d "$TARGET_DIR/node_modules" ] || [ ! -d "$TARGET_DIR/node_modules/@openai/codex-sdk" ]; then
  echo "Installing dependencies..."
  (cd "$TARGET_DIR" && npm install)
fi

# Ensure build
if [ ! -f "$TARGET_DIR/dist/daemon.mjs" ]; then
  echo "Building daemon bundle..."
  (cd "$TARGET_DIR" && npm run build)
fi

# Prune devDependencies after build for copied installs only.
if [ "$LINK_MODE" = "true" ]; then
  echo "Skipping npm prune for symlink install to avoid mutating the source workspace."
else
  echo "Pruning dev dependencies..."
  (cd "$TARGET_DIR" && npm prune --production)
fi

echo ""
echo "Done! Start a new Codex session and use:"
echo "  codex-to-im setup     — configure IM platform credentials for Codex runtime"
echo "  codex-to-im start     — start the bridge with Codex runtime"
echo "  claude-to-im start    — start the bridge with Claude runtime"
echo "  codex-to-im doctor    — diagnose issues"
