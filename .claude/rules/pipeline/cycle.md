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

## Polymarket's filter was one dead field and one word list

- **`m.category` is `undefined` on every row `/markets` returns**, and had been
  for as long as anyone measured. `KEEP_CATEGORIES` — eight categories, written
  to prioritise ummah-relevant geopolitics — therefore matched nothing, ever, and
  the entire subject filter was the keyword regex beside it, applied to a pool
  that volume-ranks roughly four-fifths football, baseball and esports. Probed
  live 2026-08-29: 60 markets fetched, **3 distinct events kept**. That was the
  whole reason the app's outlook column was two cards deep, and nothing in the
  logs said so — a filter that silently keeps three things looks exactly like a
  day with three things worth keeping.
- **`/events` is the same data one level up and carries the taxonomy `category`
  was supposed to be**: `sports`, `esports`, `games`, `politics`, `geopolitics`,
  `economic-policy`, with the markets nested inside and their `clobTokenIds`
  intact. So the filter inverted — a short list of tags we drop, rather than a
  long list of words we hope to see. Same probe after: 60 events, 18 kept. The
  keyword list was dropping *Strait of Hormuz traffic returns to normal* and
  *Bab el-Mandeb Strait effectively closed*, questions about the exact waterways
  the shipping column charts, because "hormuz" was not one of its words.
- **A drop list is the right shape here and an allow list was not.** Missing an
  entry costs one odd card; missing a word cost a whole subject, silently. The
  list stays short and each entry carries its reason, per "editorial lists are
  editorial".
- **One market per event, chosen before the history calls.** An event is a
  question and its markets are the outcomes — "Presidential Election Winner
  2028" carries several hundred. Flattening them all gave 627 markets from 12
  events and the `slice(TOP_N)` then cut *inside* the first two, so the widened
  filter produced **fewer** cards than the broken one. Picked on volume among
  outcomes that are not already decided, which `lastTradePrice` answers for free.
- **The enrichment call was the next thing to break, and `runWithConcurrency`
  could not save it.** One Haiku call shortens titles and returns the countries
  each question is about. At three questions it fit inside 40s; at ten it
  measured **98s** and was SIGTERM-killed every run, so every question silently
  lost its country tags. Chunking it made things *worse* until the real bug
  showed: it was `spawnSync`, which blocks the event loop, so three "concurrent"
  chunks ran strictly one after another. **A concurrency limiter can only limit
  work that yields** — it is `execFile` now.
- **The countries come from the source's own tags, and the model is the bonus.**
  Gamma tags an event `iran`, `france`, `brazil`, `united-states`; 23 of 34
  observed slugs resolve straight off `CC_TO_TOPOJSON_NAME` and every
  non-country slug resolves to nothing, which is the failure mode we want. Tags
  cannot see that an FOMC market is about the US, so the two are unioned rather
  than swapped. The point is that a killed call now costs a long header instead
  of a data field. Measured after: 7 questions, **7 of 7 country-tagged**, ~45s.

## Polymarket's selection is sticky

- **The deck re-rolled by 24h volume on every cycle, and the desk narrates
  once a day.** Cycle N's newcomers were narrated after cycle N's build
  (`--new-only`) and displaced by cycle N+1's roll, so the paragraph shipped
  for a market the payload no longer carried. Measured on the live payload
  2026-09-04: **12 of 76 `analysis.json` items keyed to markets not in
  `trends.json`** — 4KB the app downloaded on every launch and attached to
  nothing; the *Strait of Hormuz traffic returns to normal* market narrated
  but absent, so the app's strait-odds join (`straitOdds`) matched none of the
  eleven straits; and a market that entered with no `standing` dropped by the
  app's deck gate until the next 04:00. Nothing in the logs said any of it.
