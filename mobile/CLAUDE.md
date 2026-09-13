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
GlobeGestureLayer                     drag turns and glides · pinch zooms · tap hit-tests
MapHeader                             one row on a shade: Z (home) · every mover, swiped, largest first
MapSheet                              custom, non-modal · peek = a story card · full = that story, grown
  SheetMasthead                       a segmented story track you scrub · listen · list (IndexSheet), or a Red alert
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
  row continues. **A subject is one line and is never cut**: a strait prints
  its short form (`stripLabel` — `Hormuz Str.`, the full name is still what a
  screen reader says) and a slot widens past the 3.4 rhythm for a longer name
  rather than ellipsizing it. Two-line subjects made the whole strip two caps
  lines tall for the sake of "STRAIT OF / HORMUZ".
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
  `lib/predictions.ts` inverts the stories the narration stage cited for each
  `poly-*` contract, which the build puts on `/api/analysis.json` — never on
  `trends.json`, which carries none. For as long as `oddsByStory` read only the
  snapshot the odds line rendered for nobody, and the tests passed because
  their fixtures carried a field production never did. An index row carries a bare `62%`; the grown card
  carries the level, the move in **points**, and `MARKET_CAVEAT` (`OddsLine`). Odds are never tinted
  favorable/unfavorable — a green likelier war is the app taking a side.
- **The river is the last 24 hours.** `recentRiver` (`lib/news-order.ts`,
  tested) cuts the feed to one day on the dateline's own timestamp before
  anything reads it, so the deck, the globe's lights, the found ring and the
  index all show the same day. If nothing is inside the day — a stalled
  pipeline — the window anchors on the newest story instead of emptying the
  globe. A story a reader asks for by name (a saved story, a notification, a
  related story) is pinned into the river (`pinStory`) so `focusStory` can
  still land on it; `tick` re-measures the window while the app stays open.
- **The globe is how the news is found.** Every story is a beacon in its
  category hue at its *place* (`lib/story-places.ts` merges stories within
  5 km, or one dateline within 120 km, as the web does), and tapping one
  finds it: `MiniGlobe.collect` bursts in that hue, `lib/found-store.ts`
  records the slug, and the deck
  **jumps** to that story (`focusStory`) and stays at peek. The camera flies
  only after the burst (`COLLECT_MS`) so the colour plays where the mark was.
  Tapping the same place again gives its next unfound story.
  - **A found place is dimmed, never erased.** Once every story at a place is
    found its beacon becomes a hollow ring in the newest story's hue
    (`READ_R`), under the beacons still to find; a tap on it reopens that
    story, but only with no unread light in reach. A globe that emptied as it
    was read hid where the reader had been. Outside the disc a thin ring is
    what is left to find — `MiniGlobe` reads `foundProgress`, the count the
    masthead speaks, and the arc shrinks back toward twelve o'clock after each
    burst (instantly under Reduce Motion).
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
- **The globe moves the way the web's map moves.** A drag keeps the ground
  under the finger (`dragDelta`: the projection's own `radius / sin(clip)`,
  not a fixed degrees-per-point, which turned the earth at half the finger's
  speed zoomed in); a release glides (`withDecay`, capped at MapLibre's
  1400 pt/s, dropped under Reduce Motion) and a touch stops it; a pinch zooms
  continuously about the fingers (`pinchClip` + `anchorZoom`), and pinching out
  to the story's own framing hands zoom back to it. The arithmetic lives in
  `lib/globe-camera.ts`, pinned against d3 in `__tests__/globe-camera.test.ts`.
  - **Zooming in grows the planet past the screen; it never magnifies a patch
    inside the circle.** The zoom is still a clip angle — the ground's scale is
    `radius / sin(clip)`, so drags, pinches and story framings mean what they
    did — but the projection clips at `viewAngleFor` (`lib/globe-camera.ts`):
    everything that reaches the canvas's farthest corner, which is the whole
    hemisphere until the disc outgrows the screen. It used to clip at the zoom
    angle and stretch that cap across the resting disc, so at a small country's
    25° framing the ground barely foreshortened toward an edge the atmosphere
    painted as the horizon: a flat map in a circle. The rim, ocean and limb
    glaze are recorded into the ground picture at the projected limb, the stars
    and moon are clipped outside it, and the found ring follows it off the
    screen's edge.
  - **A swipe rises, crosses and comes down close.** `swipeClip`
    (`lib/globe-camera.ts`, tested) zooms out in proportion to the camera's
    travel between two stories — up to `SWIPE_OUT_MAX` (1.25×), never past the
    whole planet, flat at both ends — and lands on the next story's framing.
    Framings span 30°–40° (`clipAngleForArea`). Subtle is the point, and it has
    been overdone twice: at 25°–70° the planet swelled and shrank 2.2× between a
    small country and a large one once zoom grew the globe, and 25°–45° with a
    1.7× plain-sine rise still read as the map jumping on every swipe.
  - **The grown globe's transform is applied inside the canvas**
    (`MiniGlobe.canvasTransform`), not to its view. A view transform scales
    pixels, so a zoomed globe wider than the screen was cut at the canvas's
    edge and shrunk with the cut — dark bands down both sides of the band. The
    projection reaches `grownReach` so the ground the shrink uncovers exists,
    and pictures record past the canvas.
  - **The grid and daylight are the web's, for the web's reasons.** Twelve
    meridians and five parallels walked at 5° (`GRATICULE_LINES`), under the
    land — the curvature of the lines is what says sphere; the old
    `geoGraticule` call drew only the equator. Day is a lift of the lit
    hemisphere in `daylight` under the land (`day-shade` on the web), because
    darkening a near-black sea never showed where night was.
  - **A gesture starts from `viewLat`/`viewLng`, never from `cameraLat`/`cameraLng`.**
    Those only mean something while a target owns the camera; while the deck
    owns it they keep whatever the last flight left, and a drag that took the
    camera from them snapped the earth back to a story already swiped past.
    `MiniGlobe` publishes where it is drawing the camera, whoever owns it.
