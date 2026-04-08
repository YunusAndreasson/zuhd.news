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
#   Editor:   Sonnet+medium — mechanical style checks + editorial judgment; medium is right balance
#   Reflect:  Sonnet+medium — reflective audit, low frequency
CLAUDE_MODEL="${ZUHD_MODEL:-sonnet}"
CLAUDE_SELECTOR_MODEL="${ZUHD_SELECTOR_MODEL:-opus}"
export ZUHD_MODEL="$CLAUDE_MODEL"

# Tool whitelist for Claude CLI (--dangerously-skip-permissions is blocked as root)
# Stage-specific tool sets: narrower access = fewer wrong turns
# Selector no longer needs Bash — RSS feed is pre-fetched to /tmp/zuhd-feed.json before session starts
TOOLS_SELECTOR="Read,Write,Glob,Grep"
TOOLS_WRITER="Read,Write"
TOOLS_EDITOR="Read,Edit,Glob,Grep"
TOOLS_REFLECT="Read,Write,Glob,Grep"
# Common flags for all headless Claude CLI invocations (no --model: passed per stage)
CLAUDE_FLAGS="--no-session-persistence"

mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H%M)
LOG_FILE="$LOG_DIR/cycle-$TIMESTAMP.log"

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

# Step 1: NewsAPI.ai event-grouped fetch (3 queries, 3 tokens)
node scripts/fetch-news-api.js 2>>"$LOG_FILE"
API_STATS=$(node -e "try{const d=JSON.parse(require('fs').readFileSync('/tmp/zuhd-feed-api.json'));console.log(d.stories.length+' stories from '+d.events+' events')}catch{console.log('failed')}" 2>/dev/null)
echo "API fetch: $API_STATS" | tee -a "$LOG_FILE"

# Step 2: RSS niche sources (HN, 404 Media, Bellingcat, Mada Masr, etc.)
node scripts/fetch-news.js 2>>"$LOG_FILE"
RSS_STATS=$(node -e "try{const d=JSON.parse(require('fs').readFileSync('/tmp/zuhd-feed-rss.json'));console.log(d.stories?.length||d.freshItems||0)}catch{console.log('0')}" 2>/dev/null)
echo "RSS fetch: ${RSS_STATS} stories" | tee -a "$LOG_FILE"

# Step 3: Merge into unified feed
node scripts/merge-feeds.js 2>>"$LOG_FILE"
FEED_STATS=$(node -e "try{const d=JSON.parse(require('fs').readFileSync('/tmp/zuhd-feed.json'));console.log((d.multiSourceStories?.length||0)+' multi + '+(d.nicheStories?.length||0)+' niche')}catch{console.log('failed')}" 2>/dev/null)
FUNNEL_FEED="$FEED_STATS"
echo "Merged feed: $FEED_STATS — $((SECONDS - T0))s" | tee -a "$LOG_FILE"

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
FALLBACK_FLAG=""
[ "$CLAUDE_SELECTOR_MODEL" != "$CLAUDE_MODEL" ] && FALLBACK_FLAG="--fallback-model $CLAUDE_MODEL"
timeout 1200 claude $CLAUDE_FLAGS --effort medium --model $CLAUDE_SELECTOR_MODEL $FALLBACK_FLAG --allowedTools $TOOLS_SELECTOR --max-turns 35 -p "$SELECT_PROMPT" 2>&1 | tee -a "$LOG_FILE"
SELECT_EXIT=$?
echo "Selector exit: $SELECT_EXIT — $((SECONDS - T1))s" | tee -a "$LOG_FILE"

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

# Stage 1.6: Update story ledger deterministically (moved out of selector LLM to save turns)
# Runs after dedup so only genuinely new stories get added to the ledger
node scripts/update-ledger.js 2>&1 | tee -a "$LOG_FILE"