- **Incumbents keep their slot while they stay eligible.** `fetch-trends.js`
  reads the previous snapshot and hands each dynamic source its own rows;
  `orderCandidates` in the Polymarket fetcher ranks incumbents first, then
  `PIN_TITLE_RE` subjects (waterways and oil — what the shipping column joins
  on), then the rest, each tier by volume, and the existing expiry, decided
  and drop filters run unchanged before it. **Zero extra API calls**: the
  previous snapshot is on disk and the top-60 response is the one the cycle
  already makes. `INCUMBENT_CAP` (`TOP_N − 3`) keeps a full deck from freezing
  out a newcomer. An incumbent that leaves the top 60 is gone, and the fetch
  log's `incumbents gone` count is the number to watch.
- **Only newcomers pay for Haiku.** The title-shortening call had no cache and
  ran on every row every cycle; an incumbent now reuses the label and country
  tags it was given on entry, so a steady cycle runs zero chunks. The cost is
  that a regex-fallback label from a cycle whose call was killed persists
  until the market re-enters.
- **`build.js` drops `analysis.json` items whose id is not in the snapshot**,
  and logs the count. That number is the health metric for all of the above:
  12 on the day this was written, and it should sit near zero.

## PortWatch's `date` became a string, and the per-indicator fetcher went dark

- **Eight `portwatch-*` registry rows produced nothing from 2026-04-28 to
  2026-09-04.** The ArcGIS service re-published `date` as
  `esriFieldTypeDateOnly` — `"2026-08-30"` where there had been epoch ms — and
  `fetchPortWatchChokepoint` compared it against a number: `NaN >= n` is false
  for every row, every row was filtered, and the empty branch returned `null`
  **without logging**. Every other failure in that function logged; this one
  looked like a quiet day. The batched snapshot fetcher that feeds
  `api/chokepoints.json` survived only by accident: it filters on the server,
  and its own numeric sort — also `NaN` — was handed rows the server had
  already put in date order.
- **What it cost:** the writer's indicator attach had no Hormuz tanker figure
  for 130 days; eight `/e/portwatch-*` pages and eight `analysis.json`
  paragraphs did not exist; `entity-registry.js` was rewritten (2026-08-08)
  to explain an absence whose cause was this.
- **The rule:** an empty result after a non-empty response is a schema change
  until proven otherwise, and the branch that handles it must print what it
  saw — the fix's log line prints the feature count and the first `date`
  attribute, which is the line that would have caught this in April.
  `parseArcgisDate` reads either serialisation and both fetchers go through it.

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
- **`lib/grounding.js` is the one grounding validator**, extracted from
  `narrate-gdacs.js` when the dispatch stage needed the same check. Two
  functions: `validateNumbers` for prose about what happened, and
  `validateProperNouns` for the names in it, opt-in per call site because a
  definitional sentence draws on general knowledge by design.
- **A validator's calibration is a measurement, not a preference.** The first
  version checked every capitalised token and the numeric tolerance was gated to
  figures of 100 and above. Run over twelve real indicators it produced **two
  rejections, both false positives, and caught nothing** — it deleted a good
  sentence for writing "America's" where the bundle said `US`, and rejected a
  definitional one over the `500` in "S&P 500". A validator that discards good
  output at 17% and catches nothing is not protecting a reader; it is deleting
  the feature. What ships: the tolerance is proportional at every scale (so
  `4.7%` matches an input of `4.65%` and `12%` still fails against `8%`), only
  **runs of two or more non-generic capitals** are name-checked (`Aban Tether`
  is, `America's` and `The Fed` are not), and `standing` is not grounding-checked
  at all. Measured after: 1 drop in 98, itself a false positive on a hyphenated
  demonym, since fixed.
- **Timeouts are measured, not guessed.** The batched stock scan sat at 30s and
  was SIGTERM-killed (exit 143) on ~28% of cycles, discarding output whose input
  tokens were already billed; it is 60s against a 180s stage budget.

## The indicator dispatch

- **The rail said what moved and never why, and the gap was structural rather
  than an omission.** Five sentences of explanatory copy existed for 57
  indicators: three hand-written `note` strings on `brent`/`vix`/`us-10y`, plus
  one block-wide constant per block. The attention block's read *"How many people
  read this article on Wikipedia each day…"* — a correct description of the
  metric, shown identically on twelve rows, at the exact moment a reader had
  asked what was happening. `/e/{id}` carried no prose at all. `narrate-indicators.js`
  (Stage 3.8, 04:00) writes two fields per instrument instead: `standing`, what
  the thing is, and `recent`, what has happened to it and why.
