---
paths:
  - "scripts/fetch-*.js"
  - "scripts/extract-*.js"
  - "scripts/post-to-*.js"
  - "scripts/*-selection.js"
  - "scripts/prefilter-feed.js"
  - "scripts/merge-feeds.js"
  - "scripts/scaffold-articles.js"
  - "scripts/narrate-gdacs.js"
  - "scripts/pick-breaking-social.js"
  - "scripts/generate-*.js"
  - "scripts/measure-quality.js"
  - "scripts/compute-metrics.js"
  - "scripts/score-production-cycle.js"
  - "scripts/update-ledger.js"
  - "scripts/write-last-cycle.js"
  - "scripts/trending-gaps.js"
  - "scripts/coverage-map.js"
  - "scripts/autoresearch/**"
  - "scripts/dashboard/**"
  - "scripts/lib/claude-envelope.js"
  - "scripts/lib/concurrency.js"
  - "scripts/lib/argv.js"
  - "scripts/lib/regions.js"
  - "scripts/lib/dedup.js"
  - "scripts/lib/quality-score.js"
  - "scripts/lib/entity-registry.js"
  - "scripts/lib/trends-*.js"
  - "scripts/lib/trends-sources/**"
  - "scripts/lib/logs.test.js"
  - "scripts/*-prompt.md"
---

# The editorial cycle

Five runs a day on a remote server, committing only `content/`. The stage list
is in the root CLAUDE.md; this is what the stages assume about each other.

## The shape of a stage

- **A stage must not be able to stop the publish.** `run-cycle.sh` is written so
  build + commit + deploy runs even when an earlier stage times out — that is
  what stops one slow dependency becoming a no-publish cascade. Anything
  advisory (the typecheck, the quality score) runs behind a `timeout` and a
  `|| echo WARNING`. The cost is a failure nobody reads, so `logs.test.js`
  ratchets on those warnings at a baseline of zero.
- **Degrade to the previous snapshot, never to nothing.** Every `fetch-*.js`
  writes `content/.<name>.json` and leaves the old file in place on failure; the
  build reads whatever is there. A missing key logs a skip and the layer is
  absent (`FIRMS_MAP_KEY` is the worked example).
- **Say what was left out.** A bounded dataset that does not report its
  exclusions reads as complete coverage. `fetch-firms.js` and `fetch-ipc.js`
  both carry a `skipped` tally with a reason per bucket, and both keep the wider
  evidence in `content/.*.json` while publishing only the part that can be
  accounted for.
- **Use the shared helpers**: `runWithConcurrency` (`lib/concurrency.js`) for
  per-item HTTP, `argAt`/`hasFlag` (`lib/argv.js`) for flags,
  `regionFromCoords` (`lib/regions.js`) for the coverage bbox ladder. Each of
  those existed in three to five copies before 2026-08-01.

## Claude CLI stages

- **`runHaiku(prompt, { timeout, maxBuffer })` in `lib/claude-envelope.js`** is
  the one place the argv is spelled. `--no-session-persistence --max-turns 1`
  are what make these micro-tasks rather than sessions: a copy that lost either
  would still work, cost more, and leave state behind. `CLAUDECODE` is deleted
  from the child env so the subprocess does not inherit the parent session
  marker.
- **`parseClaudeEnvelope(stdout)`** handles the `{type:"result", result:"…"}`
  wrapper, a fenced payload, and raw JSON. Do not re-implement it inline —
  `extract-entities.js` had two hand-rolled copies.
  `parseClaudeEnvelopeWithUsage` additionally returns cache token counts, which
  is how you tell whether prompt caching is firing.
- **Timeouts are measured, not guessed.** The batched stock scan sat at 30s and
  was SIGTERM-killed (exit 143) on ~28% of cycles, discarding output whose input
  tokens were already billed; it is 60s against a 180s stage budget.

## Tunable parameters and experiments

One variable, one experiment, minimum three days, ≤20% of a parameter's range.
Registered in `content/.experiments.json`, auto-evaluated by the 22:00 UTC
tuning stage, tracked on the dashboard's Experiment tab. Create with
`/experiment`. Tunables: selector category floors (`select-prompt.md`), feed
params (`fetch-news-api.js`, `fetch-news.js`), build params (`build.js`).

## Editorial lists are editorial

`STATE_OUTLETS`, `THERMAL_VOCABULARY`, `MARKET_CATALOG`'s `available: false`
rows, `shared/genocide.ts` — these are judgements, kept short, each entry
carrying its reason. They are not heuristics to be widened when something is
missed. `MARKET_CATALOG` in particular records the exchanges the free data
commons does *not* cover with a reason each, so the gap gets revisited rather
than quietly becoming a fact about our coverage.

## Dashboard

`localhost:7777` over an SSH tunnel, `zuhd-dashboard.service`,
`scripts/dashboard/`. Six tabs: Pipeline, Quality, Logs, Experiment, Editorial,
Status.
