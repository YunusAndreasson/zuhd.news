#!/usr/bin/env bash
# zuhd.news editorial cycle — started by the systemd timer, five times a day
# (05, 10, 14, 18, 22 UTC).
#
# This file takes the lock, loads the environment and hands over. The cycle
# itself is a list of stages (scripts/cycle/stages.js) run by a small runner
# (scripts/cycle/run.js). To see what a cycle would run, without running it:
#
#   node scripts/cycle/run.js --plan --at 22 --dow 7

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# The way back, without a commit: while a file named .cycle-legacy exists in
# the repository root, the cycle is the shell script the runner replaced
# (scripts/run-cycle.legacy.sh, kept until the runner has run every kind of
# cycle). `touch .cycle-legacy` to go back; remove it to return to the runner.
if [ -e "$PROJECT_DIR/.cycle-legacy" ] && [ -f "$SCRIPT_DIR/run-cycle.legacy.sh" ]; then
  exec bash "$SCRIPT_DIR/run-cycle.legacy.sh" "$@"
fi

# Prevent overlapping cycles (systemd timer doesn't guarantee exclusion). The
# runner inherits the descriptor, and with it the lock, for as long as it runs.
exec 200>/tmp/zuhd-cycle.lock
flock -n 200 || { echo "Cycle already running — exiting"; exit 0; }

# Load environment secrets (NEWSAPI_KEY etc.) — not in systemd, not in git
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a; source "$PROJECT_DIR/.env"; set +a
fi

# Ensure mise-managed tools are on PATH (systemd doesn't source shell profiles)
export HOME="${HOME:-/root}"
MISE_BIN="${MISE_BIN:-$HOME/.local/bin/mise}"
if [ -x "$MISE_BIN" ]; then
  eval "$($MISE_BIN env --shell bash 2>/dev/null)"
else
  echo "WARNING: mise not found at $MISE_BIN — relying on existing PATH" >&2
fi

exec node "$SCRIPT_DIR/cycle/run.js"
