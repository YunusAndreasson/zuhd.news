# mobile/CLAUDE.md

React Native + Expo app for zuhd.news. Voice + philosophy in root `../foundation.md`.

`npm run verify` — typecheck + lint + test in one command; run before finishing.

## Before touching UI

**Read `DESIGN.md`.** It defines the token system, `<Text>` variants, primitives, and anti-patterns. The rules are tight by design — don't re-litigate them.

## Non-negotiables

- No NativeWind / Unistyles / Tamagui / Restyle. Vanilla StyleSheet + `useTheme()` is the committed approach. Matches the root "no framework" philosophy and the Globe 32ms perf budget.
- No inline hex codes. Colors come from `useTheme().colors` or a `tone` prop.
- No inline `fontSize`. Use `<Text variant>` from `components/primitives/`.
- No raw `<Ionicons>` — go through `<Icon>`.
- One typeface: Source Sans 3. No second family.
- **Gestures use the Gesture Handler 3 hook API** — `usePanGesture({…})`,
  `useTapGesture({…})`, `useCompetingGestures(a, b)` — never the v2 builder
  chain. `Gesture.Pan()` is still exported and `GestureDetector` still accepts
  what it returns: it detects a builder gesture and quietly routes it to the
  *legacy* detector. So the old API compiles, runs, and silently opts that one
  gesture out of the new native pipeline — which is the whole reason the app
  moved. Nothing will warn you.

  The callback names changed with it: `onStart` → `onActivate`, `onEnd` →
  `onDeactivate`, `onChange` → `onUpdate` (`changeX`/`changeY` ride along on
  the update event now), and a tap's old `onEnd((e, success) => …)` is
  `onDeactivate` plus the `canceled` flag the end event carries. `onBegin` and
  `onFinalize` keep their names but get the *plain* handler data — `translationX`
  and `velocityX` exist only on the extended data the middle three receive.

  Keep the config object in a `useMemo`. The hook owns the handler tag, so
  there is no gesture object to keep stable any more, but a fresh config
  identity re-pushes the whole config to the native side on every render.

## Dependencies Expo does not manage

`react-native-gesture-handler` is pinned **off** the SDK 57 set (3.1.0 vs the
prescribed ~2.32.0) and listed in `expo.install.exclude` so `expo install
--fix` — which `npm run deps:update` runs — cannot drag it back. Both its
in-tree dependents accept it (`expo-router` peers `*` optional,
`react-native-drawer-layout` peers `>= 2.0.0`), so there is one deduped copy,
which matters: two copies would mean two native gesture registries.

`react-native`, `react-native-reanimated` and `react-native-worklets` now sit
**on** the SDK 57 pin (0.86.2 / 4.5.1 / 0.10.1), and `expo install --check` is
clean — nothing in this app is deliberately behind any more.

They were held off that pin for weeks for the wrong reason. Builds 288/289/292
shipped exactly this set and crashed on launch, so the versions were blamed and
reverted; the revert changed nothing, because the cause was an inline array
callback inside a worklet (see the worklets entry in the memory index) that a
worklets upgrade had turned from latent to fatal. Version numbers are not what
makes this set safe — the absence of that shape is. Before touching these three,
scan worklet regions for inline functions passed to `.map`/`.filter`/`.forEach`/…;
a release build cannot name the offender if one survives.

## One screen

There is no section rail. `app/index.tsx` is a single map screen, and every
surface is a layer over **one** `MiniGlobe` mounted at its root:

```
MiniGlobe (Skia, pointerEvents none)  ← the only globe in the app
GlobeGestureLayer                     drag rotates · pinch steps zoom · tap hit-tests
MapHeader + IndicatorStrip            briefing, wordmark, menu · every mover, swiped, largest first
MapSheet                              custom, non-modal · peek = a story card · full = that story, grown
  SheetMasthead                       found N of M · all → (IndexSheet), or a live Red alert
  StoryDeck → StoryCard               the river, one story at a time, swiped sideways
platform sheets                       index · card · instruments · chokepoint · country · …
```