# Stage 2: Writer — read selection (with pre-loaded article bodies), draft markdown
echo "" | tee -a "$LOG_FILE"
echo "--- Stage 2: Writer ---" | tee -a "$LOG_FILE"
T2=$SECONDS
WRITE_PROMPT=$(cat scripts/write-prompt.md)
timeout 1800 claude $CLAUDE_FLAGS --effort medium --model $CLAUDE_MODEL --allowedTools $TOOLS_WRITER --max-turns 60 -p "$WRITE_PROMPT" 2>&1 | tee -a "$LOG_FILE"
WRITE_EXIT=$?
echo "Writer exit: $WRITE_EXIT — $((SECONDS - T2))s" | tee -a "$LOG_FILE"

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
    for (const f of lines) {
      try {
        const txt = fs.readFileSync(f,'utf8');
        const body = txt.split('---').slice(2).join('---').trim();
        const len = body.length;
        const flag = len > 350 ? 'OVER' : 'ok';
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
  timeout 1800 claude $CLAUDE_FLAGS --effort medium --model $CLAUDE_MODEL --allowedTools $TOOLS_EDITOR --max-turns 50 -p "$CHECK_PROMPT$EDITOR_ADDENDUM" 2>&1 | tee -a "$LOG_FILE"
  EDITOR_EXIT=$?
  echo "Editor exit: $EDITOR_EXIT — $((SECONDS - T3))s" | tee -a "$LOG_FILE"

  # Stage 3.5: Context briefs — generate background briefs for qualifying threads
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.5: Context briefs ---" | tee -a "$LOG_FILE"
  T35=$SECONDS
  timeout 600 node scripts/generate-context.js 2>&1 | tee -a "$LOG_FILE"
  CONTEXT_EXIT=$?
  echo "Context exit: $CONTEXT_EXIT — $((SECONDS - T35))s" | tee -a "$LOG_FILE"

  # Stage 3.6: Educational context — generate explainers for standalone articles
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 3.6: Educational context ---" | tee -a "$LOG_FILE"
  T36=$SECONDS
  timeout 300 node scripts/generate-edu-context.js 2>&1 | tee -a "$LOG_FILE"
  EDU_EXIT=$?
  echo "Edu context exit: $EDU_EXIT — $((SECONDS - T36))s" | tee -a "$LOG_FILE"

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

  # Build
  node scripts/build.js 2>&1 | tee -a "$LOG_FILE"
  BUILD_EXIT=$?
  echo "Build exit: $BUILD_EXIT" | tee -a "$LOG_FILE"

  if [ "$BUILD_EXIT" -eq 0 ]; then
    # Commit
    git add content/articles/ content/.last-cycle.json content/.editorial-notes.md content/.story-ledger.json content/.context-briefs.json 2>&1 | tee -a "$LOG_FILE"
    CYCLE_TIME=$(date -u +"%Y-%m-%d %H:%M UTC")
    git commit -m "Editorial cycle $CYCLE_TIME: $NEW_COUNT articles" 2>&1 | tee -a "$LOG_FILE"

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
            const cut = raw.slice(0, 250);
            const lastDot = cut.lastIndexOf('. ');
            fm.lead = lastDot > 40 ? cut.slice(0, lastDot + 1) : cut;
            return fm;
          } catch { return {}; }
        }
        const breaking = ledger.stories
          .filter(s => s.arc === 'breaking' && s.coverageCount === 1)
          .flatMap(s => (s.articles || []).filter(sl => slugs.has(sl)).map(sl => {
            const fm = readArticle(sl);
            return {
              slug: sl,
              title: fm.title || s.label,
              category: fm.category || s.category || 'news',
              body: fm.lead || '',
              eventCoverage: parseInt(fm.eventCoverage) || 0
            };
          }))
          .sort((a, b) => b.eventCoverage - a.eventCoverage)
          .slice(0, 1)
          .map(({ slug, title, category, body }) => ({ slug, title, category, body }));
        if (breaking.length) console.log(JSON.stringify({ articles: breaking }));
      ")
      if [ -n "$BREAKING_JSON" ] && [ -n "$PUSH_SECRET" ]; then
        # Craft notification body with Claude — the article lead isn't written for push
        PUSH_SLUG=$(echo "$BREAKING_JSON" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.articles[0]?.slug||'')")
        if [ -n "$PUSH_SLUG" ] && [ -f "content/articles/${PUSH_SLUG}.md" ]; then
          ARTICLE_TEXT=$(cat "content/articles/${PUSH_SLUG}.md")
          PUSH_NOTIF=$(timeout 30 claude $CLAUDE_FLAGS --model $CLAUDE_MODEL --effort medium --tools "" -p "You are a breaking news editor writing an iOS push notification. The notification appears on a locked iPhone — the reader has 2 seconds to decide whether to tap.

iOS display constraints (Apple HIG):
- Title: 1 line on lock screen, ~40 characters before truncation
- Body: 2-4 lines on lock screen, ~90 characters fully visible without expanding

Output exactly two lines:
Line 1 — title: max 40 characters, the core event in 4-6 words
Line 2 — body: max 90 characters, one sentence with the single most important fact

Rules:
- No filler (Breaking, Just in, Reports say, Sources say)
- No names unless globally recognizable (Trump, Putin, etc.)
- Front-load: the first 5 words must carry the news
- Output ONLY the two lines, nothing else

Article:
$ARTICLE_TEXT" 2>/dev/null)
          if [ -n "$PUSH_NOTIF" ]; then
            PUSH_TITLE=$(echo "$PUSH_NOTIF" | head -1)
            PUSH_BODY=$(echo "$PUSH_NOTIF" | tail -1)
            BREAKING_JSON=$(TITLE="$PUSH_TITLE" BODY="$PUSH_BODY" node -e "
              const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
              if(process.env.TITLE) d.articles[0].title=process.env.TITLE;
              d.articles[0].body=process.env.BODY;
              console.log(JSON.stringify(d))" <<< "$BREAKING_JSON" 2>/dev/null || echo "$BREAKING_JSON")
          fi
        fi
        echo "Pushing breaking news: $BREAKING_JSON" | tee -a "$LOG_FILE"
        curl -s -X POST "https://zuhd.news/api/push" \
          -H "Authorization: Bearer $PUSH_SECRET" \
          -H "Content-Type: application/json" \
          -d "$BREAKING_JSON" 2>&1 | tee -a "$LOG_FILE"
      fi
    fi
  else
    echo "Build failed — skipping deploy" | tee -a "$LOG_FILE"
  fi
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
    git add content/audio/ 2>&1 | tee -a "$LOG_FILE"
    git commit -m "Audio briefing $(date -u +%Y-%m-%d)" 2>&1 | tee -a "$LOG_FILE"
    npx wrangler pages deploy dist --project-name zuhd-news --branch master --commit-dirty=true 2>&1 | tee -a "$LOG_FILE"
  fi
else
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 4: Audio briefing (skipped — ${START_HOUR:-$HOUR_UTC}:xx UTC, runs at 04:00 only) ---" | tee -a "$LOG_FILE"
fi

# Stage 5: Weekly reflection — runs Sunday 22:30 UTC only (last cycle of the week)
DAY_OF_WEEK=$(date -u +%u)
if [ "$DAY_OF_WEEK" = "7" ] && [ "$START_HOUR" = "22" ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 5: Weekly reflection ---" | tee -a "$LOG_FILE"
  REFLECT_PROMPT=$(cat scripts/reflect-prompt.md)
  timeout 300 claude $CLAUDE_FLAGS --effort medium --model $CLAUDE_MODEL --allowedTools $TOOLS_REFLECT --max-turns 20 -p "$REFLECT_PROMPT" 2>&1 | tee -a "$LOG_FILE"
  REFLECT_EXIT=$?
  echo "Reflection exit: $REFLECT_EXIT" | tee -a "$LOG_FILE"
  # Failure here doesn't affect publishing — the cycle is already complete
else
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 5: Weekly reflection (skipped — day $DAY_OF_WEEK $START_HOUR:00 UTC, runs Sunday 22:00 only) ---" | tee -a "$LOG_FILE"
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
    timeout 300 claude $CLAUDE_FLAGS --effort medium --model $CLAUDE_MODEL --allowedTools $TOOLS_TUNE --max-turns 15 -p "$TUNE_PROMPT" 2>&1 | tee -a "$LOG_FILE"
    TUNE_EXIT=$?
    echo "Tuning exit: $TUNE_EXIT — $((SECONDS - T6))s" | tee -a "$LOG_FILE"
    # Tuning session handles its own git workflow (experiment branches + PRs).
    # Here we only commit the tracking files if they changed.
    AUDIT_CHANGES=$(git diff --name-only content/.experiments.json content/.daily-audit.md 2>/dev/null | wc -l)
    if [ "$AUDIT_CHANGES" -gt 0 ]; then
      git add content/.experiments.json content/.daily-audit.md 2>/dev/null
      AUDIT_DATE=$(date -u +%Y-%m-%d)
      git commit -m "Daily audit $AUDIT_DATE" 2>&1 | tee -a "$LOG_FILE"
    fi
  else
    echo "Metrics computation failed — skipping tuning" | tee -a "$LOG_FILE"
  fi
else
  echo "" | tee -a "$LOG_FILE"
  echo "--- Stage 6: Daily tuning (skipped — $START_HOUR:xx UTC, runs at 22:00 only) ---" | tee -a "$LOG_FILE"
fi