- **The two fields are fingerprinted separately, and that is the cost model.**
  `standing` is definitional and stable, so its fingerprint is the item's
  identity and it is written approximately once. `recent` is a claim about the
  last fortnight. **Its fingerprint is the story, not the number** — the top six
  coverage slugs and feed headlines sorted, the move in 5-point bands, and the
  *dates* of the extremes. The first version hashed the series itself, which
  meant every daily-cadence indicator busted its own cache every day and the
  "steady state costs nothing" claim was false for all 98 items. Measured after
  the fix: 98 items / $17.60 cold, **0 calls and $0.00 when nothing changed**,
  6 items / $1.26 after one cycle published 12 articles.
- **The grounding is free, and that is what makes the attention block
  answerable.** `merge-feeds.js` has archived every merged feed to
  `content/.feed-snapshots-merged/` five times a day since May, ~200 stories
  each, carrying `concepts[].uri` — Wikipedia article URLs. Those are the same
  keys `wiki-*` ids are minted from, so a `wiki-iran` bundle can carry every
  story in the window tagged `en.wikipedia.org/wiki/Iran`, **including the ~190
  per cycle we never published**, aligned against the days the series spiked.
  The prompt's hardest rule follows from it: an attention row must explain the
  *event*, never write that attention rose because the topic was in the news.
  That answer is circular and is the boilerplate the stage replaced.
- **`citations` is the crossreference, and it is why the related lists are worth
  reading.** The model returns which of the offered slugs its `recent` was
  actually built from, and the build prefers those over the tag matches for the
  chokepoint and exchange cards. A tag list is the first eight articles
  containing one of eleven words; a citation list is a claim that these stories
  explain this movement. Validated against the offered set and re-resolved
  against the corpus at build time, since an article can be renamed between the
  run that wrote the file and the build that reads it.
- **Catalog prose wins over generated prose — for a chokepoint, and only
  there.** A strait's blurb *is* a definition: *"One-fifth of global seaborne
  oil passes through this 21-mile strait between Iran and Oman"* answers what,
  where and why in one line, and paraphrasing it would be the failure
  "editorial lists are editorial" is about.
- **The same rule applied to exchanges answered a question nobody asked.** All
  30 blurbs are colour written for a reader who already knows the ticker —
  *"Trades Sunday to Thursday. Heavily weighted to banks, defence and
  technology"* never says that TA-125 is the Tel Aviv Stock Exchange's largest
  125 listings, and *"The Arab world's oldest exchange, founded in Alexandria in
  1883"* says nothing at all about the number EGX 30 puts on a card. Underneath
  that is a subject mismatch: **the blurb describes the exchange while every
  surface headlines the index**, so a reader arriving at `BIST 100` was handed
  Borsa İstanbul's biography and still could not read the chart. The model
  writes the exchange `standing` now, with the blurb in the bundle as material
  it is told to keep and as the fallback if its sentence is missing or over cap
  — the editorial claim survives, the identification goes in front of it.
  Measured on five live exchanges: *"The 100 largest companies on Borsa
  İstanbul, Türkiye's only stock exchange. Priced in lira, so its index level
  carries the country's inflation as much as its earnings"* — the blurb's whole
  claim, after an answer to the question the card raises.
- **Worked examples in a prompt get copied verbatim onto the instruments they
  name.** The first version illustrated the rule with TA-125 and EGX 30, both in
  the catalog, and the very first live call returned the example sentence
  word-for-word as TA-125's standing. The examples are Warsaw and Doha now —
  indices this catalog does not carry — under a line saying to copy the shape
  and not the words. Any example naming a real row is a template, not an
  illustration.
- **`promptHash` is in `standingFingerprint` too.** It was only in
  `recentFingerprint`, so a rewritten standing rubric reached nothing: the
  standing key hashes *identity*, and identity is exactly what never changes.
  It costs no calls — both fields come back from one call, and the recent
  fingerprint already busts on any prompt edit.
