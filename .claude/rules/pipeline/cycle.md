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

## Polymarket's `active` flag does not mean live

- **A market whose deadline has passed keeps `active: true, closed: false`**
  until UMA resolves it, which can take months. Probed against the live Gamma
  API: *"Will Adanech Abiebie be the next Prime Minister of Ethiopia?"* carried
  `endDate: 2026-06-01` — two months gone — with both flags saying it was live.
  On the rail this showed as *"US x Iran Effective Ceasefire by July 31"* sitting
  at **62% four days after July 31**. A probability on a question whose date has
  passed is not a forecast; it is the last price before everyone stopped caring,
  and beside live markets it makes the whole block untrustworthy in a way a
  reader has no means to check.
- **The source's own `endDate` is the test**, so nothing is inferred from the
  question text and no model is involved. Markets carrying no end date are
  **kept**: an open-ended market is a real thing, and dropping one for a missing
  field would be reading absence as expiry.

## The trends payload's country tags

- **Only the currency basket knew what country it was about, and that was 15 of
  56** (2026-08-03). Every indicator carries `topicTags`; `countryTags` existed
  in the type and on exactly one source, OER's FX pairs, covering 19 countries.
  So anything keyed on country — a country profile, a viewport-aware rail, a
  click on the land — could reach a quarter of the payload. Two sources are now
  tagged and the reasoning differs for each, which is the point of writing it
  down.
- **Wikipedia is a lookup, not a classifier.** The attention series are fetched
  *by article title*, and measured against a live payload **10 of the 15 are
  country articles** — Iran, India, Russia, China, Pakistan, Saudi Arabia,
  Israel, Ukraine, United States, Nigeria — with the other five being
  `Artificial intelligence`, `Bitcoin`, `Donald Trump`, `Strait of Hormuz` and
  `Wildfire`. So the title *is* the answer and `codeFromTopojsonName` resolves
  nine of the ten outright. `TITLE_ALIASES` covers only genuine divergences
  between Wikipedia's name and Natural Earth's — `United States` →
  `United States of America`, `Eswatini` → `eSwatini` (case, not spelling), the
  two Congos, Ireland, Côte d'Ivoire, Timor-Leste, Palestine. **No identity
  entries**: `Czechia`, `Myanmar`, `Turkey` and both Koreas resolve directly, and
  an alias for them would be dead weight that reads as coverage. Verified: 21 of
  27 candidate titles resolve, the six that do not being the five non-countries
  plus Cabo Verde, which the 1:110m set does not carry at all.
- **Polymarket rides the call it was already making.** The subject of a
  prediction market lives in its question text, so this needs a model — and one
  was already there, shortening titles to fit a 42-character header. It now
  returns `{title, countries}` instead of a bare string, at the same batch size
  and the same single call, so **the token cost is unchanged in kind**. Three
  things that had to come with it: every deduped row goes through now rather
  than only the over-long ones (the call is there for the countries, and
  skipping short titles left the most quotable markets as the only untagged
  ones) — but a title already inside the budget **keeps its own words**, because
  rewriting a label that did not need it is a change nobody asked for; the
  parser still accepts a bare string, because a model occasionally answers last
  week's question; and every code is filtered through `CC_TO_TOPOJSON_NAME`,
  because a model asked for ISO-2 will offer `UK` or `EU`, and **an unresolvable
  tag is worse than no tag — it looks like coverage and matches nothing.**
  Dry-run against Haiku with five live questions: correct shape, correct codes,
  and `Bitcoin` correctly empty.
- **It reaches the payload on the next cycle, not on deploy.** These are
  fetchers; `content/trends/*.json` is written by stage 3.4 and the site serves
  what the last cycle wrote.

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