It replaced four sections on a horizontal pager, with the globe living as a
backdrop behind `news` only. That shape made the reader hold a taxonomy —
chokepoint traffic was "shipping" — and left the one surface with every story
and hazard already plotted on it looking like wallpaper. It was tappable the
whole time; nothing said so.

- **The camera reads a story index, not pixels.** `MiniGlobe.storyProgress`
  is a float position in the river — `2.4` is a finger partway from the third
  story to the fourth — and it indexes `cameraTrack` (`lib/map-feed.ts`), one
  pair per story. The deck writes it on the UI thread under a finger; a jump
  writes it directly. It replaced a pixel `scrollY` plus an `itemHeight` that
  had to be swapped whenever a different surface came forward, and a
  `listOffset` that nothing ever wrote — which is why closing the old reader
  parked the camera on story 0.
- **The camera has two owners, and a finger outranks the deck.**
  `MiniGlobe.cameraOwner`: `0` `storyProgress`, `1` a target — a drag on the
  globe, a strip or NOW selection, a jump's flight. A swipe that starts with
  the camera within a degree of the story in front takes it at once, so the
  earth turns under the finger; otherwise the camera stays where the reader
  left it, flies when the swipe lands, and hands back once it has arrived
  (`handleDeckDragStart` / `handleDeckSettle`). Taking it back mid-drag would
  snap the earth. **The app opens on the newest story**, not on the top
  instrument: at rest the card and the globe have to agree.
- **The sheet is for news; the strip is for instruments.** `buildNowSurfaces`
  (`lib/now.ts`) builds both in one pass. The sheet's NOW block used to hold
  instruments a builder marked `lead`; once the strip held every reading that
  moved, what was left there was contracts and dates sitting above the stories
  as though they were stories, so NOW holds only live Red GDACS alerts — news
  with no article yet, whose globe mark needs an accessible row. It holds no
  stories and no conflict events (UCDP publishes months in arrears, and NOW
  over a March event is a false claim). **Alerts never enter the deck**: the
  camera track is stories only. They reach the sheet as the masthead line
  (`now · …`, which opens the alert) and as `IndexSheet`'s NOW rows. A contract
  reaches the sheet the one honest way: as the odds on the story it settles.
- **The strip scrolls sideways and holds every reading that moved, largest
  move first.** It was three fixed slots, and the reader asked for all the
  markets, straits and currencies in one swipe, sorted so the most dramatic
  change sits at the left. `CardDelta.size` is the unsigned percentage the
  sort reads — set by `deltaFrom` for percent moves, by `straitDelta` and by
  the market-signal builder — and is absent for a move in points, which sorts
  last. Contracts (their subject is a question) and dates (no move) never take
  a slot. Slots are sized for 3.4 across: the cut slot is the only sign the
  row continues.
- **The sheet is hand-built on purpose, and it is the only one.** A platform
  sheet is modal: it scrims the globe, caps Android at two detents it picks,
  and cannot persist. `MapSheet` owns three rules that remove gesture conflicts
  rather than arbitrating them: at peek the card does not scroll; nothing in
  it bounces; the pan decides ownership once per gesture and holds it.
  Every other sheet stays a platform sheet.
- **Instruments without a place are one tap away, always.** Brent, gold, the
  ten-year, nisab, FX movers and every contract have no honest location, so
  they are not on the globe. `all →` at the end of the strip is never
  conditional, and `InstrumentsSheet` lists every card in `buildRankedInstruments`
  order. Placing Brent in the North Sea to avoid a list would be inventing
  locations for half the deck.
- **Predictions are merged into the story they settle, never plotted.**
  `lib/predictions.ts` inverts the `relatedArticles` the narration stage writes
  onto `poly-*` indicators. An index row carries a bare `62%`; the grown card
  carries the level, the move in **points**, and `MARKET_CAVEAT` (`OddsLine`). Odds are never tinted
  favorable/unfavorable — a green likelier war is the app taking a side.
