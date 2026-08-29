#!/usr/bin/env bash
# zuhd.news editorial cycle — runs 5x daily via systemd timer (04, 08, 12, 17, 22 UTC)
# Three-stage pipeline: selector picks stories, writer drafts articles, editor checks and deploys

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

# Prevent overlapping cycles (systemd timer doesn't guarantee exclusion)
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

# Models and effort levels — chosen per task type:
#   Selector: Opus+medium — best editorial reasoning; medium effort sufficient for comparison/filtering
#   Writer:   Sonnet+medium — format-constrained task; medium effort sufficient for templated writing
#   Editor:   Sonnet+low — checklist-driven style checks; dropped medium→low on 2026-05-28 to fix the May-26 editor-time regression (repeated 1800s timeouts at medium). First low run: 201s exit 0, 10/12 edited with quality intact. Override per-run with ZUHD_EDITOR_EFFORT.
#   Reflect:  Sonnet+medium — reflective audit, low frequency
# 2026-07-01: writer/editor default moved sonnet-4-6 → sonnet-5. Sonnet 5 self-revises
# just-written files with Edit, so Edit must stay in TOOLS_WRITER (missing it stalls the
# writer on permission prompts — 43 articles lost 07-01→07-03 before this was diagnosed).
CLAUDE_MODEL="${ZUHD_MODEL:-claude-sonnet-5}"
CLAUDE_SELECTOR_MODEL="${ZUHD_SELECTOR_MODEL:-claude-opus-5}"
export ZUHD_MODEL="$CLAUDE_MODEL"

# Tool whitelist for Claude CLI (--dangerously-skip-permissions is blocked as root)
# Stage-specific tool sets: narrower access = fewer wrong turns
# Selector no longer needs Bash — RSS feed is pre-fetched to /tmp/zuhd-feed.json before session starts
TOOLS_SELECTOR="Read,Write,Glob,Grep"
TOOLS_WRITER="Read,Write,Edit"
TOOLS_EDITOR="Read,Edit,Glob,Grep"
# Common flags for all headless Claude CLI invocations (no --model: passed per stage).
#   --no-session-persistence   don't write resume state for headless calls
#   --setting-sources project  skip ~/.claude/settings.json — only project settings
#   --disable-slash-commands   skip user + project skills (cycle prompts are self-contained)
#   --strict-mcp-config        skip every MCP server (we never pass --mcp-config)
# Auto-memory still loads (tied to OAuth-compatible mode); prune memory files
# manually if their content shouldn't reach the cycle.
CLAUDE_FLAGS="--no-session-persistence --setting-sources project --disable-slash-commands --strict-mcp-config"

mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H%M)
LOG_FILE="$LOG_DIR/cycle-$TIMESTAMP.log"

# Commit exactly the paths named, leaving anything else a person has staged
# alone.
#
# `git add X && git commit` does *not* commit only X. A bare `git commit` writes
# the whole index, so any change already staged in the working tree rides along
# under this cycle's message. Not hypothetical: on 2026-07-30 a staged
# `public/og-image.png` deletion, mid-edit and not ready, was published inside
# "Editorial cycle 2026-07-30 17:21 UTC: 12 articles". Five cycles a day, each
# able to commit someone's half-finished work under an editorial message — and
# the message is the part that makes it hard to find afterwards.
#
# `--only` is the fix and has one sharp edge: a pathspec matching nothing known
# to git aborts the entire commit. `content/.context-briefs.json` is exactly
# that risk — frozen since the edu-context stage was removed on 2026-06-19 — so
# one absent file would stop the cycle committing anything at all. Hence the
# filter: a path is passed on only if it exists on disk or git already tracks
# it. An empty list is a no-op rather than a `git commit` with no pathspec,
# which would be the original bug again.
commit_only() {
  local msg="$1"; shift
  local paths=() p
  for p in "$@"; do
    if [ -e "$p" ] || git ls-files --error-unmatch "$p" >/dev/null 2>&1; then
      paths+=("$p")
    fi
  done
  if [ "${#paths[@]}" -eq 0 ]; then
    echo "commit_only: no existing paths among: $* — nothing committed" | tee -a "$LOG_FILE"
    return 0
  fi
  # The `git add` is still required and is not the bug. `--only` restricts the
  # commit to these paths, but it only sees what git already knows about, so a
  # *new* article — an untracked file, which is most of what a cycle produces —
  # is silently skipped without it. Dropping the add and keeping `--only` commits
  # nothing at all, which is how this was first written and why it is tested.
  git add "${paths[@]}" 2>&1 | tee -a "$LOG_FILE"
  git commit --only "${paths[@]}" -m "$msg" 2>&1 | tee -a "$LOG_FILE"
}

cleanup() {
  echo "" | tee -a "$LOG_FILE"
  # Funnel summary — one glance to see where stories were gained or lost
  echo "=== Funnel ===" | tee -a "$LOG_FILE"
  echo "Feed:      ${FUNNEL_FEED:-?}" | tee -a "$LOG_FILE"
  echo "Selected:  ${FUNNEL_SELECTED:-0}" | tee -a "$LOG_FILE"
  echo "Deduped:   ${FUNNEL_DEDUPED:-0}${FUNNEL_DEDUP_NOTE:+ ($FUNNEL_DEDUP_NOTE)}" | tee -a "$LOG_FILE"
  echo "Written:   ${FUNNEL_WRITTEN:-0}" | tee -a "$LOG_FILE"
  echo "Validated: ${FUNNEL_VALIDATED:-0}${FUNNEL_VALID_NOTE:+ ($FUNNEL_VALID_NOTE)}" | tee -a "$LOG_FILE"
  echo "Published: ${FUNNEL_PUBLISHED:-0}" | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
  echo "Finished: $(date) — total ${SECONDS}s" | tee -a "$LOG_FILE"
  find "$LOG_DIR" -name "cycle-*.log" -mtime +7 -delete 2>/dev/null || true
}
trap cleanup EXIT

cd "$PROJECT_DIR"

# Capture start hour for stage gates (Stage 4/5/6 check this, not wall clock after 20+ min of processing)
START_HOUR=$(date -u +%H)

echo "=== zuhd.news editorial cycle ===" | tee "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"

# Clear stale selection from previous cycle — prevents writer from using yesterday's picks if selector fails
rm -f /tmp/zuhd-selection.json /tmp/zuhd-new-articles.txt /tmp/zuhd-feed.json

# Stage 0: Fetch from NewsAPI.ai + RSS niche sources, then merge
echo "" | tee -a "$LOG_FILE"
echo "--- Stage 0: API + RSS feed fetch ---" | tee -a "$LOG_FILE"
T0=$SECONDS

# Step 1: NewsAPI.ai event-grouped fetch (5 queries = 9 tokens, + up to 8 per-event calls)
rm -f /tmp/zuhd-feed-api.json
node scripts/fetch-news-api.js 2>>"$LOG_FILE"
API_EXIT=$?
if [ "$API_EXIT" -ne 0 ]; then
  echo "⚠ API fetch failed (exit $API_EXIT) — see log for error. RSS-only cycle." | tee -a "$LOG_FILE"
fi
API_STATS=$(node -e "try{const d=JSON.parse(require('fs').readFileSync('/tmp/zuhd-feed-api.json'));console.log(d.stories.length+' stories from '+d.events+' events')}catch{console.log('failed')}" 2>/dev/null)
echo "API fetch: $API_STATS" | tee -a "$LOG_FILE"

# Step 2: RSS niche sources (HN, 404 Media, Bellingcat, Mada Masr, etc.)
node scripts/fetch-news.js 2>>"$LOG_FILE"
RSS_EXIT=$?
if [ "$RSS_EXIT" -ne 0 ]; then
  echo "⚠ RSS fetch failed (exit $RSS_EXIT)" | tee -a "$LOG_FILE"