- **The exchange blurbs no longer take 30 items out of the first run**, only the
  11 chokepoints. In practice this is free for the same reason: those 30 were
  being called anyway and having half the answer thrown away.
- **The writer is handed the number, and matched on the subject rather than the
  prose.** `attach-indicators.js` (Stage 1.7) puts current levels on the
  selection before Stage 2, so an article can say "Brent at $88.90, down 15.6%
  in a week" instead of "oil prices fell" — which is what makes the chart
  `extract-entities.js` later attaches an *earned* link rather than a decoration
  on a sentence that never engaged with it. Two corrections it needed, both
  found by running it against a live selection:
  - **It matches `title` + `angle` + `concepts`, never the source bodies.** The
    bodies are the prose the writer works from, and they are also full news
    articles containing every incidental noun there is: the first run offered a
    **wheat price to a story about a solar eclipse**, off a sentence describing
    "wheat fields and rolling hills" in the viewing area. A title and an angle
    state what a story is *about*; a body is what an outlet happened to write.
  - **The window is named from the cadence, and stale levels are dropped.**
    `values` is a list of observations, not of days — `wheat` and `rice` are
    monthly, so a fixed seven-point window is seven *months*, and a thirty-point
    one is nearly two years. Windows are now `[3, 12]` for monthly and `[7, 30]`
    for daily, each labelled with its real period, and anything older than 45
    days (monthly) or 12 (daily) is dropped rather than dated — a writer handed
    a figure will use it, and the caveat is the first thing a 350-character
    article cuts. Ambiguous mentions are dropped too: guessing `rupee` would put
    a Pakistani level in front of a writer covering Delhi.
  The prompt rule is framed as **permission, not obligation** — a mandate here
  produces a numeric tic on every article, which `measure-quality.js` would
  score as filler. Measured on a live selection: 2 of 13 stories carried a
  level, which is the intended precision.
- **A rejected `recent` is not a rejected item.** The standing sentence still
  ships; only the claim about last week is dropped. Partial output beats none,
  and the alternative is an item that silently loses all its prose over one
  unverifiable name.
- **`recent` reaches three surfaces by three routes, and the split is a payload
  decision rather than an editorial one.** The chokepoint and exchange payloads
  carry it inline — those are 41 items and a few KB. The 55 bare indicators do
  not, because `api/trends.json` is what the homepage's instrument rail
  downloads on every visit and no rail row prints a paragraph; on the web it
  arrives per-instrument from `/api/entity/{id}.json`, on the press that opens
  a card. The app has neither that page nor that press: its graph decks build a
  whole column up front and drop any card with no prose, so it needs every
  paragraph before it renders anything. Hence `api/analysis.json` (2026-08-29),
  17.2KB, prose only — carrying `citations` measured 34.7KB, half the file for
  a list no card shows. Three routes, one writer, and nothing duplicated between
  them.

## The grounding validator's quantifier was the bug

- **It required *every* token of a name to be in the bundle, and that deletes
  good prose for being more specific than its source.** What the check exists
  for is an *invented* actor — a person, company or place the desk never
  mentioned. A run that shares a token with the input is not an invention, it
  is an elaboration. Measured on one production run: the corpus wrote `Warsh`,
  the sentence wrote *"Kevin Warsh's Jackson Hole debut"*, and **both FOMC
  meetings lost their entire explanation over a first name** — the two most
  important events on the calendar, silently blank. `g20-2026-miami` went the
  same way on "United States" where the bundle said `US`. It is **any token**
  now; `Aban Tether`, the case it exists for, is still caught because neither
  token appears anywhere.
- **A demonym is the place as an adjective, not a second place.** `mkt:hkex`
  and `mkt:sse` died on "Chinese" against a bundle saying China, `mkt:jse` on
  "African" against South Africa — three exchange cards in one run, rejected
  for their grammar. Two conditions, because either alone is wrong: a prefix
  test has to be five characters to avoid noise and five misses `China` by one
  letter, while a suffix test alone accepts `Aban` for ending in `-an`.
  Together they are narrow.