- **The Z mark is home.** It jumps the deck to the newest story (a jump, via
  `focusStory`), releases a pinch's zoom with the gesture layer's own
  `ZOOM_RELEASE_MS`/`ZOOM_EASING`, puts a grown story down and scrolls the
  gauges back to their start (`homeKey`). Settings and pages open from the
  trailing button in `IndexSheet`'s header (`SheetHandle`'s `action`), not
  from a fixed slot on the top bar.
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
    It is computed once per window and font scale, never per card — a resting
    sheet whose height followed each story would move the globe's centre, and
    reproject, on every swipe.
  - **Grown, the sheet stops at the story's own height** (`MapSheet`
    `contentHeight`), capped so the globe keeps 20% (≥140pt). A fixed full
    stop left a third of the screen blank under a four-sentence story while
    the earth sat in a 140pt band. This one *may* follow each card, because
    the grown globe is a transform: `grownGlobeTransform` reads the height the
    sheet actually stopped at on the UI thread, and never draws the disc
    larger than at rest.
  - **The lead and the rest are each one paragraph.** A block per sentence
    spent a paragraph gap after every sentence and stranded a short hook on a
    line of its own. `renderSentences(…, runs)` returns inline runs for it.
  - **Body text carries no `letterSpacing`.** On Android a paragraph with any
    tracking measures a line taller than it draws, and `textAlignVertical:
    'center'` split that phantom line into blank space above and below it —
    in every sheet, not only the card.
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
  - **The masthead is where you are, and the door to the whole day.** One
    row: a segmented track — one segment per story, lit to the one on the
    card, its fill reading the deck's `progress` on the UI thread — and a list
    button that opens `IndexSheet`, scrolled to the story on the card. The
    track is also a scrubber: drag to preview (`12 of 48` over the finger),
    lift or tap to jump (`goToStory`). Its gesture, detents and tooltip are
    `hooks/useScrub.ts` + `components/ScrubBar.tsx`, shared with the briefing
    player's scrubber, so the two cannot drift apart.
    - It briefly read `3 of 48 · 12 found ━━ all news ›` (the position twice,
      the found count a third time beside the globe's ring), and for one build
      led with the listen button against the start of the track — a play
      button touching a progress bar is that bar's play head. Listen now sits
      beside the list button at the row's far end, one of its two doors (the
      day as a list, the day as audio), which gave the top bar's gauges its
      slot.
    - The deck once carried no position at all, and swiping a day felt like an
      unmarked corridor.
  - **The next story peeks by 24pt of its text** (`DECK_PEEK`), not by a
    slot edge. The deck used to cut 16pt of a slot whose text sits 14pt in, so
    two points of the next headline showed — a glitch, not an affordance. The
    current card's column is narrower by the peek and a 16pt gap. A resting
    neighbour is drawn at `PEEK_OPACITY` (0.4) so the next headline does not
    pull the eye off the one being read, and fades out entirely as a story is
    grown (`peekFade`); either way it comes up to full as it is swiped in.
  - **A swipe lands where the card would come to rest.** `lib/deck-swipe.ts`
    projects the release with a deceleration rate instead of asking two
    questions (28% of the width, or 550 pt/s), capped at one story. The card
    follows the finger from where the pan claimed it, not from touch-down
    (which jumped it 16 pt), the landing spring carries the finger's velocity,
    and a card still landing is caught where it is.
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
- **A card is one column, scrolled by its sheet, and opens as high as a
  resting story.** `CardFrame` was a fixed-height page with its analysis in an
  inner `ScrollView` — the full-screen pager's shape, where a vertical drag had
  to page. That inner scroll once silently cut four cards' source captions
  when Android's parent intercepted it (**a card citing IMF PortWatch never
  said so**); in a sheet it had no job left, so it and `useScrollable` are
  gone and `CardSheet` scrolls the whole card. `CardSheet` opens at the news
  card's resting height (`layout.peek`) so the globe's flight to a gauge stays
  in view, and the reader pulls it up; Android's platform sheet has only a
  ~half and a full state, so it lands at half there. It is still a modal
  platform sheet — the map behind it dims.