fi
RSS_STATS=$(node -e "try{const d=JSON.parse(require('fs').readFileSync('/tmp/zuhd-feed-rss.json'));console.log(d.stories?.length||d.freshItems||0)}catch{console.log('0')}" 2>/dev/null)
echo "RSS fetch: ${RSS_STATS} stories" | tee -a "$LOG_FILE"

# Abort if both fetches failed — no feed = no cycle
if [ "$API_EXIT" -ne 0 ] && [ "$RSS_EXIT" -ne 0 ]; then
  echo "✗ Both API and RSS fetches failed — aborting cycle" | tee -a "$LOG_FILE"
  exit 1
fi

# Step 3: Merge into unified feed
node scripts/merge-feeds.js 2>>"$LOG_FILE"
FEED_STATS=$(node -e "try{const d=JSON.parse(require('fs').readFileSync('/tmp/zuhd-feed.json'));console.log((d.multiSourceStories?.length||0)+' multi + '+(d.nicheStories?.length||0)+' niche')}catch{console.log('failed')}" 2>/dev/null)
FUNNEL_FEED="$FEED_STATS"
echo "Merged feed: $FEED_STATS — $((SECONDS - T0))s" | tee -a "$LOG_FILE"

# Step 4: Pre-filter feed — remove stories that match already-published articles
node scripts/prefilter-feed.js 2>&1 | tee -a "$LOG_FILE"

# Stage 1: Selector — read pre-fetched feed, pick stories, save selection
echo "" | tee -a "$LOG_FILE"
echo "--- Stage 1: Selector ---" | tee -a "$LOG_FILE"
T1=$SECONDS
SELECT_PROMPT=$(cat scripts/select-prompt.md)
# Inject compact coverage map so selector understands today's topic landscape at a glance
TODAY_COVERAGE=$(node scripts/coverage-map.js 2>/dev/null)
if [ -n "$TODAY_COVERAGE" ]; then
  COVERAGE_GROUPS=$(echo "$TODAY_COVERAGE" | wc -l)
  SELECT_PROMPT="${SELECT_PROMPT}

Do not re-select stories already covered in the last 24 hours. Here is recent coverage grouped by topic — avoid duplicating any of these angles:
<recent-coverage>
${TODAY_COVERAGE}
</recent-coverage>"
  echo "Injecting coverage map (${COVERAGE_GROUPS} topic groups) into selector prompt" | tee -a "$LOG_FILE"
fi
# Inject Wikipedia trending-gap signal — yesterday's most-read pages we haven't
# covered. Free AQS call; fail-soft (empty output → no injection).
TRENDING_GAPS=$(timeout 15 node scripts/trending-gaps.js 2>/dev/null)
if [ -n "$TRENDING_GAPS" ]; then
  SELECT_PROMPT="${SELECT_PROMPT}

Yesterday's most-read Wikipedia articles that zuhd.news has NOT covered in the last 7 days. Most entries are entertainment noise — ignore those. But if one is verifiable hard news in our categories AND the feed carries sources for it, treat it as a public-attention signal that the story deserves selection weight:
<trending-uncovered>
${TRENDING_GAPS}
</trending-uncovered>"
  echo "Injecting trending-gaps signal ($(echo "$TRENDING_GAPS" | wc -l) titles) into selector prompt" | tee -a "$LOG_FILE"
fi
FALLBACK_FLAG=""
[ "$CLAUDE_SELECTOR_MODEL" != "$CLAUDE_MODEL" ] && FALLBACK_FLAG="--fallback-model $CLAUDE_MODEL"

run_selector() {
  timeout 1200 claude $CLAUDE_FLAGS --effort medium --model $CLAUDE_SELECTOR_MODEL $FALLBACK_FLAG --allowedTools $TOOLS_SELECTOR --max-turns 35 --exclude-dynamic-system-prompt-sections -p "$SELECT_PROMPT" 2>&1 | tee -a "$LOG_FILE"
}

run_selector
SELECT_EXIT=$?
echo "Selector exit: $SELECT_EXIT — $((SECONDS - T1))s" | tee -a "$LOG_FILE"

# Retry once if the selector exited cleanly but wrote no selection file —
# a recurring failure mode where the model hallucinates a sandbox restriction
# and returns prose instead of running the task. Roughly 8% of cycles in the
# week of 2026-05-10 to 2026-05-17 failed this way. The `<runtime>` preamble
# in select-prompt.md is the primary defence; this retry catches the residual.
if [ "$SELECT_EXIT" -eq 0 ] && [ ! -s /tmp/zuhd-selection.json ]; then
  echo "Selector returned 0 but produced no selection file — retrying once" | tee -a "$LOG_FILE"
  T1R=$SECONDS
  run_selector
  SELECT_EXIT=$?
  echo "Selector retry exit: $SELECT_EXIT — $((SECONDS - T1R))s" | tee -a "$LOG_FILE"
fi

# Abort if selector failed or produced no selection
if [ "$SELECT_EXIT" -ne 0 ]; then
  echo "Selector failed (exit $SELECT_EXIT) — aborting cycle" | tee -a "$LOG_FILE"
  exit 1
fi
if [ ! -s /tmp/zuhd-selection.json ]; then
  echo "No selection file produced after retry — skipping writer and editor" | tee -a "$LOG_FILE"
  exit 0
fi
# Guard against empty JSON array (selector wrote [] with 0 stories)
SELECTION_COUNT=$(node -e "const s=JSON.parse(require('fs').readFileSync('/tmp/zuhd-selection.json','utf8'));console.log(Array.isArray(s)?s.length:0)" 2>/dev/null || echo 0)
if [ "$SELECTION_COUNT" -eq 0 ]; then
  echo "Selection is empty (0 stories) — skipping writer and editor" | tee -a "$LOG_FILE"
  exit 0
fi
FUNNEL_SELECTED=$SELECTION_COUNT
echo "Selection contains $SELECTION_COUNT stories" | tee -a "$LOG_FILE"

# Stage 1.3: Enrich selection with full article bodies from /tmp/zuhd-feed.json
# (selector reads slim feed without bodies to save tokens; bodies restored here for the writer)
node scripts/enrich-selection.js 2>&1 | tee -a "$LOG_FILE"

# Stage 1.5: Remove already-published stories from selection (deterministic, no LLM)
# Runs BEFORE ledger update so only genuinely new stories enter the ledger
node scripts/dedup-selection.js 2>&1 | tee -a "$LOG_FILE"
SELECTION_COUNT=$(node -e "const s=JSON.parse(require('fs').readFileSync('/tmp/zuhd-selection.json','utf8'));console.log(Array.isArray(s)?s.length:0)" 2>/dev/null || echo 0)
FUNNEL_DEDUPED=$SELECTION_COUNT
DEDUP_DROPPED=$((FUNNEL_SELECTED - FUNNEL_DEDUPED))
[ "$DEDUP_DROPPED" -gt 0 ] && FUNNEL_DEDUP_NOTE="${DEDUP_DROPPED} already published"
if [ "$SELECTION_COUNT" -eq 0 ]; then
  echo "All selections already published — skipping writer and editor" | tee -a "$LOG_FILE"
  exit 0
fi

# Stage 1.55: Backfill selection — replace deduped stories to meet category floors
node scripts/backfill-selection.js 2>&1 | tee -a "$LOG_FILE"
SELECTION_COUNT=$(node -e "const s=JSON.parse(require('fs').readFileSync('/tmp/zuhd-selection.json','utf8'));console.log(Array.isArray(s)?s.length:0)" 2>/dev/null || echo 0)

# Stage 1.6: Update story ledger deterministically (moved out of selector LLM to save turns)
# Runs after dedup so only genuinely new stories get added to the ledger
node scripts/update-ledger.js 2>&1 | tee -a "$LOG_FILE"

# Stage 1.7: Attach live indicator levels to the selection, so the writer can
# cite a number rather than say "oil prices fell". Deterministic — reads the
# trends snapshot already on disk, no model call and no API call. Runs after
# backfill so it only works on the final story set. Fail-soft: a missing
# snapshot or an unreadable selection logs and exits 0, and the writer sees a
# selection with no `indicators` key, which is the state it has always handled.
node scripts/attach-indicators.js 2>&1 | tee -a "$LOG_FILE"

