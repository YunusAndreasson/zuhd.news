#!/usr/bin/env bash
# zuhd.news editorial cycle — runs 4x daily via systemd timer
# Three-stage pipeline: selector picks stories, writer drafts articles, editor checks and deploys

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

# Ensure mise-managed tools are on PATH (systemd doesn't source shell profiles)
export PATH="/root/.local/share/mise/installs/node/24.13.1/bin:/root/.local/bin:$PATH"
export HOME="/root"

# Tool whitelist for Claude CLI (--dangerously-skip-permissions is blocked as root)
CLAUDE_TOOLS="Bash,Read,Write,Edit,Glob,Grep,WebFetch"

mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H%M)
LOG_FILE="$LOG_DIR/cycle-$TIMESTAMP.log"

cleanup() {
  echo "" | tee -a "$LOG_FILE"
  echo "Finished: $(date)" | tee -a "$LOG_FILE"
  find "$LOG_DIR" -name "cycle-*.log" -mtime +7 -delete 2>/dev/null || true
}
trap cleanup EXIT

cd "$PROJECT_DIR"

echo "=== zuhd.news editorial cycle ===" | tee "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"

# Stage 1: Selector — fetch news, pick stories, save selection
echo "" | tee -a "$LOG_FILE"
echo "--- Stage 1: Selector ---" | tee -a "$LOG_FILE"
SELECT_PROMPT=$(cat scripts/select-prompt.md)
timeout 300 claude --allowedTools "$CLAUDE_TOOLS" --model claude-opus-4-6 --effort high -p "$SELECT_PROMPT" 2>&1 | tee -a "$LOG_FILE"
SELECT_EXIT=$?
echo "Selector exit: $SELECT_EXIT" | tee -a "$LOG_FILE"

# Skip writer+editor if selector produced no selection
if [ ! -s /tmp/zuhd-selection.json ]; then
  echo "No selection produced — skipping writer and editor" | tee -a "$LOG_FILE"
  exit 0
fi

# Stage 2: Writer — read selection, fetch full articles, draft markdown
echo "" | tee -a "$LOG_FILE"
echo "--- Stage 2: Writer ---" | tee -a "$LOG_FILE"
WRITE_PROMPT=$(cat scripts/write-prompt.md)
timeout 600 claude --allowedTools "$CLAUDE_TOOLS" --model claude-opus-4-6 -p "$WRITE_PROMPT" 2>&1 | tee -a "$LOG_FILE"
WRITE_EXIT=$?
echo "Writer exit: $WRITE_EXIT" | tee -a "$LOG_FILE"

# Skip editor if writer produced no new articles (check both modified and untracked)
NEW_ARTICLES=$( { git diff --name-only content/articles/ 2>/dev/null; git ls-files --others --exclude-standard content/articles/ 2>/dev/null; } | sort -u )
if [ -z "$NEW_ARTICLES" ]; then
  echo "No new articles — skipping editor" | tee -a "$LOG_FILE"
  exit 0
fi

# Stage 3: Editor — check new articles, fix violations, build, commit, deploy
echo "" | tee -a "$LOG_FILE"
echo "--- Stage 3: Editor ---" | tee -a "$LOG_FILE"
CHECK_PROMPT=$(cat scripts/check-prompt.md)
timeout 300 claude --allowedTools "$CLAUDE_TOOLS" --model sonnet -p "$CHECK_PROMPT" 2>&1 | tee -a "$LOG_FILE"
EDITOR_EXIT=$?
echo "Editor exit: $EDITOR_EXIT" | tee -a "$LOG_FILE"
