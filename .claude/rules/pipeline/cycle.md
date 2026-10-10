---
paths:
  - "scripts/fetch-*.js"
  - "scripts/extract-*.js"
  - "scripts/post-to-*.js"
  - "scripts/*-selection.js"
  - "scripts/prefilter-feed.js"
  - "scripts/merge-feeds.js"
  - "scripts/scaffold-articles.js"
  - "scripts/run-cycle.sh"
  - "scripts/narrate-*.js"
  - "scripts/attach-indicators.js"
  - "scripts/flag-title-echo.js"
  - "scripts/translate-swedish.js"
  - "scripts/pick-breaking-social.js"
  - "scripts/generate-*.js"
  - "scripts/measure-quality.js"
  - "scripts/compute-metrics.js"
  - "scripts/score-production-cycle.js"
  - "scripts/update-ledger.js"
  - "scripts/write-last-cycle.js"
  - "scripts/trending-gaps.js"
  - "scripts/coverage-map.js"
  - "scripts/dashboard/**"
  - "scripts/lib/claude-envelope.js"
  - "scripts/lib/concurrency.js"
  - "scripts/lib/argv.js"
  - "scripts/lib/regions.js"
  - "scripts/lib/dedup.js"
  - "scripts/lib/dispatch.js"
  - "scripts/lib/gdacs-narrations.js"
  - "scripts/lib/grounding.js"
  - "scripts/lib/indicator-offer.js"
  - "scripts/lib/market-signals.js"
  - "scripts/lib/title-echo.js"
  - "scripts/lib/coverage-window.js"
  - "scripts/lib/tracked-stories.js"
  - "scripts/lib/feed-age.js"
  - "scripts/lib/quality-score.js"
  - "scripts/lib/rvs.js"
  - "scripts/lib/entity-registry.js"
  - "scripts/lib/trends-*.js"
  - "scripts/lib/trends-sources/**"
  - "scripts/lib/companies.js"
  - "scripts/lib/company-gaps.js"
  - "scripts/company-gaps.js"
  - "scripts/lib/ai-models.js"
  - "scripts/lib/ai-lab-metadata.js"
  - "scripts/lib/company-metadata.js"
  - "scripts/lib/fx-history.js"
  - "scripts/lib/stock-mentions.js"
  - "scripts/lib/logs.test.js"
  - "scripts/*-prompt.md"
---

# The editorial cycle

Five runs a day on a remote server, committing only `content/` (Stage 6, the
tuning session, also merges experiment edits to the tunables in `scripts/`).
The stage list is `scripts/cycle/stages.js` (`stages.md`); this is what the
stages assume about each other.

## The shape of a stage

- **Never** let an advisory stage stop the publish. From the writer on,
  the cycle builds, commits and deploys whatever a timeout left; only a
  selector failure or a writer with no article ends a cycle unpublished.
  Advisory work runs behind `timeout`, and `logs.test.js` ratchets the
  typecheck warning at zero.
- Degrade to the previous snapshot, never to nothing: a failed `fetch-*.js`
  leaves `content/.<name>.json` in place, and a missing key logs a skip.
- A snapshot fetcher does its work inside `snapshotStage`
  (`lib/snapshot-stage.js`) and throws `Degrade` to keep the last snapshot,
  `Skip` for a missing key. `isEmpty` is required: an empty result is never
  written over a snapshot by default.
- A fetcher passes `stageBudget(<its stage>)` (`lib/stage-budget.js`) as
  `signal` with every request: a slow source then ends in a partial result or
  a kept snapshot, never `exit 124`. Re-time a stage there too; a test holds
  the table to `stages.js`.
- A bounded dataset reports what it left out (`skipped`), or it reads as
  complete coverage.
- An empty result after a non-empty response is a schema change: that branch
  must log what it saw.
- A new series reaches the app the cycle after its first, once it has a
  `standing`: the app drops a card with no paragraph.

## Claude CLI stages

- **Never** call the Anthropic API: stages run the subscription's `claude` CLI.
- `claudeArgs` (`lib/claude-envelope.js`) spells the argv for Node callers.
  `--no-session-persistence`, `--max-turns 1` and `--tools ''` keep a call a
  cheap micro-task.
- **Never** start `claude` without `ISOLATION_FLAGS`: `--tools ''` does not
  cover MCP, and a bare call loads the account's settings, skills and servers.
- Run it with `runClaudeSync`, `callClaudeJson`, or `spawnClaude` inside a
  pool: `runWithConcurrency` only limits work that yields. All drop
  `CLAUDECODE` from the child env.
- Parse with `parseClaudeEnvelope`; render a failure with `claudeFailure`.
- `lib/grounding.js` is the one grounding validator. `validateProperNouns` is
  opt-in and `standing` is unchecked: a definition draws on general knowledge.
- Calibrate a validator or a timeout on real runs: rejected good prose
  deletes the feature, and a killed call's input is already billed.