- **The globe is how the news is found.** Every story is a beacon in its
  category hue at its *place* (`lib/story-places.ts` merges stories within
  5 km, or one dateline within 120 km, as the web does), and tapping one
  finds it: `MiniGlobe.collect` bursts in that hue, `lib/found-store.ts`
  records the slug, the next reprojection stops drawing the mark, and the deck
  **jumps** to that story (`focusStory`) and stays at peek. The camera flies
  only after the burst (`COLLECT_MS`) so the colour plays where the mark was.
  Tapping the same place again gives its next unfound story.
  - **A jump is never an animated swipe.** From story one to story thirty an
    animated pass would send the camera through twenty-nine datelines, so the
    camera is held (`cameraOwner = 1`), the position jumps, and the camera
    flies. Every entry point — a mark, an index row, a notification, search,
    saved, a related story in another sheet — goes through `focusStory`, and
    the ones that mean "read this" pass `grow`.
  - **Found is opening** — a mark tap, growing a card, or landing on a card
    while grown. **Swiping past a card at rest does not find it**: thirty
    seconds of swiping would otherwise empty the globe. Pruning drops a slug
    only when it has left the feed *and* is two weeks old, so a partial
    payload cannot relight the globe.
  - **A story outranks everything but a nearer reference mark.** The hit
    test takes the nearest beacon within 32 px and returns it without a
    chooser unless a strait, exchange, hazard or conflict mark is closer to
    the finger. Hotspots, the settled dot and Makkah never outrank a story.
- **The hazard layers are the web's.** IPC famine (`/api/ipc.json`), FIRMS
  thermal (`/api/firms.json`) and UN genocide determinations
  (`/api/genocide.json`) are fetched by `hooks/useOverlays.ts`, drawn from a
  3× baked sprite sheet as one tinted Atlas per layer, and open
  `OverlaySheet`. Their accessible path is `CountrySheet`'s "on the map"
  rows; thermal events carry no country, so theirs is the stories they were
  joined to.
- **The globe's gesture layer is hidden from screen readers, so the list must
  be complete.** VoiceOver activates an element at its geometric centre, which
  on a globe is a lottery country. Every mark that matters has a row in the
  strip, `IndexSheet` or the instruments sheet; that is the accessible path,
  and a new mark layer without a row is an accessibility regression. The card
  itself carries `next story` / `previous story` / `read the whole story` as
  accessibility actions — not the `adjustable` role, which would take over
  VoiceOver's own reading swipes.

The card doctrine below still holds. The cards render in `CardSheet` rather
than on deck pages, but `CardView`/`CardFrame` are unchanged, and every rule
about what a card may say is about the card, not where it is shown.

- **The data axis is specific, and the graph rule has exactly one exemption.**
  `markets` holds prices, rates, currencies and crypto; `shipping` holds
  chokepoint traffic; `outlook` holds prediction-market probabilities **and the
  dated events that settle them**. Every admitted card needs live pipeline
  analysis (`why`) — that part has no exemption — and a usable time series
  unless it is a `ScheduledCard`, which has no history because it has not
  happened. What it has instead is a distance, and that is its reading.
  Wikipedia attention, static comparisons and humanitarian snapshots still do
  not enter these decks.
- **A prediction market prices what happens; a calendar says when it is
  decided.** Those were in different buildings — `trends.events` has carried
  `standing` and `recent` since the events dispatch existed, the website's money
  rail has rendered them all along, and the app could not show one because the
  gate asked for a graph. `eventCards` looks 45 days ahead and keeps the nearest
  four; past that, "in 71 days" is a diary entry and the calendar would crowd
  out the live markets beside it.
- **The two shipping decks were holding half a story each.** `shipping` charts
  what traffic through Bab el-Mandeb has done; `outlook` prices whether it is
  closed by December. A strait card carries the market's odds as a figure now,
  matched on the strait's name appearing in the question — deterministic, no
  model, and a miss costs the figure rather than the card. Those questions only
  reach the payload at all since the Polymarket filter was fixed.
- **A current card says so, and `lead` is how.** A disrupted strait is on
  screen because its source cleared a freshness
  gate; the nisab and the
  gold-to-silver ratio are standing reference that happens to have moved a
  little. They arrived in identical typographic weight, so the distinction was
  one only a reader who already knew the gating could make. `CardFrame` now
  prints `current ·` before the kicker — an ink step, never a colour, because the
  chromatic budget is spent on `CardDelta`.