# Stage 2: Writer — read selection (with pre-loaded article bodies), draft markdown
echo "" | tee -a "$LOG_FILE"
echo "--- Stage 2: Writer ---" | tee -a "$LOG_FILE"
T2=$SECONDS
WRITE_PROMPT=$(cat scripts/write-prompt.md)

run_writer() {
  # --add-dir /tmp: without it, whether the model treats /tmp/zuhd-selection.json
  # as reachable is left to its own judgement, and since ~2026-08-01 it has
  # sometimes decided no ("File access ... is blocked in this session — it's
  # outside the allowed working directory"), killing the cycle. Observed 4 of
  # ~40 cycles (08-01, 08-03, 08-06, 08-08), 2 of them zero-publish; the retry
  # below re-issues the same prompt and reproduces the refusal rather than
  # clearing it, so this is the actual fix rather than the safety net.
  timeout 1800 claude $CLAUDE_FLAGS --effort medium --model $CLAUDE_MODEL --allowedTools $TOOLS_WRITER --add-dir /tmp --max-turns 60 --exclude-dynamic-system-prompt-sections -p "$WRITE_PROMPT" 2>&1 | tee -a "$LOG_FILE"
}

run_writer
WRITE_EXIT=$?
echo "Writer exit: $WRITE_EXIT — $((SECONDS - T2))s" | tee -a "$LOG_FILE"

# Retry once if the writer produced nothing, whatever its exit code.
#
# This was gated on `-eq 124`, the API-stall mode (2026-05-24, 2026-05-26,
# 2026-06-09) where `claude -p` idle-blocks for the full 1800s and the outer
# timeout kills it. That is one way to write nothing and it turned out to be the
# rare one. Over 2026-07-25→30, **five of 29 cycles published zero** and the
# retry fired for none of them, because the writer died in the first seventeen
# seconds every time and only twice with a non-zero status:
#
#   07-25 04:04  exit 0, 17s  "The command needs your approval to run — please
#                              approve it so I can inspect /tmp/zuhd-selection.json"
#                              (reached for Bash, which is not in TOOLS_WRITER,
#                              when the prompt says to Read the file)
#   07-26 04:04  exit 0,  6s  "I don't see a specific request in your message —
#                              just system context. What would you like me to do?"
#   07-28 22:02  exit 0,  6s  "I see the project context loaded but no actual
#                              request yet — what would you like me to do?"
#   07-29 12:04  exit 1,  9s  "The model's tool call could not be parsed
#                              (retry also failed)."
#   07-30 08:03  exit 1,  8s  same
#
# Three different transient flakes, one outcome, and an exit code that says
# nothing useful about any of them — two report success. So the condition that
# matters is the one the old code already computed and then guarded behind the
# status: **did this run write an article**. That is also exactly the shape of
# the selector's own retry above ("returned 0 but produced no selection file"),
# which has been catching the same class of failure for months.
#
# Safe to retry unconditionally here: an empty selection already exited the
# cycle back at Stage 1.5, so reaching this line having written nothing is
# always a failure and never a legitimate quiet cycle. A slow-but-productive
# run keeps its partial output, as before — the gate is articles, not time.
WRITER_PRODUCED=$( { git diff --name-only content/articles/ 2>/dev/null; git ls-files --others --exclude-standard content/articles/ 2>/dev/null; } | grep -c . )
if [ "$WRITER_PRODUCED" -eq 0 ]; then
  echo "Writer wrote no articles (exit $WRITE_EXIT) — retrying once" | tee -a "$LOG_FILE"
  T2R=$SECONDS
  run_writer
  WRITE_EXIT=$?
  echo "Writer retry exit: $WRITE_EXIT — $((SECONDS - T2R))s" | tee -a "$LOG_FILE"
fi

if [ "$WRITE_EXIT" -ne 0 ]; then
  echo "Writer failed (exit $WRITE_EXIT) — continuing with any partial output" | tee -a "$LOG_FILE"
fi

# Capture new articles from this cycle (modified + untracked)
NEW_ARTICLES=$( { git diff --name-only content/articles/ 2>/dev/null; git ls-files --others --exclude-standard content/articles/ 2>/dev/null; } | sort -u )
if [ -z "$NEW_ARTICLES" ]; then
  echo "No new articles — skipping editor and deploy" | tee -a "$LOG_FILE"
else
  NEW_COUNT=$(echo "$NEW_ARTICLES" | wc -l)
  FUNNEL_WRITTEN=$NEW_COUNT
  echo "Found $NEW_COUNT new/modified articles" | tee -a "$LOG_FILE"

  # Save the list so the editor checks only this batch (not all untracked files)
  echo "$NEW_ARTICLES" > /tmp/zuhd-new-articles.txt

  # Stage 2.5: Scaffold — enrich frontmatter with data from selection (no LLM needed)
  node scripts/scaffold-articles.js 2>&1 | tee -a "$LOG_FILE"

  # Stage 3: Editor — check only this cycle's articles against style rules
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3: Editor ---" | tee -a "$LOG_FILE"
  T3=$SECONDS
  CHECK_PROMPT=$(cat scripts/check-prompt.md)
  ARTICLE_LIST=$(cat /tmp/zuhd-new-articles.txt)
  # Measure body character counts — gives the editor exact data on which articles need trimming
  BODY_LENGTHS=$(node -e "
    const fs = require('fs');
    const lines = fs.readFileSync('/tmp/zuhd-new-articles.txt','utf8').trim().split('\n');
    // Count visible characters only — markdown link markup (e.g. [Iran](country:IR))
    // is invisible to readers, so it should not eat the char budget.
    // 350 is the soft target; OVER (editor must trim) fires only past the 400 hard ceiling.
    const visible = s => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '\$1');
    for (const f of lines) {
      try {
        const txt = fs.readFileSync(f,'utf8');
        const body = txt.split('---').slice(2).join('---').trim();
        const len = visible(body).length;
        const flag = len > 400 ? 'OVER' : 'ok';
        console.log(flag + ' ' + len + ' chars  ' + f);
      } catch {}
    }
  " 2>/dev/null)
  EDITOR_ADDENDUM="