- **The structural words of country names are generic.** `United`, `States`,
  `Kingdom`, `Republic`, `Emirates`, `Union`, and the compass words. None is
  the identifying part of anything — the claim in "United States", "United Arab
  Emirates" and "South Africa" lives in the other token.
- **This is the third recalibration and each one was measured, not argued.**
  `scripts/lib/grounding.test.js` now pins every sentence a production run threw
  away, quoted from the cycle log that dropped it, alongside two inventions that
  must keep failing. The record this file already kept — *"a validator that
  discards good output at 17% and catches nothing is not protecting a reader; it
  is deleting the feature"* — was right, and the fix it described was
  incomplete rather than wrong.

## A worked example is a template, and the model will hand it back

- **This is the third failure mode of an example, after "too vague" and "too
  long", and it has now bitten twice in two days.** Measured across the
  2026-09-05 dispatch: the site's definition of Brent crude was
  `narrate-indicators-prompt.md`'s own sample sentence at **100% — every word**,
  and `fomc-2026-09`, `-10` and `-12` shipped one shared paragraph at 49–63% of
  the ✓ example in `narrate-events-prompt.md`. That example had been added the
  previous night to fix *"five central-bank events recited the same 4.81%
  ten-year"*. The duplication was moved, not removed: the cards stopped reciting
  the chart and started reciting the prompt, and nothing said so.
- **Both prompts now illustrate with instruments this pipeline does not carry** —
  Newcastle coal, the Chilean peso, Chad, the Reserve Bank of India, the Bank of
  Canada — under a heading that says why, and an explicit line: *copy the shape,
  never the words; if your sentence could be pasted into this file as a new
  example, it is the wrong sentence.* Verified live after the change: the same
  FOMC item came back with *"Warsh arrives at his first September meeting having
  spent Jackson Hole testing how much of the Fed's independence he intends to
  spend"* — 0% echo.
- **`promptEcho` (`lib/grounding.js`) is how you find out it stopped working.**
  It reads the examples out of the prompt the run is actually sending, so it can
  never fall out of step with the file, and reports the share of the output's
  5-grams that appear in one. **It gates `recent` at 0.5 and only counts
  `standing`**, and the asymmetry is what dropping costs: a rejected `recent`
  ships an empty paragraph on the established "a rejected recent is not a
  rejected item" path, while a rejected `standing` drops the whole item and the
  app's decks gate membership on having prose — so gating there would delete a
  card to avoid a sentence that is at least true. `prompt-echo` joins
  `chart-echo` in both `Dispatch:` lines.
- **Two ratchets in `corpus.test.js` measure the artifact rather than the
  intent**: no shipped sentence is ≥50% its own prompt's example, and no two
  instruments' `recent` share ≥30% of their 6-grams. The second carries the
  three known FOMC pairs as a named baseline that **should be deleted** once the
  next 04:00 pass rewrites them — the file's header is explicit that baselines
  are observed values, and the point is to catch a *new* pair.

## The prune deletes what a half-written payload could not describe

- **`items` is assembled from payload files that each degrade to `[]` when
  unreadable, and the prune trims the cache to match it.** So a mid-write
  `.chokepoints.json` on the 04:00 pass deletes every chokepoint's prose — the
  exact trade the code comment says is not worth making, with nothing stopping
  it. The `!NEW_ONLY` guard beside it protects the four other daily passes and
  does nothing for the one that actually prunes.
- **Reproduced twice by accident**, testing a prompt change against a checkout
  whose payloads were a month old: `--only mkt:tase` deleted 37 indicator
  entries and `--only fomc-2026-09` deleted 7 of 16 events. Both would have been
  committed but for a backup taken by habit.
- **`PRUNE_FLOOR` (0.6) declines the prune when the live set has collapsed
  against the cache**, and logs. Rotation is real — Polymarket questions close,
  `wiki-*` is re-picked every cycle — but it moves a handful of ids a day, not a
  third of the file. Below the floor the honest read is "a source did not load",
  and a stale entry costs a card nobody notices while a wrong prune costs every
  card that source feeds.

## The market-signal join read half its own signal