## The selector's pool

- `merge-feeds.js` cuts the pool at 12 hours (`MAX_FEED_AGE_MS`), two cycles'
  chances. The rule lives in the cut: the selector reads what it is given.
- A thin cycle widens the cut to hold `MIN_POOL_ITEMS`, never past 24 hours
  (`poolAgeCapMs`): a late pick publishes as an old story.
- Do not bring backfill back: it filled floors by a noisy feed tag, and a
  short slot beats one the writer must refuse.
- `logs.test.js` reads feed health from `RSS fetch:`: after the cut the merged
  count measures freshness.

## Upstream sources that lie

- Polymarket keeps `active: true, closed: false` past a deadline. `endDate` is
  the test; a market with none is kept.
- Polymarket's `m.category` is undefined. Filter `/events` by `DROP_TAGS`: an
  allow list silently lost whole subjects.
- Polymarket's selection is sticky (`orderCandidates`, `INCUMBENT_CAP`):
  narration is daily, so a re-rolled deck orphans its paragraphs. Watch the
  `dropped` count `build.js` logs for `analysis.json`.
- Country tags are the source's own tags and the model's, each filtered
  through `CC_TO_TOPOJSON_NAME`: an unresolvable tag looks like coverage.
- PortWatch's `date` is a string or epoch ms. Read it with `parseArcgisDate`;
  a raw compare is `NaN` and drops every row.
- Policy rates other than the Fed's and the ECB's come from the BIS
  (`trends-sources/bis.js`); FRED's BoE and BoJ series stopped.
  `detail=dataonly` is required, a series older than
  `STALE_DAYS` is dropped, and tags name the bank, never the bare country.
- Wheat, rice, copper and European gas come from the IMF's own service
  (`trends-sources/imf.js`): FRED's copy of them stopped at July 2026.
- Oil, US gas, gold and silver are the front-month contract
  (`trends-sources/futures.js`). Each row names a `fallback` series, published
  under its own `source`, `seriesId` and source line. Never a spot series
  under the contract's name: the stories quote the contract.
- Gold and silver are cut to the sessions both have (`alignSessions`): the
  app shows no ratio when their lengths differ.
- A row published to fewer places than its source's arithmetic returns
  declares `decimals`, and the snapshot's values are rounded to it.
- The rate history keeps every currency an exchange or a company is priced in
  (`QUOTE_CURRENCIES`, `lib/fx-history.js`) without a snapshot row.
  `/api/markets.json`'s `fx` and a company's `marketValue` read it; both keys
  are optional.
- The rate history keeps forty days and a currency's row answers with
  thirty-four (`HISTORY_DAYS`, `SERIES_DAYS`, `trends-sources/oer.js`): the
  app reads thirty-day moves, an index's in dollars and a currency's own, and
  each needs the day it starts on.
- `shares` in `company-metadata.js` is entered by hand and dated. Refresh it
  at once after a split: the close changes that day and the count is wrong by
  the ratio.