- **`recent` reaches the app through `/api/analysis.json`, and that is a
  second endpoint on purpose.** `build.js` withholds it from `api/trends.json`
  because that payload is also what the website's instrument rail downloads on
  every homepage visit, and no rail row prints a paragraph. The web gets it
  per-instrument from `/api/entity/{id}.json` on the press that opens a card;
  the app has no such page and no such press — it builds a whole column up
  front — so it needs every paragraph before it renders anything. The cited
  stories ride with it now (`relatedArticles`, ~41KB, 13KB gzipped): the odds
  line needs them, and joined onto `trends.json` instead they added 24KB to
  every homepage visit. A 404 is a supported state, not a loading one.
- **There is no bottom bar, and each of its three pills went somewhere
  specific.** `listen` is the round play button beside the list button on the
  sheet's masthead — as a corner pill over the globe it was sized to stay out
  of the way and was not found, it spent a few builds at the right of
  `MapHeader`, and at the start of the masthead's track it read as that
  track's play head. `share` is a word on the grown card, where it
  can only mean the story it sits under (it used to share the last article
  read from any section). `zoom` is gone from the chrome: pinch on the globe
  zooms continuously, so readers who cannot pinch get the opening zoom only.

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
- **The globe's moving layers never go through React.** `callReproject`
  projects, then `recordGlobeFrame` records three `SkPicture`s (ground, marks,
  labels) that reach the canvas through **one** shared value. A drag frame's
  React commit (~39 ms, dev build, emulator) became ~9 ms of recording, at
  identical pixels. Skia replays the whole canvas on the UI thread whenever any
  shared value it reads changes, so publish once per projection and never put a
  `setState` back into the frame. On the emulator that replay is GL-pipe time,
  and framestats files it under the input phase of the next frame — a native
  profile showed the same main-thread CPU before and after, and 35% less JS
  CPU for 1.8× the redraws. Judge UI-thread GPU cost on hardware.
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