- **Not one `mkt:*` entity id exists anywhere in the corpus**, and the coverage
  join's first arm is `a.entityIds.includes('mkt:tase')`. `extract-entities.js`
  mints `brent` (437 articles), `cp:hormuz` (70), `nasdaq100` (20) and
  `stocks:*`; it has never minted an exchange. So for all 30 exchanges that arm
  is dead, and with it `directNews` — which feeds the ranking tiebreak and the
  "shared explanatory story" dedup in `selectMarketSignals`. TA-125 drew **0
  articles from a 327-story window** and its card shipped with no explanation.
- **`countryTags` is the arm that was missing.** `build.js` has joined the
  exchange cards' related lists on tags-or-country all along; this stage read
  tags only. `loadArticles` now returns `countries` — the ISO-2 codes an article
  links in its body — as a field of its own rather than more words in `hay`,
  because two-letter codes folded into a substring haystack would have `us`,
  `in` and `it` matching ordinary prose. **Partial by nature: 5,035 of 9,276
  articles carry a link**, so it supplements and is ranked below a name match,
  never replaces one. Measured: TA-125 0 → 12, BIST 7 → 8.
- **`real` and `won` were tags.** Word-boundary matching stops `smi` matching
  "transmission" and cannot save a tag that is itself an English word: Ibovespa's
  two "explanatory" articles for a 5.4% São Paulo rally were a piece on European
  housing and one on the Pentagon's maintenance backlog, both matched on *real
  estate*; `won` on the KOSPI is the past tense of "win". Both gone, and b3's
  bundle went 2 wrong → 1 right. **Country names stay** — removing `turkey` from
  BIST was tried and measurably cost a Black Sea shipping story the country arm
  could not see, because only half the corpus carries a link.
- **Eight ways to fail, all of them `null`, none of them logged.**
  `validateMarketComment` returned a bare `null` for every rejection and the
  caller discarded `result.error` in silence, so three cards shipping without an
  explanation looked exactly like three quiet days. It takes a `reasons` array
  now (optional, so no caller changed) and the stage logs the reason, the
  rejected text, and a `commented` count — the same discipline
  `narrate-indicators.js` has had all along.

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

## The chart is not a source for `recent`

- **The desk's `recent` was the chart read aloud.** Measured on the 2026-09-04
  dispatch: 121 of 123 instruments carried one, the median held four figures,
  and the usual opening was the series described back to the reader — *"the
  index sits near 3,956, down about 2.5% over the window from its 4,163 high
  on Jun 22, with the low of 3,764 on Jul 17"* — under a chart that draws
  exactly that. Five central-bank events recited the same two figures (a 4.81%
  ten-year, a 6.71% mortgage rate) because the coverage carried them, so five
  cards said one thing. The prompt already said "lead with the cause, not the
  number"; it also said "where the input gives you a date for an extreme, use
  it", and the model used it by printing it.
- **Both prompts now name what the reader is looking at and forbid it.** The
  `series` block is context; the dates of the extremes are for *finding* the
  story in that day's coverage; a number that appears in `series` does not
  appear in `recent`; and an input that does not explain the move gets one
  sentence about what the fortnight's coverage did carry, or an empty string —
  never a description of the line. Events write about *this* institution's
  decision: a backdrop sentence equally true under another bank's name is not
  about this one.
- **`seriesEchoes` (`lib/grounding.js`) measures it and does not gate.** A
  `recent` that repeats a `series` value is logged (`~ key: reads the chart
  (3,956, 4,163)`) and counted in the `Dispatch:` line as `chart-echo`. A gate
  would delete "held at 3.75% since December", which is the level plus a fact
  about it, in exchange for no explanation at all. The prompt is the fix; the
  count in the next 04:00 log is how you know whether it worked.
- **The prompt's hash is part of `recentFingerprint`, in both stages.** It was
  not, so a prompt edit reached only the items whose story or 5-point band
  happened to move that day. The full pass rewrites ~102 of ~110 items daily
  regardless (the sorted top-six headline set moves most days, so the
  "steady state costs nothing" claim holds for a handful), but a prompt edit
  should reach *all* of them, once, and now does.
