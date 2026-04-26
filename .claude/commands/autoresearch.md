# Run an autoresearch session

You are helping the user run an autoresearch session against the zuhd.news editorial pipeline. The harness lives in `scripts/autoresearch/`. It replays the full pipeline (selector → writer → editor → edu-context) against frozen feed snapshots, scores against a Reader Value Score (RVS), and surfaces winning diffs for human merge.

Background: see commits `3a4ac65` (harness) and `38eea61` (Phase A fixes). Approved plan at `/root/.claude/plans/i-want-you-to-purrfect-lagoon.md`.

## Hard constraint (always enforce)

Never propose, accept, or merge a diff that increases NewsAPI.ai token usage. The variable surface in `scripts/autoresearch/propose.js` already excludes `scripts/fetch-news-api.js` — do not add it back. See `feedback_news_api_token_budget.md` in user memory.

## Steps

### 1. Pick the session shape

Ask the user (or infer from context) which mode:

| Mode | Eval | Iters | Wall | Cost | Use when |
|---|---|---|---|---|---|
| **smoke** | 1-cycle, all stages skipped, `--no-judges` | 1 | <2 min | $0 | Verify wiring after a code change to the harness itself |
| **quick** | 1-cycle, full pipeline | 1 baseline + 2 proposers | 90 min | ~$25 | First time after a harness change; cheap signal |
| **real** | 2-cycle, full pipeline | 1 baseline + 4–5 proposers | 4 hours | ~$120 | Default for finding real winners |
| **deep** | 3-cycle, full pipeline | 1 baseline + 4 proposers | 6 hours | ~$200 | Maximum signal, half-day budget required |

If the user just says "run autoresearch" without specifying, recommend **real** unless the time-of-day window doesn't allow it.

### 2. Check the timing window

Production cycles fire at **04:00, 08:00, 12:00, 17:00, 22:00 UTC**. The driver holds `/tmp/zuhd-cycle.lock`, which means production cycles fired during a session will exit cleanly without running. Each lock-bounce costs ~10 articles to readers.

Compute the available window before the next cycle fire and refuse to launch a session that would skip more than one production cycle unless the user explicitly confirms. The cleanest windows are:

- **22:30 → 03:30 UTC** — 5 hours, only blocks the 22:00 cycle if running, which fires before this window
- **Weekend afternoons** — readers are more tolerant of light coverage

If the user asks at 14:00 UTC for a 4-hour session, point out it'll skip 17:00 and offer a shorter run or a delayed start.

### 3. Confirm the budget

State the estimated cost and wall time, then ask the user to confirm before spending. Do not assume.

### 4. Launch in background

Use this template (do **not** run in foreground — sessions are too long for interactive watching):

```bash
PATH=/root/.local/share/mise/installs/node/24.13.1/bin:$PATH \
flock -n /tmp/zuhd-cycle.lock node scripts/autoresearch/driver.js \
  --session live-N --max-iters M --max-wall T --max-cycles C \
  2>&1 | tee /tmp/zuhd-autoresearch-live-N.log
```

Substitute:
- `live-N` — pick the next free session id (look at `/tmp/zuhd-autoresearch/` to avoid collisions)
- `M` — `--max-iters` based on mode (3 for quick, 6 for real, 8 for deep)
- `T` — `--max-wall` in minutes (90 / 240 / 360)
- `C` — `--max-cycles` (1 / 2 / 3)

Run with `run_in_background: true`. Tell the user the background task ID and that you'll send a `PushNotification` when it completes.

### 5. Watch progress (passively)

Don't poll. The user can do `watch -n10 cat /tmp/zuhd-autoresearch/<session>/progress.json` themselves. Only check status if the user asks.