- **Straits are graphs, not a duplicate table.** `MiniGlobe` still locates all
  eleven and opens their detailed sheets; the concrete `straits` pool gives
  each usable total-traffic history its own swipe piece inside `shipping`. A fall of
  at least 30% earns `current`; otherwise it remains reference. Ranking uses
  current-news relevance and unusual movement so a small percentage does not
  hide a major live story.
  - **`current` is judged on the source's own lag.** IMF PortWatch publishes
    ~5 days behind the build — every strait's `asOf`, every cycle — so the
    three-day rule the price cards share could never mark a strait current,
    and a Hormuz 57% below its normal rendered as reference for as long as the
    rule was shared. `straitCards` passes `CHOKEPOINT_CURRENT_DAYS` (10) to
    `isCurrentObservation`; a stalled fetch still ages out of it.
  - **The 90-day normal is a line on the chart, not a sentence under it**
    (`CardSeries.reference`, a dashed hairline labelled on the first stretch of it the series leaves clear), and
    the strait's primary vessel class — tankers at Hormuz, container ships at
    Bab el-Mandeb — is a secondary figure with its own seven-day average and
    distance from normal. Both were in the payload all along; only the globe
    sheet read them.
- **A single FX threshold across this basket is not one rule.** It holds both
  the Lebanese pound and the euro, so a bar calibrated for volatile currencies
  silently excludes stable ones: measured over twelve consecutive snapshots the
  euro reached the deck **zero** times, and dropping the bar from 2.5% to 1.2%
  did not change that, because the two slots were always already taken by
  something larger. The euro was not failing a threshold, it was structurally
  unreachable. So the second slot is a different question — the largest move
  among the majors (`fx-eur`, `fx-jpy`, `fx-cny`) at a 1% bar — rather than
  second place. A major card on nine of twelve days.
  - **Ranking by *unusual* movement was tried and rejected on the evidence.**
    Three forms, measured against those snapshots, each promoted noise over
    consequence. A z-score against daily volatility hands every single day to
    the lira, whose crawling peg has tiny daily noise and a steady monthly
    slide — it scores trendiness, not surprise. Detrending and acceleration
    both surface sub-1% wobbles, and on the two days the ruble ran to +8.2%,
    with a fuel-crisis story attached, both displaced it with the rand at
    −0.8%. Consequence scales with the size of the move.
- **Ranking must not reward surface area.** Current-news relevance is the
  strongest linked story, not the sum of every match: aggregate cards carry
  many more topic tags than a single reading. After ranking, no more than two
  consecutive cards may share a kicker, so currencies or chokepoints never
  turn into a hidden sub-tab inside the vertical deck.
- **The graph must be the headline's history.** Chokepoint cards use total
  traffic throughout because that is the only historical series published,
  with a 30% materiality gate rather than the subtype sheet's 10% threshold;
  the gold/silver card graphs its ratio rather than flattening silver beneath
  gold on a shared dollar scale. A subtype or component may remain a secondary
  figure, but it cannot be the reading above a chart of something else.
- **Pull to refresh is a pull on the sheet at rest, not on its list, and it
  is real.** The list cannot host it: pulled down at its top, the expanded
  list belongs to the sheet, which collapses. A `RefreshControl` there broke
  both platforms differently — on Android its SwipeRefreshLayout took the
  collapse drag, on iOS `bounces={false}` meant it could never fire — so
  `MapSheet.onPullDown` fires when a drag that began at peek stretches the
  sheet past `PULL_TRIGGER`, and the masthead line above the card says
  `checking for new stories` while it runs. A refresh that inserts stories in
  front of the one being read keeps the reader on it (anchored by slug, camera
  held). `useArticles.refresh()` probes
  `/api/meta.json`; a moved `generated` runs `invalidateApiJson`, which marks
  every `useApiJson` snapshot stale at once — trends, chokepoints, analysis,
  market signals — so the strip, the alert block and the marks all refetch from
  the one gesture.
