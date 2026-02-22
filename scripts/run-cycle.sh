#!/usr/bin/env bash
# zuhd.news editorial cycle — runs 4x daily via systemd timer
# Three-stage pipeline: selector picks stories, writer drafts articles, editor checks and deploys

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

# Prevent overlapping cycles (systemd timer doesn't guarantee exclusion)
exec 200>/tmp/zuhd-cycle.lock
flock -n 200 || { echo "Cycle already running — exiting"; exit 0; }

# Ensure mise-managed tools are on PATH (systemd doesn't source shell profiles)
export PATH="/root/.local/share/mise/installs/node/24.13.1/bin:/root/.local/bin:$PATH"
export HOME="/root"

# Tool whitelist for Claude CLI (--dangerously-skip-permissions is blocked as root)
CLAUDE_TOOLS="Bash,Read,Write,Edit,Glob,Grep,WebFetch"
# Common flags for all headless Claude CLI invocations
CLAUDE_COMMON="--allowedTools $CLAUDE_TOOLS --no-session-persistence --max-turns 60"

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

# Clear stale selection from previous cycle — prevents writer from using yesterday's picks if selector fails
rm -f /tmp/zuhd-selection.json /tmp/zuhd-new-articles.txt

# Stage 1: Selector — fetch news, pick stories, save selection
echo "" | tee -a "$LOG_FILE"
echo "--- Stage 1: Selector ---" | tee -a "$LOG_FILE"
SELECT_PROMPT=$(cat scripts/select-prompt.md)
timeout 900 claude $CLAUDE_COMMON --model claude-opus-4-6 --fallback-model claude-sonnet-4-6 --effort high -p "$SELECT_PROMPT" 2>&1 | tee -a "$LOG_FILE"
SELECT_EXIT=$?
echo "Selector exit: $SELECT_EXIT" | tee -a "$LOG_FILE"

# Abort if selector failed or produced no selection
if [ "$SELECT_EXIT" -ne 0 ]; then
  echo "Selector failed (exit $SELECT_EXIT) — aborting cycle" | tee -a "$LOG_FILE"
  exit 1
fi
if [ ! -s /tmp/zuhd-selection.json ]; then
  echo "No selection file produced — skipping writer and editor" | tee -a "$LOG_FILE"
  exit 0
fi
# Guard against empty JSON array (selector wrote [] with 0 stories)
SELECTION_COUNT=$(node -e "const s=JSON.parse(require('fs').readFileSync('/tmp/zuhd-selection.json','utf8'));console.log(Array.isArray(s)?s.length:0)" 2>/dev/null || echo 0)
if [ "$SELECTION_COUNT" -eq 0 ]; then
  echo "Selection is empty (0 stories) — skipping writer and editor" | tee -a "$LOG_FILE"
  exit 0
fi
echo "Selection contains $SELECTION_COUNT stories" | tee -a "$LOG_FILE"

# Stage 2: Writer — read selection, fetch full articles, draft markdown
echo "" | tee -a "$LOG_FILE"
echo "--- Stage 2: Writer ---" | tee -a "$LOG_FILE"
WRITE_PROMPT=$(cat scripts/write-prompt.md)
timeout 1200 claude $CLAUDE_COMMON --model claude-opus-4-6 --fallback-model claude-sonnet-4-6 -p "$WRITE_PROMPT" 2>&1 | tee -a "$LOG_FILE"
WRITE_EXIT=$?
echo "Writer exit: $WRITE_EXIT" | tee -a "$LOG_FILE"

if [ "$WRITE_EXIT" -ne 0 ]; then
  echo "Writer failed (exit $WRITE_EXIT) — continuing with any partial output" | tee -a "$LOG_FILE"
fi

# Capture new articles from this cycle (modified + untracked)
NEW_ARTICLES=$( { git diff --name-only content/articles/ 2>/dev/null; git ls-files --others --exclude-standard content/articles/ 2>/dev/null; } | sort -u )
if [ -z "$NEW_ARTICLES" ]; then
  echo "No new articles — skipping editor and deploy" | tee -a "$LOG_FILE"
else
  NEW_COUNT=$(echo "$NEW_ARTICLES" | wc -l)
  echo "Found $NEW_COUNT new/modified articles" | tee -a "$LOG_FILE"

  # Save the list so the editor checks only this batch (not all untracked files)
  echo "$NEW_ARTICLES" > /tmp/zuhd-new-articles.txt

  # Stage 3: Editor — check only this cycle's articles against style rules
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3: Editor ---" | tee -a "$LOG_FILE"
  CHECK_PROMPT=$(cat scripts/check-prompt.md)
  ARTICLE_LIST=$(cat /tmp/zuhd-new-articles.txt)
  EDITOR_ADDENDUM="