IMPORTANT: Only check the files listed in <files> below (this cycle's batch). Do NOT scan for other untracked files.

<files>
$ARTICLE_LIST
</files>

<body-lengths>
$BODY_LENGTHS
</body-lengths>"
  run_editor() {
    timeout 1800 claude $CLAUDE_FLAGS --effort "${ZUHD_EDITOR_EFFORT:-low}" --model $CLAUDE_MODEL --allowedTools $TOOLS_EDITOR --max-turns 50 --exclude-dynamic-system-prompt-sections -p "$CHECK_PROMPT$EDITOR_ADDENDUM" 2>&1 | tee -a "$LOG_FILE"
  }
  run_editor
  EDITOR_EXIT=$?
  echo "Editor exit: $EDITOR_EXIT — $((SECONDS - T3))s" | tee -a "$LOG_FILE"
  # Retry once on timeout — parity with selector/writer. Editing is idempotent
  # (rule-checks against files on disk), so a partial first pass is safe to redo.
  if [ "$EDITOR_EXIT" -eq 124 ]; then
    echo "Editor timed out — retrying once" | tee -a "$LOG_FILE"
    T3R=$SECONDS
    run_editor
    EDITOR_EXIT=$?
    echo "Editor retry exit: $EDITOR_EXIT — $((SECONDS - T3R))s" | tee -a "$LOG_FILE"
  fi

  # Stage 3.4: Live trends digest — feeds the edu-context stage. Fail-soft:
  # missing keys / missing sources just shrink the offered indicator list.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.4: Trends fetch ---" | tee -a "$LOG_FILE"
  T34=$SECONDS
  timeout 120 node scripts/fetch-trends.js >> "$LOG_FILE" 2>&1
  TRENDS_EXIT=$?
  echo "Trends exit: $TRENDS_EXIT — $((SECONDS - T34))s" | tee -a "$LOG_FILE"

  # Stage 3.4b: Chokepoints snapshot — ambient globe layer on mobile. Single
  # PortWatch query, independent of the trend-block pipeline. Fail-soft.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.4b: Chokepoints snapshot ---" | tee -a "$LOG_FILE"
  T34B=$SECONDS
  timeout 60 node scripts/fetch-chokepoints.js >> "$LOG_FILE" 2>&1
  CHOKEPOINTS_EXIT=$?
  echo "Chokepoints exit: $CHOKEPOINTS_EXIT — $((SECONDS - T34B))s" | tee -a "$LOG_FILE"

  # Stage 3.4b2: Market snapshot — the map's stock-exchange layer. One Yahoo
  # call per exchange, sequential because parallel trips their rate limit on a
  # shared IP (~10s for 30). Fail-soft: leaves the previous snapshot in place.
  # The five cycles a day happen to sample the trading day well — 04:00 UTC
  # catches the Asian close, 08:00 the Gulf, 12:00 European midday, 17:00 the
  # European close, 22:00 the US close.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.4b2: Market snapshot ---" | tee -a "$LOG_FILE"
  T34B2=$SECONDS
  timeout 90 node scripts/fetch-markets.js >> "$LOG_FILE" 2>&1
  MARKETS_EXIT=$?
  echo "Markets exit: $MARKETS_EXIT — $((SECONDS - T34B2))s" | tee -a "$LOG_FILE"

  # Stage 3.4c: GDACS snapshot — disaster layer on mobile. Pulls EVENTS4APP
  # list + per-event population details (EQ shakepop, TC JTWC buffer impact)
  # in one batch so every install reads from /api/gdacs.json instead of
  # hitting gdacs.org on launch + every sheet open. Fail-soft.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.4c: GDACS snapshot ---" | tee -a "$LOG_FILE"
  T34C=$SECONDS
  timeout 120 node scripts/fetch-gdacs.js >> "$LOG_FILE" 2>&1
  GDACS_EXIT=$?
  echo "GDACS exit: $GDACS_EXIT — $((SECONDS - T34C))s" | tee -a "$LOG_FILE"

  # Stage 3.4c2: Conflict-events snapshot — UCDP candidate GED for the
  # mobile globe's conflict layer. Cached upstream-side at 6h since UCDP
  # candidate refreshes monthly. Fail-soft: prior snapshot stays in place
  # on any error and mobile renders empty when /api/conflict.json 404s.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.4c2: Conflict snapshot ---" | tee -a "$LOG_FILE"
  T34C2=$SECONDS
  timeout 120 node scripts/fetch-conflict.js >> "$LOG_FILE" 2>&1
  CONFLICT_EXIT=$?
  echo "Conflict exit: $CONFLICT_EXIT — $((SECONDS - T34C2))s" | tee -a "$LOG_FILE"

  # Stage 3.4c3: IODA internet outage snapshot — country connectivity scored
  # against each country's own 90-day baseline. No surface renders it yet (the
  # signal does not separate a shutdown from a cable fault — see the header of
  # fetch-ioda.js); running it now accumulates the per-cycle series that any
  # future threshold would have to be calibrated against. Two requests, ~5 KB.
  # Fail-soft: prior snapshot stays in place on any error.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.4c3: IODA outage snapshot ---" | tee -a "$LOG_FILE"
  T34C3=$SECONDS
  timeout 90 node scripts/fetch-ioda.js >> "$LOG_FILE" 2>&1
  IODA_EXIT=$?
  echo "IODA exit: $IODA_EXIT — $((SECONDS - T34C3))s" | tee -a "$LOG_FILE"

  # Stage 3.4c4: Thermal-anomaly snapshot — NASA FIRMS active-fire detections,
  # for the map's `thermal` layer. One request per 10° cell of the corpus's own
  # geography (~116 cells, ~20s measured), then clustered and filtered against a
  # 5-day persistence baseline because the NRT product carries no `type` column
  # to identify a gas flare. Needs FIRMS_MAP_KEY; without it the stage logs a
  # skip and the layer is simply absent. Fail-soft: prior snapshot stays in
  # place on any error, and build.js drops the endpoint when the file is missing.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.4c4: Thermal anomaly snapshot ---" | tee -a "$LOG_FILE"
  T34C4=$SECONDS
  timeout 180 node scripts/fetch-firms.js >> "$LOG_FILE" 2>&1
  FIRMS_EXIT=$?
  echo "FIRMS exit: $FIRMS_EXIT — $((SECONDS - T34C4))s" | tee -a "$LOG_FILE"

  # Stage 3.4c5: IPC acute food insecurity — the famine layer. One CKAN
  # catalogue call, one global CSV, then geometry for the countries holding an
  # Emergency or Catastrophe caseload. CC0 and keyless, so unlike FIRMS there is
  # no credential branch to skip on. Fail-soft: a bad pass leaves the previous
  # snapshot and exits 0. Runs every cycle rather than daily because it is cheap
  # (~13s) and because the alternative — a schedule of its own — is a second
  # place for the layer to go stale silently.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.4c5: IPC food insecurity snapshot ---" | tee -a "$LOG_FILE"
  T34C5=$SECONDS
  timeout 240 node scripts/fetch-ipc.js >> "$LOG_FILE" 2>&1
  IPC_EXIT=$?
  echo "IPC exit: $IPC_EXIT — $((SECONDS - T34C5))s" | tee -a "$LOG_FILE"

  # Stage 3.4d: GDACS narration — Opus writes a 2-3 sentence narrative for
  # each Orange/Red alert grounded in country profile + recent weather +
  # nearby chokepoint. Cached by inputs-hash so multi-day events aren't
  # re-narrated each cycle. Fail-soft.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.4d: GDACS narration ---" | tee -a "$LOG_FILE"
  T34D=$SECONDS
  timeout 600 node scripts/narrate-gdacs.js >> "$LOG_FILE" 2>&1
  NARRATE_EXIT=$?
  echo "Narration exit: $NARRATE_EXIT — $((SECONDS - T34D))s" | tee -a "$LOG_FILE"

  # Stage 3.5 (Educational context briefs) removed 2026-06-19: the per-article
  # generator (scripts/generate-edu-context.js) outgrew its 1200s budget as the
  # 16MB .context-briefs.json inflated each prompt, timing out and producing
  # nothing since 2026-06-14. We've stopped generating new briefs. The existing
  # frozen content/.context-briefs.json is still committed, built, and served
  # (site context + /api/context/{id}.json), so the app keeps showing context
  # for articles up to 2026-06-14. To resume, restore this stage — ideally with
  # incremental writes + a finite brief cap + bounded concurrency.

  # Stage 3.6: Entity extraction — scan article bodies for known rich nouns
  # (commodities, currencies, chokepoints, crypto, indices, stocks) and
  # write their indicator ids into frontmatter. Mobile renders these as
  # tappable runs opening an EntitySheet. Mostly deterministic; uses Haiku
  # for ambiguous currencies (rupee→PK/IN, pound→EG/LB) and for stock NER.
  # Timeout generous to accommodate 2 Haiku calls + ~15 Yahoo fetches.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.6: Entity extraction ---" | tee -a "$LOG_FILE"
  T36=$SECONDS
  timeout 180 node scripts/extract-entities.js 2>&1 | tee -a "$LOG_FILE"
  echo "Entities exit: $? — $((SECONDS - T36))s" | tee -a "$LOG_FILE"

  # Stage 3.7: Source-angle extraction — for each source URL, fetch and
  # summarize its distinctive framing via one batched Haiku call. Writes
  # `angle` + improved `sentiment` back to each article's sources[] list.
  # Mobile can surface this when the user taps a source. Soft-fails on
  # paywall/bot-block; missing angle is a valid state.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.7: Source angles ---" | tee -a "$LOG_FILE"
  T37=$SECONDS
  timeout 300 node scripts/extract-source-angles.js 2>&1 | tee -a "$LOG_FILE"
  echo "Source angles exit: $? — $((SECONDS - T37))s" | tee -a "$LOG_FILE"

  # Stage 3.75: Swedish desk — translate the 48h window into Swedish for
  # islam.se, which carries a small news band fed from /api/sv/feed.json.
  # Nothing Swedish is rendered on zuhd.news.
  #
  # It scans the window rather than this cycle's new articles, so a failed
  # cycle self-heals on the next one instead of leaving a hole in islam.se's
  # afternoon; the fingerprint cache in content/.sv.json is what keeps that
  # from re-translating ~110 articles every time.
  #
  # Behind `|| echo WARNING` like every advisory stage: a translation failure
  # must never be able to stop the publish.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.75: Swedish desk ---" | tee -a "$LOG_FILE"
  T375=$SECONDS
  timeout 600 node scripts/translate-swedish.js 2>&1 | tee -a "$LOG_FILE" \
    || echo "WARNING: swedish translation failed (non-fatal — islam.se keeps the previous payload)" | tee -a "$LOG_FILE"
  echo "Swedish desk exit: $? — $((SECONDS - T375))s" | tee -a "$LOG_FILE"

  # Stage 3b: Build and deploy — always runs, even if editor timed out
  # This ensures articles get published regardless of editor success
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3b: Build & Deploy ---" | tee -a "$LOG_FILE"

  # Validate new articles — move malformed ones aside so they don't get deployed
  node scripts/validate-articles.js 2>&1 | tee -a "$LOG_FILE"
  # Count surviving articles (validated = written - .bad files)
  BAD_COUNT=$(find content/articles -name '*.bad' -newer "$LOG_FILE" 2>/dev/null | wc -l)
  FUNNEL_VALIDATED=$((NEW_COUNT - BAD_COUNT))
  [ "$BAD_COUNT" -gt 0 ] && FUNNEL_VALID_NOTE="${BAD_COUNT} removed"

  # Write .last-cycle.json from validated articles (not raw selection)
  # This ensures the selector next cycle only skips stories that were actually published
  node scripts/write-last-cycle.js 2>&1 | tee -a "$LOG_FILE"

  # Stage 3a.5: Social pick — re-rank the eligible breaking candidates for
  # social-attention potential and write an optimized `socialTitle` into the
  # winner's frontmatter BEFORE build, so the baked /api/ig/{slug}.jpg card and
  # the X card render the punchier headline. Writes content/.breaking-pick.json
  # for the push/X/IG block below. Fail-soft: on any error the block falls back
  # to its own eventCoverage ordering, so this never blocks a push.
  rm -f content/.breaking-pick.json
  timeout 60 node scripts/pick-breaking-social.js 2>&1 | tee -a "$LOG_FILE" \
    || echo "WARNING: social pick failed (non-fatal, legacy selection applies)" | tee -a "$LOG_FILE"

  # Typecheck — reports, never blocks. Both tsconfigs, ~5s on the Go compiler.
  #
  # This exists because a type error reaches this box the same way a content
  # change does: `git pull --rebase` a few lines below, followed by `npm
  # install`. CI catches it on push, but the cycle is what runs next, and a
  # silent WARNING in the log is how the dashboard's Logs tab surfaces drift.
  #
  # The `|| echo` is mandatory and so is the timeout. Everything from here to
  # the deploy is written so that build+commit+deploy always runs even when an
  # earlier stage times out — that property is what stops a timeout turning
  # into a no-publish cascade, and a checker must never be the thing that
  # breaks it. If the types are wrong the build usually still emits a correct
  # site; if it doesn't, BUILD_EXIT below is what stops the deploy.
  timeout 120 npm run typecheck 2>&1 | tee -a "$LOG_FILE" \
    || echo "WARNING: typecheck failed (non-fatal — see above)" | tee -a "$LOG_FILE"

  # Build — retry on a held lock instead of abandoning the deploy outright.
  # The lock (added 2026-08-09) stops two builds racing dist/ writes, but a
  # long-lived local `npm run dev` (scripts/watch.js) rebuilds on every
  # article write and can hold the lock right when this stage starts,
  # costing an entire cycle's publication with no wait or retry (08-09 17:22
  # → 08-10 17:33, 6 of 7 cycles). A dev build finishes in seconds; three
  # tries at 20s apart clears that without meaningfully delaying a stuck cycle.
  BUILD_ATTEMPT=1
  while :; do
    BUILD_OUTPUT=$(node scripts/build.js 2>&1)
    BUILD_EXIT=$?
    echo "$BUILD_OUTPUT" | tee -a "$LOG_FILE"
    if [ "$BUILD_EXIT" -eq 0 ] || [ "$BUILD_ATTEMPT" -ge 3 ] \
      || ! echo "$BUILD_OUTPUT" | grep -q "Another build is already running"; then
      break
    fi
    echo "Build lock held — retrying in 20s (attempt $BUILD_ATTEMPT/3)" | tee -a "$LOG_FILE"
    sleep 20
    BUILD_ATTEMPT=$((BUILD_ATTEMPT + 1))
  done
  echo "Build exit: $BUILD_EXIT" | tee -a "$LOG_FILE"

  if [ "$BUILD_EXIT" -eq 0 ]; then
    # Commit
    CYCLE_TIME=$(date -u +"%Y-%m-%d %H:%M UTC")
    commit_only "Editorial cycle $CYCLE_TIME: $NEW_COUNT articles" \
      content/articles/ content/.last-cycle.json content/.story-ledger.json content/.context-briefs.json content/.sv.json
    # --autostash: the working tree always carries uncommitted churn (.analytics.json,
    # .block-cache.json, rotated feed-snapshots) that a plain `pull --rebase` refuses to
    # run over ("You have unstaged changes"), which let the remote drift unmerged and every
    # subsequent push fail non-fast-forward (2026-05-22→27 divergence). Autostash reconciles
    # regardless. The remote's only parallel writer is mobile/ work — disjoint from content/.
    git pull --rebase --autostash origin master 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: git pull --rebase failed (likely a mobile/backend file overlap — investigate)" | tee -a "$LOG_FILE"
    # Install any new build deps the pull may have added (fast no-op when
    # unchanged) so the next build.js doesn't crash on a missing module.
    npm install --no-audit --no-fund 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: npm install after pull failed" | tee -a "$LOG_FILE"
    git push origin master 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: git push failed" | tee -a "$LOG_FILE"

    # Deploy
    npx wrangler pages deploy dist --project-name zuhd-news --branch master --commit-dirty=true 2>&1 | tee -a "$LOG_FILE"
    DEPLOY_EXIT=$?
    echo "Deploy exit: $DEPLOY_EXIT" | tee -a "$LOG_FILE"
    if [ "$DEPLOY_EXIT" -eq 0 ]; then
      FUNNEL_PUBLISHED=$FUNNEL_VALIDATED

      # Push notifications for breaking stories
      BREAKING_JSON=$(node -e "
        const fs = require('fs');
        const ledger = JSON.parse(fs.readFileSync('content/.story-ledger.json','utf8'));
        const cycle = JSON.parse(fs.readFileSync('content/.last-cycle.json','utf8'));
        const slugs = new Set(cycle.articles.map(a => a.slug));
        // Read frontmatter + lead paragraph from article markdown
        function readArticle(slug) {
          try {
            const md = fs.readFileSync('content/articles/' + slug + '.md', 'utf8');
            const m = md.match(/^---\n([\s\S]*?)\n---/);
            if (!m) return {};
            const fm = {};
            for (const line of m[1].split('\n')) {
              const kv = line.match(/^(\w+):\s*\"?([^\"]+)\"?/);
              if (kv) fm[kv[1]] = kv[2].trim();
            }
            // First non-empty paragraph after frontmatter
            const body = md.slice(m[0].length).trim().split(/\n\n/)[0] || '';
            // Strip location prefix (e.g. 'Washington — ') and end at a clean sentence boundary
            const raw = body.replace(/^[A-Za-z\s,]+\s—\s/, '');
            const cut = raw.slice(0, 80);
            const lastSpace = cut.lastIndexOf(' ');
            fm.lead = lastSpace > 30 ? cut.slice(0, lastSpace) : cut;
            return fm;
          } catch { return {}; }
        }
        const candidates = ledger.stories
          .filter(s => s.arc === 'breaking' && s.coverageCount === 1)
          .flatMap(s => (s.articles || []).filter(sl => slugs.has(sl)).map(sl => {
            const fm = readArticle(sl);
            return {
              slug: sl,
              title: fm.title || s.label,
              category: fm.category || s.category || 'news',
              body: fm.lead || '',
              eventCoverage: parseInt(fm.eventCoverage) || 0,
              importance: s.importance || 0
            };
          }))
          .sort((a, b) => b.eventCoverage - a.eventCoverage);
        // Experiment 2026-04-16-push-min-coverage: require eventCoverage >= 1
        // (multi-source validation). Skips pushes when top candidate is niche-only.
        const MIN_PUSH_COVERAGE = 1;
        const eligible = candidates.filter(c => c.eventCoverage >= MIN_PUSH_COVERAGE);
        // Honor the pre-build social pick (pick-breaking-social.js) when it
        // named an eligible slug; otherwise keep the eventCoverage ordering.
        let ordered = eligible;
        try {
          const pick = JSON.parse(fs.readFileSync('content/.breaking-pick.json','utf8'));
          const idx = pick && pick.slug ? eligible.findIndex(c => c.slug === pick.slug) : -1;
          if (idx > 0) ordered = [eligible[idx], ...eligible.slice(0, idx), ...eligible.slice(idx + 1)];
        } catch {}
        const selected = ordered.slice(0, 1)
          .map(({ slug, title, category, body, eventCoverage, importance }) => ({ slug, title, category, body, eventCoverage, importance }));
        const skipReason = (candidates.length > 0 && eligible.length === 0)
          ? \`all \${candidates.length} candidates below coverage threshold \${MIN_PUSH_COVERAGE}\`
          : null;

        // Log all candidates and the decision to push-log.json
        const logPath = 'content/.push-log.json';
        let pushLog = [];
        try { pushLog = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch {}
        pushLog.push({
          timestamp: new Date().toISOString(),
          candidateCount: candidates.length,
          candidates: candidates.map(c => ({
            slug: c.slug, title: c.title, category: c.category,
            eventCoverage: c.eventCoverage, importance: c.importance
          })),
          selected: selected[0] || null,
          skipReason,
          sent: false
        });
        // Keep last 100 entries
        if (pushLog.length > 100) pushLog = pushLog.slice(-100);
        fs.writeFileSync(logPath, JSON.stringify(pushLog, null, 2));

        if (selected.length) console.log(JSON.stringify({ articles: selected }));
      ")
      if [ -n "$BREAKING_JSON" ] && [ -n "$PUSH_SECRET" ]; then
        # Craft notification body with Claude — the article lead isn't written for push
        PUSH_SLUG=$(echo "$BREAKING_JSON" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.articles[0]?.slug||'')")
        if [ -n "$PUSH_SLUG" ] && [ -f "content/articles/${PUSH_SLUG}.md" ]; then
          ARTICLE_TEXT=$(cat "content/articles/${PUSH_SLUG}.md")
          PUSH_NOTIF=$(timeout 30 claude $CLAUDE_FLAGS --model $CLAUDE_MODEL --effort medium --tools "" -p "Write ONE push notification body for this article. Title is already 'Breaking News' — you write only the body.

Write like a Reuters/AP wire alert. Match these in length and tone:
- Fed raises interest rates by 25 basis points
- Turkey earthquake kills more than 40,000, officials say
- Oil prices surge past \$100 a barrel
- Ukraine's Zelenskiy says missile struck Odesa port
- Supreme Court overturns Chevron doctrine in landmark ruling
- Syria's Assad flees to Russia as rebels seize Damascus
- North Korea fires ballistic missile over Japan
- EU agrees to ban Russian oil imports by end of year

Rules:
- Present tense ('raises' not 'raised', 'kills' not 'killed')
- Subject first, then active verb, then consequence
- Drop articles (the, a, an) and auxiliary verbs (is, are, was)
- Attribution at end if needed: 'officials say' or 'sources say'
- Digits for all numbers
- One fact only — no context, no hedging, no adjectives
- No period at the end
- 8-12 words

Output ONLY the line, nothing else.

Article:
$ARTICLE_TEXT" 2>/dev/null)
          if [ -n "$PUSH_NOTIF" ]; then
            # Inject title + first non-empty line of Claude's output into BREAKING_JSON
            # in a single node pass. Fails loudly if the body can't be extracted.
            INJECTED=$(NOTIF="$PUSH_NOTIF" node -e "
              const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
              const body = (process.env.NOTIF||'').trim().split(/\r?\n/).map(l=>l.trim()).filter(Boolean)[0];
              if (!body) { process.stderr.write('empty push body from claude\n'); process.exit(2); }
              d.articles[0].title = 'Breaking News';
              d.articles[0].body = body;
              process.stdout.write(JSON.stringify(d));
            " <<< "$BREAKING_JSON" 2>>"$LOG_FILE")
            if [ -n "$INJECTED" ]; then
              BREAKING_JSON="$INJECTED"
            else
              echo "⚠ Push body injection failed — skipping this push" | tee -a "$LOG_FILE"
              BREAKING_JSON=""
            fi
          fi
        fi
        if [ -n "$BREAKING_JSON" ]; then
          echo "Pushing breaking news: $BREAKING_JSON" | tee -a "$LOG_FILE"
          PUSH_RESPONSE=$(curl -s -X POST "https://zuhd.news/api/push" \
            -H "Authorization: Bearer $PUSH_SECRET" \
            -H "Content-Type: application/json" \
            -d "$BREAKING_JSON")
          echo "$PUSH_RESPONSE" | tee -a "$LOG_FILE"
          # Update push log: derive title/body from the sent JSON itself (no shell-var coupling)
          BJSON="$BREAKING_JSON" PRESP="${PUSH_RESPONSE:-}" node -e "
            const fs = require('fs');
            const logPath = 'content/.push-log.json';
            try {
              const sent = JSON.parse(process.env.BJSON);
              const art = sent.articles?.[0] || {};
              const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
              const last = log[log.length - 1];
              if (last) {
                last.sent = true;
                last.pushTitle = art.title;
                last.pushBody = art.body;
                try { last.response = JSON.parse(process.env.PRESP); } catch { last.response = process.env.PRESP; }
              }
              fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
            } catch (e) { process.stderr.write('push-log update failed: ' + e.message + '\n'); }
          " 2>>"$LOG_FILE"
          # Mirror the same breaking story to X/Twitter as one plain-text tweet.
          # Non-fatal: the tweet step condenses via Claude, signs OAuth 1.0a, and
          # dedups via content/.tweet-log.json; any failure must not abort the cycle.
          if [ -n "$PUSH_SLUG" ]; then
            timeout 60 node scripts/post-to-twitter.js --slug "$PUSH_SLUG" 2>&1 | tee -a "$LOG_FILE" \
              || echo "⚠ tweet step failed (non-fatal)" | tee -a "$LOG_FILE"
          fi
          # Mirror the same breaking story to Instagram: the /api/ig/{slug}.jpg
          # card (deployed above) plus a Claude-written caption, a first-comment
          # article link, and a Story cross-post. Non-fatal, deduped via
          # content/.instagram-log.json; any failure must not abort the cycle.
          if [ -n "$PUSH_SLUG" ]; then
            timeout 90 node scripts/post-to-instagram.js --slug "$PUSH_SLUG" 2>&1 | tee -a "$LOG_FILE" \
              || echo "⚠ instagram step failed (non-fatal)" | tee -a "$LOG_FILE"
          fi
        fi
      fi
      # Commit push + social logs
      commit_only "Push log $(date -u +%Y-%m-%dT%H:%M)" \
        content/.push-log.json content/.tweet-log.json content/.instagram-log.json

      # Stage 3c: Production RVS — score this cycle's output against the
      # autoresearch rubric (deterministic clusters only, zero token cost),
      # append to content/.rvs-trend.json. Fail-soft: never blocks the cycle.
      timeout 60 node scripts/score-production-cycle.js 2>&1 | tee -a "$LOG_FILE"
      commit_only "RVS trend $(date -u +%Y-%m-%dT%H:%M)" content/.rvs-trend.json
    fi
  else
    echo "Build failed — skipping deploy" | tee -a "$LOG_FILE"
  fi
fi

# Stage 3.8: Indicator dispatch (04:00 UTC only) — Opus writes two sentences for
# every instrument the rail shows a number for: what it is, and what has
# happened to it and why. Grounded in our own corpus plus the merged feed
# snapshots, so it costs nothing at the news API. Writes
# content/.indicator-dispatch.json; the build joins it onto /api/trends.json,
# /api/chokepoints.json, /api/markets.json and /api/entity/{id}.json.
#
# Placed *before* Stage 4 deliberately: the briefing rebuilds and redeploys
# below, so the prose ships on that pass rather than needing a deploy of its
# own. If Stage 4 is skipped or fails, the next cycle's Stage 3b build picks the
# file up — which is why it commits here rather than waiting.
#
# Cached on two fingerprints (identity, and the story behind the move), so a
# steady day is close to free: measured 98 items / $17.60 cold, 0 calls when
# nothing changed, 6 items / $1.26 after one cycle of 12 new articles. The
# timeout covers a cold run (~18 min measured) and is behind `|| echo WARNING`
# so it can never hold up a publish.
HOUR_UTC=$(date -u +%H)
if [ "${START_HOUR:-$HOUR_UTC}" = "04" ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.8: Indicator dispatch ---" | tee -a "$LOG_FILE"
  T38=$SECONDS
  timeout 1500 node scripts/narrate-indicators.js 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: indicator dispatch failed" | tee -a "$LOG_FILE"
  echo "Dispatch — $((SECONDS - T38))s" | tee -a "$LOG_FILE"
  commit_only "Indicator dispatch $(date -u +%Y-%m-%dT%H:%M)" content/.indicator-dispatch.json

  # Stage 3.8b: Event dispatch — same fingerprint-cached shape as 3.8, for the
  # money rail's events block (central-bank decisions, OPEC+, major non-US
  # releases, summits). An event weeks out is only re-narrated when its
  # countdown bucket changes or new coverage attaches to it, never every run.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.8b: Event dispatch ---" | tee -a "$LOG_FILE"
  T38B=$SECONDS
  timeout 600 node scripts/narrate-events.js 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: event dispatch failed" | tee -a "$LOG_FILE"
  echo "Event dispatch — $((SECONDS - T38B))s" | tee -a "$LOG_FILE"
  commit_only "Event dispatch $(date -u +%Y-%m-%dT%H:%M)" content/.events-dispatch.json
else
  # Not the full pass — only instruments that have never been narrated. Daily is
  # the right cadence for rewriting an explanation, but appearing is a different
  # event: Polymarket questions rotate every cycle and the `wiki-*` set is
  # re-picked from our own concepts, so a new instrument could sit on the site
  # for up to 24 hours with no prose. On the web that is a card missing a
  # paragraph; in the app it is no card at all, because the graph decks admit
  # only instruments that have an explanation — which is why the outlook column
  # was one or two cards deep.
  #
  # `--new-only` skips anything already cached even when its fingerprints have
  # moved, so this cannot do 04:00's job early, and it does not prune. Steady
  # state is zero calls and the run exits in seconds; the timeout is sized for
  # the handful of items a rotation actually produces, not for a cold pass.
  #
  # This commits but does not deploy — Stage 4's rebuild is 04:00-only, so the
  # prose ships on the *next* cycle's Stage 3b build. That is ~4 hours rather
  # than the up-to-24 it replaces, and buying the difference would mean a build
  # and a deploy on every cycle for a paragraph.
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.8: Indicator dispatch (new instruments only) ---" | tee -a "$LOG_FILE"
  T38=$SECONDS
  timeout 420 node scripts/narrate-indicators.js --new-only 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: indicator dispatch (new-only) failed" | tee -a "$LOG_FILE"
  echo "Dispatch (new-only) — $((SECONDS - T38))s" | tee -a "$LOG_FILE"
  commit_only "Indicator dispatch $(date -u +%Y-%m-%dT%H:%M)" content/.indicator-dispatch.json
fi

# Stage 3.9: Cloudflare analytics fetch (04:00 UTC only — low-frequency, fail-soft)
# Writes content/.analytics.json with past-7d per-article pageview counts.
# Requires CLOUDFLARE_API_TOKEN with Zone > Analytics > Read — skips silently otherwise.
HOUR_UTC=$(date -u +%H)
if [ "${START_HOUR:-$HOUR_UTC}" = "04" ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.9: Analytics fetch ---" | tee -a "$LOG_FILE"
  T39=$SECONDS
  timeout 60 node scripts/fetch-analytics.js 2>&1 | tee -a "$LOG_FILE"
  echo "Analytics fetch — $((SECONDS - T39))s" | tee -a "$LOG_FILE"
fi

# Stage 4: Audio briefing — generate at 04:00 UTC cycle only (morning for GCC→India)
# Timer schedule: 04, 08, 12, 17, 22 UTC — check start hour, not current hour
HOUR_UTC=$(date -u +%H)
if [ "${START_HOUR:-$HOUR_UTC}" = "04" ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 4: Audio briefing ---" | tee -a "$LOG_FILE"
  timeout 900 node scripts/generate-briefing.js 2>&1 | tee -a "$LOG_FILE"
  BRIEFING_EXIT=$?
  echo "Briefing exit: $BRIEFING_EXIT" | tee -a "$LOG_FILE"
  if [ "$BRIEFING_EXIT" -eq 0 ]; then
    echo "Rebuilding and redeploying with audio..." | tee -a "$LOG_FILE"
    node scripts/build.js 2>&1 | tee -a "$LOG_FILE"
    commit_only "Audio briefing $(date -u +%Y-%m-%d)" content/audio/
    git pull --rebase --autostash origin master 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: git pull --rebase failed (likely a mobile/backend file overlap — investigate)" | tee -a "$LOG_FILE"
    # Install any new build deps the pull may have added (fast no-op when
    # unchanged) so the next build.js doesn't crash on a missing module.
    npm install --no-audit --no-fund 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: npm install after pull failed" | tee -a "$LOG_FILE"
    git push origin master 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: git push failed" | tee -a "$LOG_FILE"
    npx wrangler pages deploy dist --project-name zuhd-news --branch master --commit-dirty=true 2>&1 | tee -a "$LOG_FILE"
    DEPLOY_EXIT=$?

    # Stage 4b: Daily briefing push notification — fires once per day after
    # the audio is live. Body is a Claude-crafted topic line ("Hormuz $106 ·
    # BJP defects · DeepSeek V4 ships") so the reader learns what's in the
    # briefing without needing to open the app first. Idempotent via the
    # /api/push 7-day dedup keyed on the synthetic slug `briefing-${date}`.
    if [ "$DEPLOY_EXIT" -eq 0 ] && [ -n "$PUSH_SECRET" ]; then
      BRIEFING_DATE=$(date -u +%Y-%m-%d)
      # Top stories for the topic line — read straight from the ledger so
      # we don't need a second LLM pass to rank. Same filter the briefing
      # generator uses (importance >= 6 || arc breaking/developing), top 5.
      BRIEFING_TOP=$(node -e "
        const fs = require('fs');
        try {
          const ledger = JSON.parse(fs.readFileSync('content/.story-ledger.json','utf8'));
          const top = (ledger.stories || [])
            .filter(s => s.importance >= 6 || s.arc === 'breaking' || s.arc === 'developing')
            .sort((a, b) => (b.importance || 0) - (a.importance || 0))
            .slice(0, 5)
            .map(s => ({ label: s.label, category: s.category, arc: s.arc }));
          process.stdout.write(JSON.stringify(top));
        } catch (e) { process.stderr.write('briefing-top failed: ' + e.message + '\n'); }
      " 2>>"$LOG_FILE")
      if [ -n "$BRIEFING_TOP" ] && [ "$BRIEFING_TOP" != "[]" ]; then
        BRIEFING_BODY=$(timeout 30 claude $CLAUDE_FLAGS --model $CLAUDE_MODEL --effort medium --tools "" -p "Write ONE push notification body announcing today's daily news briefing audio is ready.

Format: 2 or 3 short topic phrases separated by ' · ' (middle-dot, U+00B7). The reader should be able to scan it in two seconds.

Examples:
- Hormuz \$106 · BJP defects in Punjab · El Niño by May
- Russia hits Dnipro · NATO arms shipment · DeepSeek V4 ships
- Sudan IMF stalls · Lebanon beekeeping · DOJ death penalty

Rules:
- 2 or 3 phrases, each 2-5 words
- Middle-dot separator with single spaces around it
- Prefer concrete subjects + active outcome over abstract topics
- Drop articles (the, a, an) and auxiliary verbs (is, are, was)
- Digits for all numbers
- 30-65 chars total
- No period at the end

Output ONLY the line, nothing else.

Top stories from today's briefing:
$BRIEFING_TOP" 2>/dev/null | head -1 | tr -d '\n')
        if [ -n "$BRIEFING_BODY" ]; then
          BRIEFING_PUSH_JSON=$(BODY="$BRIEFING_BODY" DATE="$BRIEFING_DATE" node -e "
            const body = (process.env.BODY || '').trim();
            const date = process.env.DATE;
            if (!body) process.exit(2);
            process.stdout.write(JSON.stringify({
              articles: [{
                slug: 'briefing-' + date,
                title: \"Today's Briefing\",
                body,
                channelId: 'briefing',
                priority: 'normal',
                data: { kind: 'briefing', date }
              }]
            }));
          " 2>>"$LOG_FILE")
          if [ -n "$BRIEFING_PUSH_JSON" ]; then
            echo "Pushing daily briefing: $BRIEFING_PUSH_JSON" | tee -a "$LOG_FILE"
            curl -s -X POST "https://zuhd.news/api/push" \
              -H "Authorization: Bearer $PUSH_SECRET" \
              -H "Content-Type: application/json" \
              -d "$BRIEFING_PUSH_JSON" 2>&1 | tee -a "$LOG_FILE"
            echo "" | tee -a "$LOG_FILE"
          else
            echo "⚠ Briefing push payload assembly failed — skipping" | tee -a "$LOG_FILE"
          fi
        else
          echo "⚠ Empty briefing-body from Claude — skipping push" | tee -a "$LOG_FILE"
        fi
      else
        echo "Briefing push skipped: no top stories in ledger" | tee -a "$LOG_FILE"
      fi
    fi
  fi
else
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 4: Audio briefing (skipped — ${START_HOUR:-$HOUR_UTC}:xx UTC, runs at 04:00 only) ---" | tee -a "$LOG_FILE"
fi

# Stage 5: Weekly quality snapshot — runs Sunday 22:00 UTC only.
# Just the deterministic metric scan; appends to content/.quality-trend.json
# for the dashboard's writing-quality panel. The LLM reflection step was
# removed — the daily tuning stage (Stage 6) covers parameter changes, and
# the ledger is maintained per-cycle by update-ledger.js.
DAY_OF_WEEK=$(date -u +%u)
if [ "$DAY_OF_WEEK" = "7" ] && [ "$START_HOUR" = "22" ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 5: Weekly quality snapshot ---" | tee -a "$LOG_FILE"
  node scripts/measure-quality.js 2>&1 | tee -a "$LOG_FILE"
else
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 5: Weekly quality snapshot (skipped — day $DAY_OF_WEEK $START_HOUR:00 UTC, runs Sunday 22:00 only) ---" | tee -a "$LOG_FILE"
fi

# Stage 6: Daily tuning — runs at last cycle of each day (22:30 UTC)
# Computes metrics, evaluates experiments, proposes bounded parameter changes
TOOLS_TUNE="Read,Write,Edit,Glob,Grep,Bash"
if [ "$START_HOUR" = "22" ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 6: Daily tuning ---" | tee -a "$LOG_FILE"
  T6=$SECONDS
  # Compute metrics deterministically (no LLM) — Claude reads the result
  node scripts/compute-metrics.js > /tmp/zuhd-metrics.json 2>>"$LOG_FILE"
  METRICS_OK=$?
  if [ "$METRICS_OK" -eq 0 ]; then
    TUNE_PROMPT=$(cat scripts/tune-prompt.md)
    # Opus for daily tuning — proposes bounded parameter changes that govern
    # the next day's 5 cycles. Same judgment class as reflect (just narrower
    # blast radius). Daily cadence makes Opus affordable; medium effort is
    # enough since the metric inputs are deterministic.
    # Timeout 600s (10min): Opus medium runs slower per turn than Sonnet
    # medium; doubling the budget keeps 15 max-turns comfortably in scope.
    timeout 600 claude $CLAUDE_FLAGS --effort medium --model claude-opus-5 --allowedTools $TOOLS_TUNE --max-turns 15 --exclude-dynamic-system-prompt-sections -p "$TUNE_PROMPT" 2>&1 | tee -a "$LOG_FILE"
    TUNE_EXIT=$?
    if [ "$TUNE_EXIT" = "124" ]; then
      echo "Tuning exit: 124 (TIMEOUT — exceeded 600s budget; bump if recurring) — $((SECONDS - T6))s" | tee -a "$LOG_FILE"
    else
      echo "Tuning exit: $TUNE_EXIT — $((SECONDS - T6))s" | tee -a "$LOG_FILE"
    fi
    # Tuning session handles its own git workflow (experiment branches + PRs).
    # Here we only commit the tracking files if they changed.
    AUDIT_CHANGES=$(git diff --name-only content/.experiments.json content/.daily-audit.json content/.daily-audit.md 2>/dev/null | wc -l)
    AUDIT_UNTRACKED=$(git ls-files --others --exclude-standard content/.daily-audit.json 2>/dev/null | wc -l)
    if [ "$((AUDIT_CHANGES + AUDIT_UNTRACKED))" -gt 0 ]; then
      AUDIT_DATE=$(date -u +%Y-%m-%d)
      commit_only "Daily audit $AUDIT_DATE" \
        content/.experiments.json content/.daily-audit.json content/.daily-audit.md
      git pull --rebase --autostash origin master 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: git pull --rebase failed (likely a mobile/backend file overlap — investigate)" | tee -a "$LOG_FILE"
      # Install any new build deps the pull may have added (fast no-op when unchanged).
      npm install --no-audit --no-fund 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: npm install after pull failed" | tee -a "$LOG_FILE"
    # Install any new build deps the pull may have added (fast no-op when
    # unchanged) so the next build.js doesn't crash on a missing module.
    npm install --no-audit --no-fund 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: npm install after pull failed" | tee -a "$LOG_FILE"
      git push origin master 2>&1 | tee -a "$LOG_FILE" || echo "WARNING: git push failed" | tee -a "$LOG_FILE"
    fi
  else
    echo "Metrics computation failed — skipping tuning" | tee -a "$LOG_FILE"
  fi
else
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 6: Daily tuning (skipped — $START_HOUR:xx UTC, runs at 22:00 only) ---" | tee -a "$LOG_FILE"
fi