- **The sheet's pan waits for a direction before it decides.** Its first
  update can carry `translationY === 0` (observed on every drag on the
  Android emulator), and ownership decided on that zero read as "not pulling
  down", which gave every collapse drag on the expanded sheet to the list.
- **The sheet holds one story, swiped sideways, and growing it is reading
  it.** `StoryDeck` → `StoryCard`. At peek the card is its kicker (category,
  time, place), title, and the hook and why-it-matters sentences — every
  article's first two blocks, written to be the reason to read on, and what
  the web map's preview card leads with. Its headline alone ("Drone Boat Kills
  Drone Boat") gave nobody a reason. Pulled up, the same card is the whole
  story: all four sentences, `OddsLine`, `sources · save · share` as visible
  words, live country and entity links — with the globe scaled into a band
  above it and the strip receded. Nothing mounts or reflows when it grows.
  - **Peek is computed from type, never a fraction** (`lib/deck-layout.ts`,
    tested): masthead, kicker, two title lines and five lead lines at the
    reader's font scale, capped so the globe keeps 34% of the window, floored
    at kicker + title + one line, and never leaving the globe under 140pt.
    Grown, the globe keeps 20% (≥140pt). It is computed once per window and
    font scale, never per card — a sheet whose height followed each story
    would move the globe's centre, and reproject, on every swipe.
  - **The grown globe is a transform** (`grownGlobeTransform`), so the gesture
    layer is tap-to-collapse while grown: marks are not where the projection
    thinks they are under the scale.
  - **Nothing clamps.** A long lead runs on under the fold at peek and scrolls
    when grown. A card that stops being current scrolls back to its top.
  - **The deck and the sheet never share a drag.** The deck's pan claims at
    16pt horizontal and fails at 12pt vertical; the sheet's claims at 8pt
    vertical and fails at 24pt horizontal; neither is `simultaneousWith` the
    other. A grown card's own scroll runs alongside the sheet's pan (rule 2).
    The new index is committed when the finger lifts, not in the spring's
    completion callback — `scheduleOnRN` from an animation callback aborted
    the app once.
  - **The deck carries no position.** A `3 / 15` counter was added to the old
    card decks and removed. Position is the kicker's time-ago, `earlier ·` on
    the first story already seen (landing there fires `handleCaughtUp`), the
    next card's 10pt cut edge, and an end card that says the day is finite.
  - **The masthead line is the door to the whole day.** `found N of M · all →`
    opens `IndexSheet` — every alert and story as a row at natural height, the
    list a reader scans the day in, and the accessible path.
- **There is no full-screen reader, and it is not coming back as the default.**
  `ReaderLayer`, `ArticleList`, `ArticlePage`, `useVerticalPager` and
  `lib/pager-settle.ts` were deleted on 2026-09-13. A modal reader for every
  story was intrusive and cut the reader off from the globe, which is the one
  thing this screen is for; its nested-scroll guards and second camera scale
  existed for long-form reading that 350-character stories never need. Before
  it, a list of headlines was the sheet's front door, and a list-first index
  had already been tried once (740478ba, a branch) and abandoned for
  swipe-first news. Considered and rejected at the same time: a story stage
  under the strip with vertical swipes and the globe below it (it inverted
  where the thumb is), and a reticle at the globe's centre that picks the
  nearest story (exploring the globe would swap the card being read).
- **Android's back puts a grown story down before it leaves the app.** The
  map is the root screen, so without `useHardwareBack` on the full detent the
  key a reader uses to get back down to the globe closed zuhd.
- **A card's chart must not steal a swipe.** `TrendBlock`'s scrubber ate five
  page swipes in a row before `scrubbable={false}` existed; `CardView` still
  passes it.
- **An inner scroll that truncates is worse than one that parks.** `CardFrame`
  carries an inner `ScrollView` for a card taller than its sheet. With
  `nestedScrollEnabled` off — once turned off to stop a pager parking between
  two pages — Android's parent intercepted every vertical drag and the inner
  scroll never ran: four cards at default type (the Kerch strait, the
  fifteen-currency table, the nisab, wheat-and-rice) silently lost their
  source captions, and two a whole related-stories section. **A card citing
  IMF PortWatch never said so.** Two guards stay load-bearing: the inner
  scroll arms only when content is genuinely taller (`CardFrame` must add
  `COLUMN_PAD_V` back — it sits outside the measured view, and the naive
  comparison was 80pt optimistic), and `nestedScrollEnabled` is **on**.
  Trading a visible layout glitch for silent data loss is the worse bug,
  because nobody reports it.