- Every tracked exchange carries its country's `gdp` (`market-metadata.js`),
  published as an optional key: the weight of its week in the app's `world
  stocks`. Entered by hand; read the figures again once a year.
- Yahoo serves four indices no daily history (`sessionsFromHourly`,
  `trends-sources/stocks.js`). Their closes are the last hourly bar's, near
  the official close and not it: never quote one to the cent.
- `fetch-news-api.js` runs with no outer `timeout`: `apiPost` must keep its own
  deadline. A failed per-event call costs its panel, not the feed.

## The indicator dispatch

- `narrate-indicators.js` (Stage 3.8, the `DAILY_HOUR` cycle) writes two
  fields per instrument: `standing`, what the thing is, and `recent`, what
  happened to it this fortnight and why.
- `recentFingerprint` hashes the top stories, the move in bands and the
  extremes' dates, never a raw series value, which changes daily. `promptHash`
  is in both fingerprints so a prompt edit reaches all.
- `standing` is kept while its fingerprint stands (`storedStanding`,
  `lib/dispatch.js`): the call is for `recent`, and a definition reworded daily
  is churn on every surface. An event's entry records its `prompt` for this.
- An attention row explains the event, never "the topic was in the news".
- **Never** let the chart be a source for `recent`: a number in `series`
  stays out, and the extremes' dates are for finding the story. With no cause
  it says what the coverage carried and that none of it explains the move, or
  is empty. It is never a description of the line.
- A rejected `recent` is not a rejected item. Only `recent` is gated
  (`PROMPT_ECHO_REJECT`); echoes in `standing` and `seriesEchoes` are only
  counted, because a dropped `standing` drops the app's card.
- `citations` are the offered slugs `recent` was built from; the build
  prefers them to tag matches.
- `BLURB_IS_DEFINITION` (`chokepoint`, `company`): the catalog blurb is
  `standing`. An exchange's is the model's: its blurb describes the exchange,
  not the index.
- `recent` is inline on the chokepoint, exchange and company payloads, on
  `/api/entity/{id}.json` for the web and on `api/analysis.json` (with
  `relatedArticles`) for the app. **Never** join an indicator's onto
  `api/trends.json`, which every homepage visit loads. That file's `events`
  do carry theirs inline: an event has no `/e/{id}`.
- The prune is the daily pass's only (`!NEW_ONLY`) and per source (`staleKeys`,
  `lib/dispatch.js`): a payload that gave no items loses no paragraph. Never a
  floor on live against cached: a cache grows while its prune is declined.

## Prompts and validators

- A worked example in a prompt is handed back as a template. Illustrate with
  instruments the catalog does not carry, and say to copy the shape, never
  the words.
- The grounding check (`lib/grounding.js`) is for an invented actor: a name
  passes when any token is in the bundle, not every one
  (`grounding.test.js`).
- A validator states why it rejected (`validateMarketComment`'s `reasons`):
  a bare `null` reads as a quiet day.
- `<title-echo>` (`flag-title-echo.js`) is a flag for the editor, never a
  gate: an overlap measure cannot see a stake in words.
- `<acronyms>` (`flag-acronyms.js`) is the same: a list of places to look.
  The recognised list is `RECOGNISED` (`lib/acronyms.js`), the owner's; both
  prompts print it and a test holds the three together.
- In a hook, attribution follows the claim.
- An offered figure is permission, not obligation. The editor treats one
  matching its `indicators` row as sourced.

## The story chart and the market-signal join

- Offers (`lib/indicator-offer.js`, Stage 1.7) match a story's title, angle
  and concepts, **never** the source bodies, which hold every incidental noun.
  Replay before changing them: `attach-indicators.js --selection <file>
  --dry-run`.
- A stale or ambiguous level is dropped, not dated. Odds move in points
  (`pointsMove`), and a contract is offered on its subject, not its country
  (`oddsScore`).
- `chart: <id>` may name only a row offered with `chart: true`, which is what
  the app can draw. `validate-articles.js` removes any other and never
  quarantines. The subject earns a chart, not a recited figure.
- A day with no charts is the feed or the selector first: read `Q6: n
  tracked` and "The things we chart" in `select-prompt.md`. Q6 runs after
  the five queries, never beside them, on hand-picked keywords.
- The market-signal join takes a name tag or `countryTags` against
  `countries`, its own field in `loadArticles`: two-letter codes in the
  haystack match prose. A tag is never an ordinary word. The indicator
  dispatch keeps the same split (`offeredArticles`, `offeredStories`).
- A signal never goes back a session (`selectMarketSignals`): a fetch can
  lose an exchange's newest bar for a night.
- The list under an exchange or a strait is the stories the entity stage read
  as about it (`venues:`, `onVenueList`, `lib/stock-mentions.js`). **Never**
  give it a word-match fallback: tags put 40 wrong stories on 42 places.
- `thermal:` is recorded by the same reading and read by nothing: the thermal
  layer's gate is still `THERMAL_VOCABULARY`, an editorial list.

## Companies and AI labs

- `lib/company-metadata.js` is editorial and fixed. Probe a symbol before
  adding it; `companyMismatch` pins name, currency and zone, and
  `completedCloses` keeps an open session's price out.
- Whether a story is about a company is the entity stage's model answer
  (`subject`, `lib/stock-mentions.js`): a ticker in `entities[]` is only a
  mention. `isAboutCompany` (`lib/companies.js`) guards it: the mention must
  match the company's tags or `commonName`. A company tag in the title also
  passes, and a story the model never read falls back to weaker tag signs.
- A share that moved `MOVER_PCT` in a week with no story about it is asked
  for by name in Q6 and named to the selector (`unexplainedMovers`,
  `lib/company-gaps.js`): the narration can explain a move only from a story
  the site ran. A signal, never a quota; a `commonName` is never searched.
- `subjects:` is its own frontmatter key, because `entities[]` is published.
  `[]` means read and about none; no key means never read.
- `/api/ai-models.json` rows are labs, not models, which would be a
  leaderboard.
- **Never** compare a score with an earlier snapshot's: Epoch rescales the
  index. Epoch AI is credited wherever its scores print.
- `fetched` stays off the endpoint (`aiModelsPayload`): the app holds the
  file by its tag.
- A lab or money report older than `AI_LAB_STALE_DAYS` is left out.

## Editorial lists are editorial

- `STATE_OUTLETS`, `THERMAL_VOCABULARY`, `MARKET_CATALOG`'s `available: false`
  rows, `shared/genocide.ts` and the company and lab catalogs are judgements,
  each list with its reason. **Never** widen one as a heuristic.

## Experiments

- One variable per experiment, three days minimum, at most 20% of a
  parameter's range, in `content/.experiments.json`. The tunables are listed
  in `tune-prompt.md`'s `<tunable_parameters>`.