When you do check, report:
- `progress.json` last `ts` and `stage` (so the user knows it's alive)
- `runs.jsonl` line count = number of iters logged
- Any guardrail surprises in completed iters

### 6. On session completion (background notification)

Send a `PushNotification` immediately. Body should fit in one line: baseline RVS, count of accepted diffs, headline cluster shifts of the best.

Then summarize in chat:

1. Read `/tmp/zuhd-autoresearch/<session>/runs.jsonl` (compact)
2. Read `/tmp/zuhd-autoresearch/<session>/session-<id>.md` (the human-review summary)
3. For each accepted diff, show the file, rationale, old/new strings, and Δ-RVS
4. For rejected diffs, show why (especially distinguish "diff genuinely worse" from "guardrail bug" — see "Known issues" below)
5. Recommend which to merge

### 7. Merging winners

For each accepted diff the user wants to merge:

1. Read the diff JSON at `/tmp/zuhd-autoresearch/<session>/iter-N.diff.json`
2. Apply via `Edit` tool on the live file (the diff's `oldString` / `newString` are uniqueness-checked)
3. Stage and commit per the user's request — **do not commit unprompted** (see CLAUDE.md)

Optional: register the merged change as a production experiment via the `/experiment` skill so the daily tune stage tracks it for 3 days.

## Known issues to flag in summaries

- **String-equality guardrail bug (Phase A.1, not yet fixed):** the driver's "new guardrail failures" check compares failure strings literally. A diff that improves a metric but doesn't fully clear a floor (`"publish count 4 below floor 8"` → `"publish count 6 below floor 8"`) reads as a NEW failure and gets auto-rejected. The live-3 iter 1 winner (+4 RVS) was lost to this. When summarizing rejected diffs, parse the failure strings — if every "new" failure is actually an *improved* version of a baseline failure, flag the diff as "winner stuck behind A.1 bug" and recommend merge anyway.
- **Single-cycle iteration variance (~±2 RVS):** changes under that magnitude are noise. Always run 2-cycle eval for real sessions.
- **Dedup-selection runs against current `.last-cycle.json`:** historical replay can drop stories that were "already published" relative to today, even if the snapshot is older. Affects publish counts on stale snapshots; not yet fixed.

## Quick-reference commands

```bash
# Smoke (wiring only, no spend):
PATH=/root/.local/share/mise/installs/node/24.13.1/bin:$PATH node scripts/autoresearch/run-replay.js \
  --session smoke-$(date +%H%M) --iter 0 --max-cycles 1 \
  --skip-stages selector,writer,editor,edu-context --no-judges

# Quick (1-cycle, single iteration, real LLMs):
PATH=/root/.local/share/mise/installs/node/24.13.1/bin:$PATH \
flock -n /tmp/zuhd-cycle.lock node scripts/autoresearch/driver.js \
  --session live-N --max-iters 3 --max-wall 90 --max-cycles 1

# Real (2-cycle, default):
PATH=/root/.local/share/mise/installs/node/24.13.1/bin:$PATH \
flock -n /tmp/zuhd-cycle.lock node scripts/autoresearch/driver.js \
  --session live-N --max-iters 6 --max-wall 240 --max-cycles 2

# Deep (3-cycle, half-day window required):
PATH=/root/.local/share/mise/installs/node/24.13.1/bin:$PATH \
flock -n /tmp/zuhd-cycle.lock node scripts/autoresearch/driver.js \
  --session live-N --max-iters 8 --max-wall 360
```

## Reading session output

| File | Purpose |
|---|---|
| `progress.json` | Liveness — last stage + ts |
| `runs.jsonl` | One JSON line per iter (baseline + each replay) — primary structured output |
| `iter-N.diff.json` | Full proposed diff for iter N (rationale + oldString + newString) |
| `session-<id>.md` | Human-review summary, ranked accepted diffs |

## When NOT to run autoresearch

- Within 25 min of a production cycle fire (the driver enforces this; respect the `--force` warning, never bypass)
- When the harness has uncommitted changes and you haven't smoke-tested them
- Without confirming the user is OK with the dollar cost
- During heavy news days when missing a production cycle has high reader impact