IMPORTANT: Only check these specific files (this cycle's batch). Do NOT scan for other untracked files:
$ARTICLE_LIST"
  timeout 900 claude $CLAUDE_COMMON --model sonnet -p "$CHECK_PROMPT$EDITOR_ADDENDUM" 2>&1 | tee -a "$LOG_FILE"
  EDITOR_EXIT=$?
  echo "Editor exit: $EDITOR_EXIT" | tee -a "$LOG_FILE"

  # Stage 3b: Build and deploy — always runs, even if editor timed out
  # This ensures articles get published regardless of editor success
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3b: Build & Deploy ---" | tee -a "$LOG_FILE"

  # Validate new articles — move malformed ones aside so they don't get deployed
  node -e "
const fs = require('fs');
const path = require('path');
const files = fs.readFileSync('/tmp/zuhd-new-articles.txt', 'utf8').trim().split('\n').filter(Boolean);
let bad = 0;
for (const f of files) {
  const full = path.resolve(f);
  if (!fs.existsSync(full)) continue;
  const raw = fs.readFileSync(full, 'utf8');
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { console.log('SKIP (no frontmatter): ' + f); fs.renameSync(full, full + '.bad'); bad++; continue; }
  const yaml = fm[1];
  const has = (k) => yaml.includes(k + ':');
  if (!has('title') || !has('date') || !has('category') || !has('source')) {
    console.log('SKIP (missing fields): ' + f); fs.renameSync(full, full + '.bad'); bad++; continue;
  }
  const body = raw.replace(/^---[\s\S]*?---\s*/, '').trim();
  const sentences = body.split(/(?<=[.!?][\u201D\u2019]?)\s+(?=[A-Z\u00C0-\u024F])/).filter(s => s.length > 5);
  if (sentences.length < 2 || sentences.length > 5) {
    console.log('SKIP (' + sentences.length + ' sentences): ' + f); fs.renameSync(full, full + '.bad'); bad++; continue;
  }
}
console.log('Validated ' + files.length + ' articles, ' + bad + ' removed');
" 2>&1 | tee -a "$LOG_FILE"

  # Write .last-cycle.json from validated articles (not raw selection)
  # This ensures the selector next cycle only skips stories that were actually published
  node -e "
const fs = require('fs');
const path = require('path');
const sel = JSON.parse(fs.readFileSync('/tmp/zuhd-selection.json', 'utf8'));
const articleDir = 'content/articles';
const published = sel.filter(s => fs.existsSync(path.join(articleDir, s.suggestedSlug + '.md')));
const cycle = {
  timestamp: new Date().toISOString(),
  articles: published.map(s => ({
    slug: s.suggestedSlug,
    title: s.title,
    category: s.category,
    source: s.source
  })),
  categories: [...new Set(published.map(s => s.category))],
  sources: [...new Set(published.map(s => s.source))]
};
fs.writeFileSync('content/.last-cycle.json', JSON.stringify(cycle, null, 2) + '\n');
console.log('Wrote .last-cycle.json with ' + published.length + '/' + sel.length + ' articles (validated)');
" 2>&1 | tee -a "$LOG_FILE"

  # Build
  node scripts/build.js 2>&1 | tee -a "$LOG_FILE"
  BUILD_EXIT=$?
  echo "Build exit: $BUILD_EXIT" | tee -a "$LOG_FILE"

  if [ "$BUILD_EXIT" -eq 0 ]; then
    # Commit
    git add content/articles/ content/.last-cycle.json content/.editorial-notes.md content/.story-ledger.json 2>&1 | tee -a "$LOG_FILE"
    CYCLE_TIME=$(date -u +"%Y-%m-%d %H:%M UTC")
    git commit -m "Editorial cycle $CYCLE_TIME: $NEW_COUNT articles" 2>&1 | tee -a "$LOG_FILE"

    # Deploy
    npx wrangler pages deploy dist --project-name zuhd-news --branch master --commit-dirty=true 2>&1 | tee -a "$LOG_FILE"
    DEPLOY_EXIT=$?
    echo "Deploy exit: $DEPLOY_EXIT" | tee -a "$LOG_FILE"
  else
    echo "Build failed — skipping deploy" | tee -a "$LOG_FILE"
  fi
fi

# Stage 4: Audio briefing — generate at 04:00 and 16:00 UTC only (morning/evening for GCC→India)
HOUR_UTC=$(date -u +%H)
if [ "$HOUR_UTC" = "04" ] || [ "$HOUR_UTC" = "16" ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 4: Audio briefing ---" | tee -a "$LOG_FILE"
  timeout 900 node scripts/generate-briefing.js 2>&1 | tee -a "$LOG_FILE"
  BRIEFING_EXIT=$?
  echo "Briefing exit: $BRIEFING_EXIT" | tee -a "$LOG_FILE"
  if [ "$BRIEFING_EXIT" -eq 0 ]; then
    echo "Rebuilding and redeploying with audio..." | tee -a "$LOG_FILE"
    node scripts/build.js 2>&1 | tee -a "$LOG_FILE"
    git add content/audio/ 2>&1 | tee -a "$LOG_FILE"
    git commit -m "Audio briefing $(date -u +%Y-%m-%d)" 2>&1 | tee -a "$LOG_FILE"
    npx wrangler pages deploy dist --project-name zuhd-news --branch master --commit-dirty=true 2>&1 | tee -a "$LOG_FILE"
  fi
else
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 4: Audio briefing (skipped — $HOUR_UTC:00 UTC, runs at 04:00/16:00 only) ---" | tee -a "$LOG_FILE"
fi

# Stage 5: Weekly reflection — runs Sunday 21:00 UTC only
DAY_OF_WEEK=$(date -u +%u)
if [ "$DAY_OF_WEEK" = "7" ] && [ "$HOUR_UTC" = "22" ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 5: Weekly reflection ---" | tee -a "$LOG_FILE"
  REFLECT_PROMPT=$(cat scripts/reflect-prompt.md)
  timeout 300 claude $CLAUDE_COMMON --model sonnet -p "$REFLECT_PROMPT" 2>&1 | tee -a "$LOG_FILE"
  REFLECT_EXIT=$?
  echo "Reflection exit: $REFLECT_EXIT" | tee -a "$LOG_FILE"
  # Failure here doesn't affect publishing — the cycle is already complete
else
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 5: Weekly reflection (skipped — day $DAY_OF_WEEK $HOUR_UTC:00 UTC, runs Sunday 21:00 only) ---" | tee -a "$LOG_FILE"
fi