- **`recent` reaches the app through `/api/analysis.json`, and that is a
  second endpoint on purpose.** `build.js` withholds it from `api/trends.json`
  because that payload is also what the website's instrument rail downloads on
  every homepage visit, and no rail row prints a paragraph. The web gets it
  per-instrument from `/api/entity/{id}.json` on the press that opens a card;
  the app has no such page and no such press — it builds a whole column up
  front — so it needs every paragraph before it renders anything. 17.2KB, prose
  only: carrying the citations measured 34.7KB and no card shows them, so they
  stay on the entity endpoint. A 404 is a supported state, not a loading one.
- **There is no bottom bar, and each of its three pills went somewhere
  specific.** `listen` is the pill at the top left of `MapHeader` — as a
  corner pill over the globe it was sized to stay out of the way and was not
  found, and as the button on the sheet's masthead it made the first row of
  the news list a control panel. `share` is a word on the grown card, where it
  can only mean the story it sits under (it used to share the last article
  read from any section). `zoom` is gone from the chrome: pinch on the globe
  steps through `useZoomCycle`'s levels, so readers who cannot pinch get the
  opening zoom only.

- **The graph and pipeline analysis stay visible.** The reading, chart, the
  desk's analysis, delta and current change make up the recurring surface.
  Hand-written fallback definitions are not rendered in the graph decks; static
  copy does not earn a card. Related articles remain ranking metadata and are
  not repeated below analysis that already names the news.
- **The one card headed by a ticker has to say what the ticker is.** A market
  signal card led with `BIST 100` over *"BIST 100 fell 4.8% over 4 consecutive
  sessions"* — a symbol the reader may never have met, explained by the reading,
  the delta chip and the chart above it restated in prose. The kicker carries
  the exchange now (`Borsa İstanbul`, the subject slot doing subject work
  instead of repeating the delta), the pattern label moves to `changed`, and the
  paragraph is the desk's definition of the index followed by its account of the
  move where there is one. `facts` survives only as the last rung, because a
  card with no `why` is a card with nothing under its chart and the two US
  indices arrive from the trends feed carrying no exchange.
- **The card answers the question the chart raises, which is *why did this
  move*.** The desk writes two paragraphs per instrument and they are not
  interchangeable: `standing` says what the thing is, written once and
  timeless; `recent` says what has happened to it and why, rewritten daily at
  04:00 UTC against the fortnight's coverage and grounded in it. Every card
  led with the definition until 2026-08-29 — a true sentence answering a
  question nobody asks while looking at a line that just fell 15%. `whyFor`
  (`lib/cards/markets.ts`) picks `recent` and falls back to `standing`; a
  strait falls back once more, to its catalog blurb. **Only one of them is on
  screen** — two paragraphs plus the supporting sentence overflows the page on
  most phones, and the page-overflow guards are the app's most expensive
  scar tissue. The definition stays a press away, on `/e/{id}`.
- **The fallback is load-bearing, because `hasGraphAndAnalysis` gates deck
  membership on `why`.** A card with no prose is built and then silently
  dropped, which is how the nisab card — the one this column is documented as
  opening with — was absent from it for as long as it had no `why` at all, and
  how the Suez strait vanished on a day its `recent` came back empty. A new
  card without a prose source is a card nobody will ever see and no error will
  ever mention.
- **Quote the thing the reader owns, or the sign fights the colour.** FX rates
  are published as local currency per dollar, where up means your money buys
  less. Mover chips report the currency's own move (`currencyMove`, the
  exact reciprocal — a rate up 5.6% is a currency down 5.3%, not 5.6%), which
  also retired the three lines of part two that existed only to explain the
  inversion.
- **One module decides what a move means, and every move is coloured.**
  `lib/valence.ts`. Up is not good here — oil rising is a fuel bill, an FX rate
  rising is a currency that weakened, bitcoin rising is neither — so
  `riseMeansFor` answers per *published series* and `valenceOf` applies it to
  the direction, which is why a fall in something whose rise hurts reads
  favorable. Getting that inverted is the first bug this shipped with.
  - **`neutral` is a colour, not the absence of one.** The chip used to fall
    back to `emphasis` ink wherever the app had no claim, which was two thirds
    of the readings and the same near-white as the label text beside them — so
    the reader's first question was whether a chip was coloured at all, and
    only then which way it pointed. Slate says *no claim* out loud. `valence`
    is required on `CardDelta` for that reason, and a `CompareRow` that prints
    a move always sets `tone`.
  - **It was four answers to one question and three of them disagreed.** A card
    chip in sage/rose; `EntitySheet` tinting on *magnitude* in dome gold, the
    globe's hue, so brent read rose on the card and gold in the sheet that card
    opens; `ChokepointSheet` calling a strait disrupted at 15% where
    `markets.ts` said 10%, so the same strait could be rose on the card and
    grey in its own sheet. Nothing in any of those files mentioned the others.
    A fifth answer is the regression; a row in `RISE_MEANS` is the change.
  - **Pass a literal `riseMeans` only when the card has inverted the quantity.**
    FX mover cards quote `currencyMove`, the reciprocal of the published rate,
    so they invert the meaning with it. Everywhere else, call the table — that
    is what stops a card and its sheet drifting.
- **The builders are pure and tested** (`lib/cards/`). Card arithmetic is
  pinned in `__tests__/cards-*.test.ts`, not eyeballed in a simulator, because
  the failure mode is a plausible wrong number rather than a crash. Two of them
  already bit: a relative-percent change printed as "points" on a probability,
  and a `windowChange` on a *daily* series described as month-on-month.
- **`threadSummary` must never be rendered.** It reads like a summary and is
  the desk's instruction to the writer ("Lead with the mechanism, not the
  outrage"). All 40 articles carry one.
- **A thread kicker needs `threadArticleCount > 1`.** Every article carries
  `threadArc` and `threadDay`; 38 of 40 carry them with a count of one, where
  "developing, day 13" is a claim the data does not support.
## Primitives live at

`mobile/components/primitives/` — `Text`, `Stack`, `Box`, `Screen`, `Pressable`, `IconButton`, `Icon`. Import from `./primitives`.

## Tokens live at

`mobile/constants/theme.ts` — add a new variant here with a JSDoc justifying the role; migrate call sites; update `DESIGN.md`.

## When a variant isn't quite right

Prefer the `scale` prop on `<Text>` over style overrides. `fontVariant` overrides (tabular-nums, oldstyle-nums) are OK as style overrides — they're orthogonal. Font family overrides (`font.bold`, `font.regular`) are an escape hatch; document them with a comment.

## Perf reminders

- Globe touches a 32ms JS budget; don't regress `callReproject` throttling.
- Reanimated animations gate on `useReducedMotion()` and battery saver — check before changing timings.
- React Compiler is **installed but NOT enabled** — in any build. The only
  switch is `app.json` → `experiments.reactCompiler`, which flows
  CLI → Metro `customTransformOptions.reactCompiler` → babel caller
  `supportsReactCompiler` → `babel-preset-expo`. That key is absent, so the
  plugin is dropped (`babel-preset-expo/build/configs/expo.js:135`). The
  `'react-compiler'` option in `babel.config.js` only *configures* or
  *disables* (`=== false`); it can never enable.
  Consequence: the ~320 manual `memo`/`useMemo`/`useCallback` sites are
  load-bearing today, not redundant — do not strip them on the assumption the
  compiler covers them. To actually turn it on, add
  `"reactCompiler": true` to `app.json` experiments, and add a `'use no memo'`
  directive to `components/globe/MiniGlobe.tsx` first: it relies on
  intentionally-stale `useCallback(..., [])` closures (three `biome-ignore`
  comments mark them) that the compiler would otherwise rewrite.
