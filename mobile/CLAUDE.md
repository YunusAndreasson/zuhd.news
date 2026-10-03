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
  Type it as the builder's return type — `useMemo((): PanGestureConfig =>
  ({…}), deps)` — never as `useMemo<PanGestureConfig>(…)`: only the first
  checks the literal for keys it does not know, so a stale `onEnd` beside
  valid keys fails the typecheck there and compiles silently in the second.
  The events are typed by it too; don't hand-write their shapes.

## Dependencies Expo does not manage

`react-native-gesture-handler` is pinned **off** the SDK 57 set (3.3.0 vs the
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
MapHeader                             one row on a shade: every mover, swiped, largest first · ▶ listen · ≡ menu
MapSheet                              custom, non-modal · peek = title + hook · full = the whole story, one height for all
  StoryDeck → StoryCard               the river, one story at a time, swiped sideways
StoryDock                             pinned to the screen's foot: the story track, nothing else
platform sheets                       menu · card · instruments · country · …
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
  left it, flies when the swipe lands, and hands back on the landing frame
  (`useCameraFlight`: `claimForDeck`, a worklet the deck's pan calls, and
  `toStoryIfHeld`). Taking it back mid-drag would snap the earth. The
  decision is made on the UI thread: a JS read of the camera blocks until
  the UI thread answers. **The app opens on the deck's index 0** — the
  newest story — not on
  the top instrument: at rest the card and the globe have to agree.
- **The sheet is for news; the strip is for instruments.** `buildNowSurfaces`
  (`lib/now.ts`) builds both in one pass. The sheet's NOW block used to hold
  instruments a builder marked `lead`; once the strip held every reading that
  moved, what was left there was contracts and dates sitting above the stories
  as though they were stories, so NOW holds only live Red GDACS alerts — news
  with no article yet, whose globe mark needs an accessible row. It holds no
  stories and no conflict events (UCDP publishes months in arrears, and NOW
  over a March event is a false claim). **Alerts never enter the deck**: the
  camera track is stories only. They reach the reader as one pill under the
  gauges (`AlertPill`: `now · …`, which opens the alert), over the globe the
  alert is about, below the player when it is up, and through an open story.
  Until 2026-09-30 it took the dock's row in place of the story track, so a
  cyclone live for days took the scrubber with it; the user moved it to the
  top the same day. A top toast and the globe's market marks start under it.
  A contract
  reaches the sheet the one honest way: as the odds on the story it settles.
- **The strip scrolls sideways and holds the ten readings that moved most this
  week, largest move first.** It was three fixed slots, and the reader asked for
  all the markets, straits and currencies in one swipe, sorted so the most
  dramatic change sits at the left; at twenty-odd slots it became a ticker, and
  the user asked for ten (2026-09-23, `STRIP_SLOTS`). The rest are behind
  `all →`. Only the row is cut: `strip` keeps every mover, because a gauge
  opened from the menu's lists or a strait tapped on the globe still looks
  itself up there to fly and ring its place.
  - **Every slot is the same seven days** (`gaugeMove`, `lib/cards/week-move.ts`,
    tested). The strip used to sort
    each card's own delta with its window hidden: a strait's gap from its 90-day
    normal beside an index's four sessions beside a currency's whole series — one
    sort over three quantities, printed as though they were one. The card keeps
    its own window and prints it. (Each slot drew the week's line under it
    until 2026-09-13; `Sparkline` was deleted on 09-25 with `InstrumentsSheet`,
    its last user.)
  - Calendar days, not observations, read off the period labels (`Sep 7`); a
    month label is a monthly series, which has no week and stays in the list. A
    currency's week is the currency's (`currencyMove`), a strait's is its
    seven-day average against the one before.
  - The slot whose card is open is marked and the globe rings its place
    (`MiniGlobe.selectedAt`, a position, since a strait's card id is not its
    mark's id).
  - **One number per thing: the week, wherever it is printed** (2026-09-25).
    The globe's exchange marks, the tap chooser and the markets list printed
    each exchange's session against the prior close, so `BIST 100 ▼2.9%` on
    the strip flew to a mark reading `↑0.09%`, and `all →` opened a list that
    disagreed with the row it came from. They print `exchangeMove` now
    (`lib/cards/week-move.ts`, tested), as a strait's mark already printed
    the strip's week. The card keeps its own window and prints it. The row
    itself prints no window: a `past week` label at its start cost the first
    view most of a slot, and the user asked for it gone the same day. The
    menu's lists and the map key say it once; each slot speaks it.
  - **The row is gesture handler's `ScrollView`.** The globe's pan lies under
    the whole header, and gesture handler finds a touch's handlers by walking
    the views under the finger; a plain `ScrollView` has none, so a drag that
    began between two slots, or on the blank end of one, turned the earth and
    left the row where it was. Anything that scrolls over the globe needs the
    same.
  - **A swipe lands on a slot, never between two** (`lib/strip-snap.ts`,
    tested). The row rests with a whole slot flush at the left inset, exactly
    where the first slot sits at rest, and it settles with a tick. It used to
    stop wherever the finger left it, so a fling routinely rested with the
    leftmost label cut mid-word — a row that looked broken rather than one
    with more in it. At 3.4 slots across a clean boundary at *both* edges is
    impossible, and the four tenths belong at the right, where the cut slot is
    the sign the row continues. The landings are the slots' own measured left
    edges (`snapToOffsets`, not `snapToInterval` — a longer name widens its
    slot, so there is no pitch), collected from the `onLayout` each slot
    already fires; the one landing that is not a slot start is the end of the
    row, because the last slots begin past the furthest it can scroll and
    `all →` still has to be reachable. The deceleration rate is left at the
    platform's own: a flick should carry as far through twenty-odd gauges as
    it did, and only the landing is decided.
  - Contracts (their subject is a question) and dates (no move) never take
  a slot. Slots are sized for 3.4 across: the cut slot is the only sign the
  row continues. **A subject is one line and is never cut**, and a slot widens
  past the 3.4 rhythm for a longer name rather than ellipsizing it. Two-line
  subjects made the whole strip two caps lines tall for the sake of "STRAIT OF
  / HORMUZ".
  - **A subject is words, not a code** (`stripLabel`, 2026-09-25, the user's
    request: "it should be self-explanatory, we shouldn't try to be smart in a
    way no one understands"). An index is its country's stocks (`Turkey
    stocks`, `stockMarketPlace`), a strait its name (`Hormuz`), and a few
    codes their plain names (`Oil`, `US 10-year rate`, `Fear index`). It
    printed `BIST 100`, `KOSPI`, `TA-125`, `VIX` and `Hormuz Str.`. The card
    keeps the index's name, and a screen reader hears both. The globe's marks
    keep the index name: they sit on the city.
  - **A name, and no word the reader will learn without; the row is
    optimized for space** (2026-10-03, the user's requests). A strait was
    `Hormuz ships` and the nisab `Nisab threshold`: the second word said what
    the number counts, on every visit, to a reader who learned it on the
    first. `BOSPORUS STRAIT SHIPS ▼8.1%` took 43% of a phone's width, and
    with two straits leading the row a strip sized for 3.4 gauges showed one
    and a half. Now: a strait is its name (`Bosporus`), without the word
    "strait" wherever the name stands alone — one named for a country keeps
    it (`Taiwan Strait`, `KEEPS_STRAIT`), a canal or a cape is never
    shortened; the nisab is `Nisab`; a ratio is a slash, the way round its
    card divides (`Gold/silver`, `Rice/wheat`). **`stocks` stays**, on the
    user's word: that a country's name means its stock market is not
    intuitive. A currency keeps its country (`peso`, `pound` and `rupee` are
    each several). Under a story, `StoryChart` gives a strait its `ships`
    back: that line prints the reading (`50`) with no unit.
- **The sheet is hand-built on purpose, and it is the only one.** A platform
  sheet is modal: it scrims the globe, caps Android at two detents it picks,
  and cannot persist. `MapSheet` owns three rules that remove gesture conflicts
  rather than arbitrating them: at peek the card does not scroll; nothing in
  it bounces; the pan decides ownership once per gesture and holds it.
  Every other sheet stays a platform sheet.
- **Instruments without a place are two taps away, always: `all →`, then
  the group.** Brent, gold, the ten-year, nisab, currencies and every contract
  have no honest location, so they are not on the globe. `all →` at the end of
  the strip is never conditional, and opens the menu, whose root leads with
  the data (2026-09-26, the user's request): `stock markets`, `largest
  companies`, `straits`, `currencies`, `energy, food & metals`, `rates,
  inflation & jobs`, `crypto`, `predictions`, `coming up`, then `world
  hazards` and `country rankings`, each a pushed page.
  Each group's row prints its count and its first row — the week's largest
  move, the strip's own number — so the menu says what is in it before it is
  opened. The app's own pages fold behind one `settings & about` row.
  - **The lists hold every published series, not the ranked pool**
    (`lib/instrument-catalog.ts`, tested). The pool is the strip's, and short
    on purpose: two currencies of fifteen, Brent without WTI, no Fed rate. The
    catalog lists all fifteen currencies, WTI, both gases, retail gasoline,
    copper, gold, silver, nine central banks' rates, eleven coins and
    every future date, reusing the pool's card object wherever it has one — a
    row, its slot and its card are one thing — and holding every new card to
    the deck's gate (`admitted`). A series the table does not name is listed
    by its `source`, so one the pipeline adds is not silently absent;
    `wiki-*`, `portwatch-*` and `stocks:*` are left out on purpose (the
    twenty largest companies have a list of their own, below). An index
    an exchange quotes is that exchange's row (the NYSE's index is the S&P
    500). Rows sort by the week's move, and a month is never sorted against a
    week: monthly series follow, in the table's order.
  - **Rates and coins are two lists, and neither is thin** (2026-10-03, the
    user's request: they were one, `rates & crypto`, and are not related).
    Split, they held five rows and three, so the pipeline publishes more
    (`.claude/rules/pipeline/cycle.md`): `rates, inflation & jobs` is nine
    central banks' rates, three US market rates, US and euro-area inflation
    and US unemployment; `crypto` is the ten largest coins and Monero.
    - **A policy rate is named for its country and captioned with its bank**
      (`Turkey interest rate` / `Central Bank of Turkey`); the Fed's and the
      ECB's rows keep the names everyone uses, and their caption says whose
      bank it is.
    - **A coin's caption says what it is** (`coinKicker`: `private payments`,
      `meme coin`), on its card too. Every coin's was `crypto`, which in a
      list named `crypto` said the list's name eleven times.
    - **A price under a dollar prints four decimals** (`formatReading`): at
      two, Dogecoin read `$0.09` whatever it did.
    - **A series neither table names goes with the coins if its source is
      the coin prices, and with the rates otherwise.** An app from before the
      split lists every new series under `rates & crypto`.
    - The Bank of England's and the Bank of Japan's decision cards draw the
      rate being decided now (`EVENT_SERIES`), where they had a countdown and
      nothing else for want of an honest series.
    - Still open: a daily `%` series (the two Treasuries, the mortgage rate)
      prints its week as a percentage of itself, beside monthly rates that
      move in points. The strip sorts on that number, so changing it is the
      strip's decision.
  - **`largest companies` is twenty share prices: a list in the menu, and
    gauges in the strip** (2026-10-03, the user's requests; `lib/companies.ts`,
    tested). One close a day from `/api/companies.json`. Not on the globe: a
    headquarters is not a place a price is about.
    - **In the strip they are gauges like any other** (`companyGauges`, joined
      to the ranked pool beside the exchanges). They were menu-only for half a
      day, on the worry that a single share swings more than an index and would
      crowd straits and currencies out of a row sorted by the week's largest
      move; the user asked for them in the row. Nothing caps them: the row is
      still the ten largest weeks, whatever they are, and on an earnings week
      most of the ten can be companies. A slot is the company's name
      (`NVIDIA`), which beside a week's move reads as its share; four long
      names are cut to the word a reader says (`Aramco`, `Samsung`,
      `Berkshire`, `JPMorgan`, in `stripLabel`'s table), and the card and the
      list keep the full one. A company with an old quote takes no slot — its
      week ended days ago — and keeps its row in the list. An open story about
      a company marks its gauge (`linkedGaugeIds`, through the card's `cited`).
    - **A row is a name, what the company does and where it is from** (`Nvidia`
      / `AI chips · US`), never a ticker, which is a code only a reader who
      already follows the share knows. The price carries `$` or `€` where the
      mark means one currency and the currency in words where it does not
      (`2,500` / `Taiwan dollars`). **A row does not say `a share`**: the line
      over the list says it once, and twenty rows repeating it told the reader
      what the first had (`CatalogRow.note`). The card says it in full.
    - **The paragraph answers why the share moved, where the desk can say.**
      `why` is the pipeline's `recent` — the daily narration's account, since
      the companies took slots in the strip, where a tapped `ASML ▲8.6%`
      opening onto "a Dutch company…" was the definition answering a question
      nobody had asked — and the catalog's standing sentence (`blurb`) on a
      day there is none. One of them, never both: the kicker already says
      what the company does. Under it, `in the news`: the stories the account
      was built from, or with no account the stories about the company,
      marked on the line by their number. Which stories are about a company
      is the pipeline's judgement (the entity stage's model says whether a
      story is about it or names it; `.claude/rules/pipeline/cycle.md`), so a
      story that mentions Microsoft is not on Microsoft's card.
    - **The prices arrive with every build, in `API_SNAPSHOTS`.** For half a
      day they were fetched only when the menu opened — about 9KB gzipped,
      changing each time a stock market closes (about four times a trading
      day), for a list most sessions never open — with a row that held its
      place in the menu while they loaded. The strip is on screen from launch
      and a slot opens its card on a tap, so the list cannot wait for the
      menu, and that machinery went (`useCompanies` is `useApiJson` again). The
      cost is the 9KB at each close for every reader; an unchanged file still
      answers 304. What it taught stays a rule: a menu row never appears or
      leaves while the menu is open (`DESIGN.md`) — the first version gave its
      row up when a fetch timed out, the rows under it moved up one, and a tap
      on `largest companies` opened `straits`.
    - **The catalog lists the pool's own card** (`take`), so a row and its
      strip slot open one object; built anew, the pool's copy was claimed by
      no list and was swept into the rates list with the leftovers.
  - **A monthly rate moves in points** (`deltaFrom` `unit: 'rate'`, two
    decimals, coloured like any move). Rounded to whole points a 25-basis-point
    cut read "unchanged"; as a percentage of itself it read "−6.3%". The
    ten-year is a daily `%` series and still prints its relative move, because
    the strip sorts on it; moving it is its own decision.
  - **Whatever a row opens is a page of the menu** (`MenuDetail`, the user's
    report the same day: opening Bitcoin or a prediction closed the menu for
    a sheet of its own, and closing that lost the list). A card, a disaster,
    a conflict event, a famine, fire or genocide mark, a ranking and a
    country are pages pushed on the menu's stack, rendered from each sheet's
    own body (`CardView`, `DisasterBody`, `ConflictBody`, `OverlayBody`,
    `CountryBody`), so a mark reads the same from a list as from the globe.
    Links inside a page stay in the menu — a disaster's country, a country's
    ranking, a ranking's country — except a story, which closes it. The globe
    still flies and rings the row's place, behind the menu, so closing it
    leaves the reader there; the ring goes with the menu. Do not hand a row
    off to its own sheet again.
  - **The menu keeps its place for five minutes** (`MENU_RESUME_MS`): closed
    from a card to look at the map, it reopens on that card; after longer, or
    from `all →` (which means every instrument), it opens at its root. The
    screen asks for the root by bumping `rootKey`.
  - **A row says what its number counts and names its subject in words.** The
    reading carries the card's `readingNote` under it (`52` / `EGP to the
    dollar`), and an exchange's row is `Turkey stocks` with `BIST 100 ·
    Istanbul` under it — the strip's own words (`stripLabel`), because the
    list printed index codes the strip had just stopped printing.
  - Disasters list under `red and orange alerts` and `minor alerts` (a feed
    of a hundred is mostly Green), and the 27 rankings under seven headings
    (`lib/metric-groups.ts`, tested: every metric listed once, a new one
    under `other`).
  - **A row that opens a list names what leads it, not what the list is**
    (2026-10-03, the user's request; `leadNames`, `lib/row-leaders.ts`,
    tested): up to three whole names, fewer where three would run past one
    line. A ranking's row is its top countries (`rankingLeaders`); a hazard
    layer's is its gravest (`hazardLead`, `lib/hazard-leaders.ts`, tested:
    famine by country, conflict with `as of` the source's last day, disasters
    counted by kind on a day with no Red or Orange); `saved` is the story
    saved last; `settings` is what the settings are (`settingsSummary`). The
    sentence each replaced is still the screen reader's hint. A new list row
    with a caption that only describes its list is the regression.
  - `MarketBrowserSheet` held all of this until 2026-09-26: exchanges with a
    rising/falling filter, and every other card unsplit under `other data`.
    Its filter lives on in `stock markets`, its row as `InstrumentRow`.
    `InstrumentsSheet` did it until 2026-09-20 and was deleted on 09-25.
    Placing Brent in the North Sea to avoid a list would be inventing
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
  tested) cuts the feed to one day of what zuhd published before
  anything reads it, so the deck, the globe's lights, the found ring and the
  index all show the same day. If nothing is inside the day — a stalled
  pipeline — the window anchors on the newest story instead of emptying the
  globe. A story a reader asks for by name (a saved story, a notification, a
  related story) is pinned into the river (`pinStory`) so `focusStory` can
  still land on it; `tick` re-measures the window while the app stays open.
- **The river is in time order, and what arrived says so** (2026-09-21, the
  user's request). `orderNewsRiver` sorts every story newest first, whatever
  its category. It was four category bands, newest first within each, so the
  track could be scrubbed to a category by colour — and the day's newest
  stories sat in four places, one at the head of each band, and a reader
  coming back could not tell whether anything had arrived.
  - **Newest means published, not happened** (2026-09-26, the user's
    report: new stories "not coming in order"). `articleTime` is when zuhd
    published a story — `publishedAt`, the build's git author time of the
    commit that added it, or `addedAt` on older payloads — and it orders the
    river, places the track, sets the day's window and is the `2h ago` on
    every card. It was when the story happened (`eventAt`), so every story
    the desk picked up late went in hours deep, among stories already read,
    under `21h ago · new`, where `‹ n new` never counted it; 18% of stories
    were picked up more than 12 h late at the time (the pipeline now cuts its
    pool at 12 h too). A cycle is one **run**: its stories share one time
    (`ranAt`, and since the build publishes `publishedAt` one commit's time
    — 43 stories in a day are 5 runs, where file mtimes made 22). Never read
    `addedAt` for time: it is a file mtime, and a rebase on the pipeline box
    resets it.
  - **Inside a run the most reported comes first** (`compareHeat`,
    2026-09-26, the user's request: "hottest news first"). A story past the
    400-report bar leads its run, by its count; below it, the number of
    outlets the desk cited, which every story has; then the newest event.
    The count is not used below the bar: three in five stories have none,
    and unmeasured is not quiet (`lib/coverage.ts`). It is not the rejected
    top-stories lead: a run shares one time, so the order inside it moves no
    cell on the track by more than the run's own width.
  - **No top-stories lead: the river is plain time order** (2026-09-24,
    the user's request — "the top stories were confusing"). For a day
    (09-23) `leadWithTopStories` moved up to five stories over the report
    bar to the front. The track places every story at its own time, so
    swiping through them sent the playhead leaping across the day — 16h,
    20h, then back to now — and only after them did a swipe move one cell.
    It stayed unwired until 2026-09-26 and was deleted when the most
    reported came first inside each run instead (above), which cannot jump.
    Do not bring a whole-river lead back without solving the track's jump
    first.
  - **New is decided by slug, never by `addedAt`** (`lib/fresh-store.ts`,
    tested). `addedAt` is a file mtime: one value per cycle, reset when a file
    is rewritten, and the live feed that day carried a story filed the day
    before reading as published that minute. A story is new when it was not
    in a feed the reader already had. `fresh` is a snapshot taken as each feed
    arrives, so a card's `new` does not vanish the instant the reader lands on
    it; landed stories become known at the next arrival. A skipped new story
    stays new until the day's window ages it out.
  - **Two places say it, both in ink.** Every new card's kicker ends with
    `· new`, and the first card after them that the reader already had with
    `· earlier` (the caught-up moment, unchanged). They opened it until
    2026-09-23: present on some cards and not others, they moved the
    coloured category word sideways from card to card as the reader swiped,
    so it now always starts at the text's edge (the user's request).
    **A story read once says `new` no more** (2026-09-26, the user's
    request): read (two seconds in front) and then left, its `new` is spent
    (`fresh-store` `spendNew`), on leaving so the word never goes off the card
    being read. The track has no mark for
    new: a 2pt rule over new stories' segments shipped on 2026-09-21 and was
    removed the next day at the user's request — a second row of dashes over
    the colours that added nothing the kicker and the pill did not already
    say. Do not bring it back. And when new stories the reader has not *read* sit
    behind the one in front — a resume or pull put them ahead of where they
    were reading, or a scrub or a quick swipe skipped them — `‹ 3 new` floats
    over the track and jumps to the newest of them. New stories still *ahead* of the
    reader are not counted: they will reach them. Read is the track's rule
    (`read-store`, two seconds in front); the pill counted any story merely
    landed on until 2026-09-22, so a new story swiped past in a second stayed
    bold on the track while the pill said nothing was left. **When every
    story in the day is new — a first launch, a day away — none is**
    (`unreadNewBehind` for the pill, `buildStoryRows` for the kicker and the
    screen reader's count, 2026-09-24): `‹ 15 new` only counted the stories
    left of the reader's place and never went away, and `· new` sat on every
    card.
- **The globe is how the news is found.** Every story is a beacon in its
  category hue at its *place* (`lib/story-places.ts` merges stories within
  5 km, or one dateline within 120 km, as the web does), and tapping one
  finds it: `MiniGlobe.collect` bursts in that hue, `lib/found-store.ts`
  records the slug, and the deck
  **jumps** to that story (`focusStory`) and stays at peek. The camera flies
  only after the burst (`COLLECT_MS`) so the colour plays where the mark was.
  Tapping the same place again gives its next unfound story.
  - **The current story's dot holds still, and its place is named large.** It
    breathed for three cycles on every landing until 2026-09-19, when the user
    asked for the animation to go and the location label (`DOT_LABEL_PT`, 16pt,
    was 14) to be larger instead: the name says which place is being read.
  - **A found place is dimmed, never erased.** Once every story at a place is
    found its beacon becomes a hollow ring in the newest story's hue
    (`READ_R`), under the beacons still to find; a tap on it reopens that
    story, but only with no unread light in reach. A globe that emptied as it
    was read hid where the reader had been. Outside the disc a thin ring is
    what is left to find — `MiniGlobe` reads `foundProgress`, the count the
    dock's story track speaks, and the arc shrinks back toward twelve o'clock after each
    burst (instantly under Reduce Motion).
  - **A long swipe stops riding the card and flies.** The deck's landing
    spring is `duration: 350` — perceptual, so ~525 ms of real settling
    (`DECK_SETTLE_MS`) — and it carried the camera whatever the distance, so a
    quarter of the planet crossed in the same half second as a neighbouring
    city. That is the *common* case: consecutive stories are ordered by
    time and can be anywhere on earth. `handleDeckSettle` now compares the
    crossing's own `flyMs` against that spring and hands the camera to
    `flyToStory` when the flight would be longer — at the finger's lift, from
    wherever the finger got it to. The card still snaps in 350 ms; the earth
    takes the time the distance asks for and lands on the story's framing.
    **Compare the durations, never an arc**: the same distance flies at
    different speeds from an 18° framing and a 24° one, so only the comparison
    guarantees the hand-off can lengthen a crossing and never hurry one
    (`__tests__/camera-flight.test.ts`). Under the bar nothing changes and the
    earth stays welded to the card, which is what makes a short swipe direct.
    Swiping again mid-flight leaves the camera more than a degree from the
    story in front, so `claimForDeck` declines and the globe holds still
    through that swipe before flying again at its settle — self-correcting,
    and already how a camera left elsewhere behaves.
  - **A far crossing does not ride the finger either** (2026-09-23).
    Welded to the card, a Pretoria-to-San-Francisco swipe turned the planet
    ~40° for a quarter of the screen's width, which read as a glitch. The
    rule is the lift's own comparison, made once per river on JS
    (`ridesFinger`): a crossing whose flight outlasts the card's spring holds
    the camera, zoom and all, as the pan claims the swipe (`claimForDeck`
    with the swipe's direction), and the landing flies it. A swipe that snaps
    back gives it straight back (`releaseForDeck`).
  - **Between projections the globe is warped, not frozen** (2026-09-23,
    `MiniGlobe` `warp`). A frame is projected on JS at most every 32 ms and
    later whenever a landing commit holds the thread; recorded on the
    emulator the globe started 160–340 ms after the card, stepped at ~10 fps
    and was still turning 300–700 ms after the card stopped. Each published
    picture carries the camera it was projected from (`FrameOut.cam`); the
    reaction publishes the live camera every UI frame (`liveCamera`), and the
    ground, marks, labels and the dot overlay are translated and scaled to
    it on the UI thread. It fades out when the whole planet is on screen,
    where a slide would move the planet instead of turning it, and moving
    frames are projected 20% past the canvas (`MOTION_REACH`) so the slide
    has ground to bring in. Unmeasured on hardware: it trades JS frames for
    a UI-thread replay on every frame of motion.
  - **A landing sharpens, and it is computed before it happens**
    (2026-09-23, the user's report: "the map lines change from low res to
    high res, that looks glitchy"). A moving frame is the coarse motion tier;
    a settled one costs ~300 ms (emulator, dev) to project at the resting
    tier, and for all of it the still, coarse frame stayed up after every
    swipe — then snapped. Three changes, all in `MiniGlobe`:
    `prefetchSettled` fills the settled cache for the stories either side
    while JS is idle after a landing, so a landing hits it (~25 ms);
    `settledKey` rounds the cache key far below a pixel, because the deck's
    trig leaves noise on a story's coordinates and an exact key never
    matched a prefetch; `drawLanding` projects the destination's settled frame
    once a swipe is within 3% of it (a flight within half a degree) and the
    warp carries it the rest of the way; and the settled ground fades in over
    the last moving one (`GROUND_FADE_MS`, 220) instead of replacing it. At
    rest nothing extra is drawn: 0 frames in 5 s, checked with gfxinfo.
  - **A landing sharpens, and is computed before it happens** (2026-09-23,
    the user's report: the map lines changing from low res to high res looked
    glitchy). A moving frame is the coarse motion tier; a settled one cost
    ~300 ms (emulator, dev) at the resting tier, and for all of it the still,
    coarse frame stayed up after every swipe — then snapped. In `MiniGlobe`:
    `prefetchSettled` fills the settled cache for the stories either side
    while JS is idle after a landing, so a landing hits it (~25 ms);
    `settledKey` rounds the key far below a pixel, because the deck's trig
    leaves noise on a story's coordinates and an exact key never matched a
    prefetch; `drawLanding` projects the destination's settled frame once a
    swipe is within 3% of it (a flight within half a degree) and the warp
    carries it the rest of the way; and the settled ground fades in over the
    last moving one (`GROUND_FADE_MS`) instead of replacing it. At rest
    nothing extra draws: 0 frames in 5 s (gfxinfo).
  - **A flight's last frame is a settled frame.** `angleChanging` counts
    only while the zoom override is on. A flight lands by dropping the
    override on the frame its angle takes its last step, and that frame was
    drawn at the motion tier with nothing after it — the coarse coastline
    stayed until the next touch after every far swipe, mark tap or jump.
  - **A jump is never an animated swipe.** From story one to story thirty an
    animated pass would send the camera through twenty-nine datelines, so the
    camera is held (`cameraOwner = 1`), the position jumps, and the camera
    flies. Every entry point — a mark, the scrubber, a notification, search,
    saved, a related story in another sheet — goes through `focusStory`, and
    the ones that mean "read this" pass `grow`.
  - **A flight travels the way a swipe does** (`hooks/useCameraFlight.ts`,
    2026-09-19). It tweened latitude and longitude apart at the zoom it
    started with, so a far story whipped past at close range; and because
    `MiniGlobe` refreshes framing and the settled index only while the deck
    owns the camera, the framing, the country highlight and the place label
    stayed on the *previous* story until the next swipe. Now one `flightT`
    drives the great circle (`slerpLatLng`, shared with the deck) and the
    swipe's rise (`flyCurve`, through the pinch's zoom override), lasts as long
    as the crossing asks (`flyMs`), and a story flight lands on the story's own
    framing (`MiniGlobeRef.framingFor`) and hands the camera back to the deck
    on that frame. A gauge or alert flight keeps the camera and returns to
    the zoom it left. A finger on the globe cancels a flight — through
    `cancelFlight`, never by stopping `flightT` alone: the zoom override is
    the flight's, and a touch at the top of a long crossing used to strand the
    globe zoomed out until the next pinch or settle.
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
  continuously about the fingers (`pinchClip` + `anchorZoom`). The arithmetic
  lives in `lib/globe-camera.ts`, pinned against d3 in
  `__tests__/globe-camera.test.ts`.
  - **A pinch out holds; only a pinch back to the story's framing hands zoom
    back (2026-09-22, the user's request).** The release rule was every pinch
    that ended at the story's framing or wider, so pinching out to see the
    whole planet sprang back to the story the moment the fingers lifted.
    `pinchHandsBack` (`lib/globe-camera.ts`, tested) hands zoom back only to a
    pinch that ends within `PINCH_HAND_BACK_SPREAD` (15% on the disc's scale)
    of the story's framing — the overshoot of pinching back to where you
    started. Further out, the zoom stays where it was left, up to the full
    hemisphere, as a pinch in always has. The story's framing returns when the
    reader moves to a story: `claimForDeck` does not take a camera held at a
    pinch's zoom, so the globe holds through the swipe and `toStoryIfHeld`
    flies down to the new story's framing on landing, as after a drag. Taken
    mid-swipe instead, the deck would carry the whole-planet zoom on to every
    story after it.
  - **Zooming in grows the planet past the screen; it never magnifies a patch
    inside the circle.** The zoom is still a clip angle — the ground's scale is
    `radius / sin(clip)`, so drags, pinches and story framings mean what they
    did — but the projection clips at `viewAngleFor` (`lib/globe-camera.ts`):
    everything that reaches the canvas's farthest corner, which is the whole
    hemisphere until the disc outgrows the screen. It used to clip at the zoom
    angle and stretch that cap across the resting disc, so at a small country's
    25° framing the ground barely foreshortened toward an edge the atmosphere
    painted as the horizon: a flat map in a circle. The rim, ocean and limb
    glaze are recorded into the ground picture at the projected limb, and the
    found ring follows it off the screen's edge.
  - **There is no sky (2026-09-22, the user's request).** The stars (a
    recorded picture of 90 dots) and the moon (a NASA texture with a phase
    shadow, blur masks and a colour matrix) sat outside the limb, clipped by a
    per-frame derived path, and were hardly ever seen: the open sheet and the
    top chrome cover most of the sky, and a zoomed globe covers the rest. They
    were removed for performance. Do not bring them back.
  - **A swipe rises, crosses and comes down close — on van Wijk's path.**
    `flyCurve` (`lib/globe-camera.ts`, tested) is van Wijk & Nuij's *Smooth and
    efficient zooming and panning* (2003), the path MapLibre's `flyTo` flies,
    so the app's globe and the site's map bend a crossing alike — the web's
    `flyToStory` passes `curve: 1.35` and so does this (`FLY_RHO`). One ρ sets
    the rise and the pacing together, which is the point: the ground crosses
    the screen at a constant speed. **`flyPosition` is why it works and is easy
    to drop** — the camera's place along the arc is the curve's answer, not the
    raw fraction, because the crossing covers most of its ground while it is
    highest. Take that out and the rise is decoration.
    It replaced two laws nothing coupled: a rise linear in travel to the
    ceiling (`ln(1.25) · travel/90 · sin²(πt)` — an 8° hop rose 2% and a 40° hop
    10%, so most swipes had no zoom at all) and a duration that was a square
    root of the same travel.
    `SWIPE_OUT_MAX` (1.25×) still holds, and is held by **bisecting ρ down until
    the path just touches it** — still a true van Wijk path, only a flatter one.
    MapLibre bounds ρ by `√(2·wMax/u1)` instead, which at a story's framings
    still lands near 1.6×, so it is not enough on a globe. `SPAN_PER_CLIP` (3)
    is the one calibration in it: how many ground degrees the screen shows per
    degree of clip, which is all the paper needs to know how many screenfuls a
    journey is.
    Framings span 18°–24° (`clipAngleForArea`). The *spread* is what must stay
    subtle, and it has been overdone twice: at 25°–70° the planet swelled and
    shrank 2.2× between a small country and a large one once zoom grew the
    globe, and 25°–45° with a 1.7× plain-sine rise still read as the map
    jumping on every swipe. Neither is an argument against the *curve*: both
    were about how far apart two resting framings sit, and the second about a
    rise that was not flat at its ends. The *level* moved on 2026-09-19: at 30°–40° a
    Sudan story framed Russia to South Africa, and the user asked to be taken
    closer to each place. 18°–24° keeps the 1.3× spread about 1.6× closer,
    near what the web's `flyToStory` shows across a phone's width. The rivers
    and the neighbour labels are keyed to it (`RIVERS_APPEAR_CLIP` sits under
    the tightest framing, so a swipe never projects the rivers).
  - **The grid and daylight are the web's, for the web's reasons.** Twelve
    meridians and five parallels (`graticuleLines`), under the land — the
    curvature of the lines is what says sphere; the old `geoGraticule` call
    drew only the equator. Day is a lift of the lit hemisphere in `daylight`
    under the land (`day-shade` on the web), because darkening a near-black
    sea never showed where night was.
  - **Circles on the sphere are drawn in closed form, not through d3**
    (`components/globe/sphere-circles.ts`, pinned against d3 in
    `__tests__/sphere-circles.test.ts`). The grid, the polar circles and the
    day, night and twilight caps are ellipse arcs on screen, one `conicTo` per
    quarter: ~90 path calls a frame where d3 streamed ~1,300 points, and 60×
    cheaper on the emulator — they were a quarter of a moving frame. Anything
    that is a circle on the sphere belongs there; coastlines and borders are
    `ortho-stream.ts`'s, below.
  - **Never read a Skia method per vertex.** `createSkiaPathContext` holds each
    builder's `moveTo`/`lineTo`/`conicTo` and calls them through `.call`: a
    property read on a Skia host object is a JSI call that copies the name and
    searches two maps, and cost more than the `lineTo` it fetched (1.8 µs
    against 0.53 µs per call). A frame streams ~4k points moving and ~30k
    settled; the paint setters in `fillPaint`/`strokePaint` are held the same
    way.
  - **No path on the globe goes through d3 any more** (`ortho-stream.ts`).
    Land, borders, ice, the highlight, rivers and lakes were 86% of a moving
    frame and the whole of a swipe landing's stall, because d3 rotates, clips
    and projects every vertex with six to ten trigonometric calls and an array
    allocation between stages. A layer's unit vectors are computed once when
    the layer is first read (`geography.ts`); a frame is a 3×3 rotation, one compare
    against the clip's cosine and two multiply-adds per vertex, with d3's
    horizon cut, limb stitching (`clipRejoin`), whole-view fill and resampling
    ported in cartesian form. `__tests__/ortho-stream.test.ts` holds every
    layer to d3's own path commands within 1e-6 px across cameras, clips and
    precisions, so a regression is a wrong number rather than a wrong
    coastline; 5.5× in node (`perf/benches/ortho-stream.bench.ts`), more on
    Hermes, where a trig-free floor measured 13.5×. `projRef` survives only
    for `hitTest`'s `invert`. A ring wound the other way — which d3 reads as
    the rest of the sphere — is never cap-culled, and containment (a polygon
    holding the whole view) is a parity count from one `geoContains` per
    polygon, taken once.
  - **The first frame is the motion tier, and the rivers and lakes decode on
    the tick after the first settled frame** (`warmDetailGeo`). The resting
    tier plus two 50m topologies used to sit between launch and the first
    pixel; a frame drawn without them is what every moving frame already is.
  - **A tier is decoded in parts, and never whole in the slot that needs it**
    (2026-10-02). `geographyTier` switches at scale 500 and story framings on
    a phone straddle it (radius 189: 24° is 465, 18° is 612), so most sessions
    need `overview` *and* `regional`, and the second one arrived with the
    first small country a swipe away: `getGlobeGeography` decoded it whole
    inside the idle prefetch, 2.2–2.8 s of one synchronous call on the
    emulator, the first swipe of a cold start, with the next swipes' cards and
    globe frames queued behind it (a JS heartbeat showed one 2,817 ms gap).
    Three changes:
    - **Each country's bounds are a table in the asset**
      (`scripts/generate-globe-geography.mjs`, `bounds`). `geoBounds` over
      every vertex of every country was 57–59% of decoding any tier, to feed
      the prefilter of `countryAt` — which only a globe tap and `findCountry`
      call. The table is d3's own answer widened by 1e-4°, so it can only let
      a point through to `geoContains`; `__tests__/globe-geography.test.ts`
      holds it to `geoBounds` and holds `countryAt` to what d3 found.
      **Regenerating the tiers regenerates it**; nothing else writes it.
    - **A polygon's winding is read from its unit vectors** (`ortho-stream.ts`
      `woundOutward`), not from `geoArea` per polygon, which was 58% of
      building a layer. A ring too thin to read (a three-point island on one
      meridian sums to rounding noise) is still d3's;
      `__tests__/ortho-winding.test.ts` holds every ring of three tiers to d3,
      wound both ways, and counts how often d3 is asked.
    - **`getGlobeGeography` returns at once and each part decodes when first
      read**: a lookup builds no layer, the highlight converts one country
      and not 255, and `warmGlobeGeography` does one stage a call. The idle
      prefetch warms a neighbour's tier a stage per slot and builds its path
      in the slot after, then warms whatever other tier the day's river rests
      at (`warmRiverTiers`).
    Measured on the emulator, dev build: a tier's decode 2,030 → 415 ms
    (`regional`) and 810 → 195 ms (`overview`), old and new interleaved in one
    evaluate; the swipe bench's JS-thread CPU 6,170 → 3,310–3,470 ms; all six
    landings commit on time where the second and third used to wait 3 s.
    Unmeasured on hardware and in a release build. Still one slot each: a
    neighbour's settled paths (~300 ms dev), which predate this.
  - **A resting globe carries the detail a reader looks for, not only the
    giants' names.** At the story framings (then 30°–40°) the globe named anchor
    countries and nothing inside them — Mali and Australia were an outline and
    a word. Now, at every zoom: each country's capital, a dot and a name
    (`globe/places.ts`, from the capitals the city lights use — `places-50m`'s
    `cap` flag also marks Sydney and Hamburg), below neighbours in the packer;
    the large lakes cut out of the land (`LAKE_FILL_MIN_AREA`, just under Lake
    Chad; the 110m coast has no inland water); and the rank-3 rivers, because
    the Niger, the Darling and the Murray are all rank 3. Lakes and resting
    rivers are **settled-frame work** (`nearSettled`, `RIVERS_REST_CLIP`),
    culled to the visible cap, so a drag pays nothing for them; they appear
    when the camera stops, as the full coastline already did. Lake Eyre's two
    Natural Earth halves are one label now.
  - **Zoomed out past 45°, a mark's name is earned by a move**
    (`MARK_NAMES_PLANET_CLIP`). The whole-planet view printed every cluster's
    `8 markets` and every quiet strait's name and `vs 90d`; each fit its
    collision box and together they read as noise. There, a cluster keeps only
    the count in its glyph and a quiet strait only its mark; disrupted or
    surging straits and single exchanges keep their labels. Story framings
    (18°–24°) are unaffected.
  - **Markets share a target only where there is no room to show them
    apart** (2026-09-25, the user's request). Any two exchanges closer than
    a target (48pt) used to become one `N markets`: New York and Toronto,
    Kuala Lumpur and Singapore at every story framing with the sea empty
    around them, and western Europe as one `6 markets`. `layoutMarketClusters`
    now tries each on its own first — its city or a leader of at most 72pt,
    crossing no other leader, and room for its name in a slot the label
    packer then takes first (`labelDy`) — and a market that finds none joins
    its nearest neighbour before the group is laid out again. Europe at a
    story framing now reads as named markets with at most a `2 markets` over
    the Alps. Past `MARK_NAMES_PLANET_CLIP` the old grouping stands. About
    0.1 ms a layout in node against 0.03 before; unmeasured on Hermes.
  - **The markets are laid out at rest and carried while the globe moves**
    (`followMarketLayout`, 2026-09-26, the user's report: "flickering so
    much when other content is stable"). Laid out on every moving frame, a
    swipe's rise and fall changed every distance between cities and flipped
    groups, leaders and name slots: a simulated London-to-Istanbul flight
    moved a market in 19 of 30 frames (8 of 30 before the split, so the
    grouping flickered too). Now a moving frame keeps each mark's group,
    its offset from its city and its name slot, and the markets re-arrange
    once, when the camera settles — 1 frame of 30 in the same flight. A
    market that comes into view in motion is laid out once, around the held
    marks, and held with them. Do not lay them out per moving frame again.
  - **Nothing on the globe prints over anything else** (2026-09-23). Every
    always-drawn thing reserves its room before a name is placed: the story's
    place, genocide names (set left of the mark, and held on the screen, when
    the right would run off it — RAKHINE was cut at the edge), story and
    conflict counts (a smaller count yields to a larger one 4pt clear, halos
    included — "5" and "8" at Washington read "58"), and every glyph — a
    strait and its arrow, a beacon, a hazard. A strait whose traffic moved
    outranks the counts and glyphs in its way; a quiet one is dropped first.
    Market targets stay on the planet (a crowded limb pushed "5 markets" into
    space), a single market's leader line keeps 14pt clear of other marks and
    never crosses the place label (`LEADER_CLEARANCE`,
    `lib/market-map-layout.ts`, tested), and a cluster draws no leader at all:
    its origin is the mean of its members, which is no place, and its line
    ended on "Paris".
  - **Conflict marks are sized by the dead** (`conflictScale`, log, 0.8–1.4),
    as the web sizes its squares; every event used to be one size.
  - **There is a key.** `menu → map key` (`SheetMapKeyPage`) draws every mark
    from the globe's own glyph paths and `mark*` tokens, with a sentence each,
    and prints the strait threshold from `CHOKEPOINT_DISRUPTED`. Before it the
    only way to learn a mark was to tap it.
  - **A gesture starts from `viewLat`/`viewLng`, never from `cameraLat`/`cameraLng`.**
    Those only mean something while a target owns the camera; while the deck
    owns it they keep whatever the last flight left, and a drag that took the
    camera from them snapped the earth back to a story already swiped past.
    `MiniGlobe` publishes where it is drawing the camera, whoever owns it.
- **The menu and the briefing are the controls at the top.** The data,
  search, saved, settings, the map key and the pages open from the menu
  (three lines) at the top right, out of thumb reach on purpose — it is
  opened a few times a week, and the top corner is where both platforms put
  a destination that rare. It was a cog until 2026-09-19; a cog promises
  only settings, and the top left, where a hamburger usually goes, is where
  the gauges start. (A `Z` home mark sat top left until 548457c8 removed it.)
  - **`▶` sits beside it and `markets` moved into it (2026-09-21, the user's
    request).** `markets` was a word between the gauges and the menu; the
    menu's groups hold it now, and the strip's `all →` opens the menu.
    `▶` came up from the dock. Both are bare glyphs in one
    `HeaderControl` — one height, one `GAUGE_EXTRA` nudge, the glyph centred
    in one square — so they line up exactly by construction; the user asked
    for exact vertical alignment, and a vertical style on one of them alone
    is how that breaks. `▶` is the small icon size (14pt against the menu's
    20pt) in a box 8pt narrower, with the difference given back as touch
    slop (2026-09-26, the user's report: a filled triangle at 20pt read
    larger than three thin lines and took the gauges' room). A paused briefing draws its heard arc round
    `▶` on a rule-ink ring. `▶` hides while the player bar is up and keeps
    its slot, so the gauges never change width with the player.
  - **The player hangs under the bar, where `▶` was (2026-09-22, the user's
    request).** It sat on the dock at the foot of the screen, and once `▶`
    moved to the top, pressing it opened a player at the far end of the
    screen from the button that started it. `BriefingBar` takes the top
    bar's measured height (`topOffset`) and drops in from it. It floats: made
    part of the top chrome's layout, it would shrink and re-centre the globe
    and shorten the open sheet every time it appeared. It clears an open
    story anyway — the open sheet leaves at least `BAND_MIN` (140pt) of globe
    under the bar, and the player is about 80pt. A top toast starts under it
    while it is up; the cards no longer leave room for it at the bottom.
- **The globe's gesture layer is hidden from screen readers, so the list must
  be complete.** VoiceOver activates an element at its geometric centre, which
  on a globe is a lottery country. Every mark that matters has a row in the
  strip, the story cards or the menu — its groups, and `world hazards`, which
  lists exactly the marks each hazard layer draws (`globeGdacsAlerts` is the
  globe's GDACS selection, shared) and gave conflict and fire marks the row
  they lacked. That is the accessible path, and a new mark layer without a row
  is an accessibility regression. The card
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
  eleven, and a tap on one opens that strait's card — the one its gauge opens.
  It opened a `ChokepointSheet` of its own until 2026-09-13, with a raw daily
  chart, the vessel classes and the weather, while the gauge opened a card with
  a seven-day-average chart and the odds: one strait, two answers, chosen by
  where the reader touched. The card carries both now (`straitFigures`, every
  class against its normal, primary first, and a sea-state line) and the sheet
  is deleted. The concrete `straits` pool gives
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
    every vessel class — tankers at Hormuz first, container ships at Bab
    el-Mandeb first — is a secondary figure with its own seven-day average and
    distance from normal. Both were in the payload all along; only the old
    globe sheet read them.
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
  sheet past `PULL_TRIGGER`, and the dock's track gives way to
  `checking for new stories` while it runs — for at least a second
  (`REFRESH_MIN_MS`), then the answer: an unchanged build answers in a blink,
  and the line flashed too fast to read. A refresh that inserts stories in
  front of the one being read keeps the reader on it (anchored by slug, camera
  held). `useArticles.refresh()` probes
  `/api/meta.json`; a moved `generated` is an arrival (below), so the strip,
  the alert block and the marks all refresh from the one gesture.
- **A new build reaches the screen as one arrival, in one commit**
  (2026-09-23, `lib/arrival.ts`, tested). A return used to land in waves over
  several seconds: the clock re-measured the track, the feed reordered the
  river, `noteFeed` re-marked the kickers a commit later, and each snapshot
  and the heatmap re-rendered the screen as it came in. Now the feed and every
  snapshot in `API_SNAPSHOTS` (`lib/api-snapshots.ts`, which the hooks read
  their entries from, so the two cannot drift) are fetched first and applied
  in one notify flush, with `noteFeed`, the tick and the screen's answer
  inside it. A resume, a pull, the launch check and the background task all go
  through it. The launch opens on the disk copy read synchronously
  (`feedCache.readSync`, always the newest the device has); the feed query
  never refetches on its own once it has data.
  **An unchanged layer costs nothing**: the snapshots are fetched with the
  `ETag` of the copy the app holds (`fetchJsonIfChanged`, tags kept on disk
  for the headless run, erased with the cache), and the site answers 304 with
  no body. Downloading all twelve on every build was ~120KB gzipped — conflict
  alone is 30KB and changes about monthly — and the hourly background task
  did it for readers who never opened the app. A tag is sent only while the
  app still holds that layer's data, or a 304 would leave it empty.
  **The site has to keep its half**: a 304 needs identical bytes, and until
  2026-10-02 five layers carried a build or fetch time that changed them on
  every build, so famine, conflict, straits and alerts were downloaded whole
  with nothing new in them. The build holds those stamps now
  (`.claude/rules/web/build.md`, "A layer's stamp moves only when the layer
  does"). Found with a network inspector, not in this code: here everything
  was working.
- **Where a return lands** (`lib/resume-landing.ts`, tested; the user's
  choice, 2026-09-23). Under an hour away the reader stays on their story and,
  if stories arrived, a top toast `3 new · tap to see` goes where `‹ 3 new`
  goes (`unreadNewBehind`, shared). An hour or more, or a launch the reader has
  not moved in, puts the deck back on the front in the arrival's own commit,
  camera held, then flies there — decided by an effect a commit later, the old
  card sat under the new day's times for a second before it jumped. The front
  story is always anchored by slug (`currentSlugRef`, set whenever a story is
  in front): it used to be null until the first swipe, so an arrival before one
  swapped the story at index 0 in place and snapped the globe.
- **The background task does a return's waiting** (`lib/background-fetch.ts`,
  every 60 min). It takes the whole arrival, not the feed alone: with the app
  alive in the background the river reorders while hidden; a headless run
  restores the persisted cache, applies, and saves it back. A return counts
  new stories against the feed it left with, so arrivals applied while away
  still get their toast.
- **The dock's cells move rather than jump** when the river changes: keyed by
  slug, with a 250 ms `LinearTransition` (`ScrubBar` `cellKeys`).
- **The sheet's pan waits for a direction before it decides.** Its first
  update can carry `translationY === 0` (observed on every drag on the
  Android emulator), and ownership decided on that zero read as "not pulling
  down", which gave every collapse drag on the expanded sheet to the list.
- **The sheet holds one story, swiped sideways, and growing it is reading
  it.** `StoryDeck` → `StoryCard`. At peek the card is its kicker (category,
  time), title and **hook** — the first sentence only, written to be the
  reason to read on. Its headline alone ("Drone Boat Kills Drone Boat") gave
  nobody a reason; the hook plus why-it-matters, which the card carried until
  2026-09-19, was half of every article, and readers felt they had to read
  every story to get past it. Pulled up or tapped, the same card is the whole
  story: every sentence, `OddsLine`, live country and entity links, and
  `sources · save · share` as words under the text — risen over the globe,
  which stays where it is, and with the strip still in place (it used to recede;
  it never covered the story, so hiding it only took the markets away). Nothing mounts or reflows when
  it grows: every sentence after the hook is laid out all along under a
  `Veil` — the
  sheet's ground over them, the first line at half strength fading to
  nothing by the second, which the user preferred to blank space as the sign
  that the card opens. It is on at rest and off the moment the sheet's
  `progress` leaves it (computing its first style from `open`, because the
  card mounts as a swipe lands), a tap on it opens the story, and the rest
  takes no touches and is hidden from screen readers until the sheet settles
  open. **It is on only with the sheet exactly at rest (`progress` 0), and
  switches, never fades** (2026-10-03, three rounds on an iPhone Pro): faded
  with the sheet it lagged opening and stalled a close just before it landed,
  where the emulator did not — iOS draws a translucent layer with sublayers
  off screen as a group on every frame between 0 and 1; switched on within 1%
  of rest it popped in while the critically damped landing still crawled its
  last points; faded in after landing it looked strange. Opacity never goes
  on the gradient view itself: on iOS any opacity change rebuilds a
  `backgroundImage` view's gradient layers.
  - **Peek is computed from type, never a fraction** (`lib/deck-layout.ts`,
    tested): kicker, two title lines, three hook lines and the dock at the
    reader's font scale, capped so the globe keeps 34% of the window, floored
    at kicker + title + one line, and never leaving the globe under 140pt.
    It is computed once per window and font scale, never per card — a resting
    sheet whose height followed each story would move the globe's centre, and
    reproject, on every swipe.
  - **A story is four blocks or five, and the app must not assume four**
    (`scripts/write-prompt.md` §rhythm). Hook, why it matters, mechanism,
    what's next — and, where the sources carried one, a counterpoint or a
    named person's words between the mechanism and the last. The 5th block is
    optional by design and earned per story, so `article.sentences` is a list
    whose length varies: `hookOf`/`restOf` slice it, they never index it. The
    ceiling that sizes the sheet before `StoryMeasure` measures anything
    (`STORY_LINES`) is keyed to the writer's own character ceiling, so raising
    one without the other is how the open sheet starts jumping again.
  - **Open, the sheet is one height for every story** (`layout.full`), sized
    from today's cards as rendered: `StoryMeasure` lays every card out off
    screen once per river, width and type size, and `openStoryHeight` takes
    the height three in four of them fit inside whole — but `storyCap` binds
    first on a real phone, so what the reader gets is the globe's 20% floor
    and a card that scrolls. Until then a type estimate for the longest
    possible story stands in.

    **Measuring is per card, and only when it can matter** (2026-09-23).
    Laying out every card off screen was 742ms of a 1,365ms arrival commit
    (dev build). Each card's height is cached by its text, its extras and the
    reader's type and width, so an arrival measures only its new cards; and
    `openHeightNeedsMeasuring` skips it whole when a cheap lower bound from
    the characters already puts the day over `storyCap` — on a shorter phone,
    where the cap decides the height anyway.

    **Scrolling an open story is the norm, not the exception, and that is a
    2026-09-20 decision rather than a discovery.** The article budget rose to
    480/560 characters and every block went back to being its own paragraph;
    together those put a typical story about 5 lines past the cap on a
    393×852 phone, measured. The alternative was a shorter story or a smaller
    globe, and the user chose the scroll on the grounds that nothing above the
    prose moves with it — the globe and the dock's track are both outside
    the scrolling area. Two things follow that were true of an
    exception and are not true of a norm, and both were answered on
    2026-10-03. `sources · save · share` sat at the end of the card, so below
    the fold on most stories — out of sight on opening for an estimated
    58–87% of a fortnight's stories on a 393×852 phone; it is now
    `StoryFooter`, outside the card (below). And nothing said a story went
    on — the indicator was off — so the scroll indicator now shows while an
    open story scrolls and flashes once as a story becomes the one being read
    (`DeckSlot`). It used to stop
    at each story's own height (`contentHeight`), and a swipe while reading
    re-sprang the sheet *and* rescaled the globe — the text jumped by three or
    four lines on every story, which the user asked to have gone. Do not
    bring the per-story stop back. Sized for the longest story it left four
    or five blank lines under a typical one, which the user also flagged; the
    spare space now sits after `sources · save · share`, at the end of the
    story, rather than between the text and buttons pinned to the dock.
  - **`sources · save · share` follows the text and never leaves the sheet**
    (`StoryFooter`, 2026-10-03, the user's choice). It is outside the card:
    each deck slot is a scroll area as tall as its story, up to the room there
    is (`styles.fit`, `flexGrow: 0`), with the row straight after it. A story
    that fits ends on its row, the spare sheet below; a longer one scrolls
    above a row held at the sheet's foot, over the dock. No gap either way and
    nothing measured — layout does it. Pinned to the foot whatever the text
    did (tried 2026-09-19), it left a hole under short stories; that is the
    one shape not to bring back. The words are `captionEmphasis` in
    `accent`, the palette's second voice — one step softer than the text —
    and `saved` is the emphasis ink (2026-10-03, the user's question). In
    grey small caps the card's only buttons looked like its labels; in the
    text's own ink, once the row's rules had gone, they read as a last line
    of the story. **The row has no rule over it and none under it** (the
    same day, the user's request: the lines were not necessary). A hairline
    closed it above and the dock's closed it below, and the two boxed three
    words in. What the upper one was for is kept without it: a story longer
    than the sheet scrolls behind the row, and with nothing there its text
    was cut through the middle of a line, a few points over `1 source` (seen
    on the emulator at a phone's height). So the text goes out into the
    sheet's ground over its last 16pt (`styles.fade`, a still gradient on the
    footer). It is always mounted: for a day it was there only while the
    story was open, and the hard cut came back wherever else the row is in
    sight — on the card coming in on a sideways swipe, and through a closing
    spring (a review's finding). At rest it lies under the dock with the row,
    and the resting card is the same picture with it and without, pixel for
    pixel (compared on the emulator). It is the fifth gradient carve-out in
    `DESIGN.md`. That is the space every story
    already ends on, so a story that fits shows nothing of it; nothing of a
    story may be set in its last 16pt (the thread line took a margin for
    this). Their targets are the row's height plus 4pt (48), and a
    press counts only as a tap (`Pressable`'s `tapSlop`): the row is where the
    thumb rests and where sideways swipes start. A measured card height is
    the story alone; `computeDeckLayout` adds `ACTIONS_ROW`. **The row is
    three words at the right: `save · share · sources`** (2026-10-03, the
    user's requests, in four steps). All three at the left were the far
    corner from the hand holding the phone. Moved right, `2 sources` did not
    sit with the other two — a number and a noun beside two plain words —
    and for one step it stayed at the left alone. Then the number went: it
    was the row's one piece of noise, it changed from story to story, and the
    count is the first thing the sheet it opens shows. A screen reader hears
    `Sources, 2`: the word on screen first, so "tap sources" finds it on a
    one-source story too. Last, `sources` and `save` changed ends: `sources` is
    in the corner, the user's choice. That also puts `save` at the row's free
    end, which is where a word that changes length belongs: the row is set to
    the right, so `saved` grows to the left into the empty row and the other
    two never move (seen on the emulator: `share` and `sources` in the same
    place saved and unsaved). While `save` was last, its slot had to be held
    at the width of `saved`, and both ways of holding it failed first: a word
    laid over an unseen `saved` broke into `save` over a clipped `d`, and a
    `d` coloured `transparent` was drawn in the word's ink — that colour is
    the value 0, and Android's text renderer reads 0 as no colour set. A chart or odds
    line that ends a story drops its bottom rule (`last`): it would be the
    rule over the row by another name.
  - **A slot that comes to the front tells the sheet it is at its top**
    (`DeckSlot`, 2026-10-03, found driving the emulator). The sheet closes on
    a downward drag only when the front story's scroll offset is 0, and only
    the front slot writes that offset, as it scrolls. After a long story was
    scrolled and the reader swiped on, the offset was still the old story's:
    the next one could not be pulled down, and one too short to scroll never
    corrected it. Every slot is back at its top before it can come forward,
    so the fix is a write of 0 on becoming current — not a read.
  - **Every block is its own paragraph, with the gap the reader sees between
    them.** `mdStyles.sentence`'s `marginBottom` draws it, and
    `renderSentences` returns one block `Text` per sentence.

    For one day (2026-09-19 to 2026-09-20) the hook was a paragraph and
    everything after it ran on as a single one, to buy back the vertical the
    gaps cost. That is the wrong trade and it is not to be made again: the
    writer's format spends a paragraph of `scripts/write-prompt.md` telling
    the desk that the blank line between blocks *is* the separation the reader
    sees, the web reader has emitted one `<p>` per block all along, and the app
    was the only surface where four deliberate blocks arrived as one wall of
    prose. Separation is the format, not a decoration on it.

    It costs about 40pt on a typical story — roughly a line and a half — split
    between the gaps themselves and the part-empty last line every block now
    keeps. `computeDeckLayout`'s stand-in estimate counts both
    (`STORY_LINES` per block, `BLOCK_GAP_RATIO` between them); the real
    heights come from `StoryMeasure` and need no arithmetic.
  - **The hook is the lede, and space groups the card** (2026-10-03, a
    hierarchy pass with the user). Open, the hook was paragraph one of five —
    one size, one ink, one gap — so the sentence the reader opened the story
    for sank into the blocks explaining it. It is now the web's phone lede:
    the same 17pt, so the resting card's lines are unchanged, in emphasis ink
    (the title too, as the web's), with twice a paragraph's gap under it
    (`mdStyles.lede`, `LEDE_GAP_RATIO`). The chart or odds line follows the
    prose after a section gap (`AFTER_PROSE_GAP`, ~`SPACING.lg` with the last
    block's own), and the thread line under it closes the card. The ladder — line, paragraph, lede,
    section — is in `DESIGN.md`. A test holds the estimate's ratios to the
    renderer's margins. The peek does not count the lede's gap: under a
    two-line hook the veiled line still clears the dock.
  - **At rest the card is one button.** The hook's country and entity links
    are its plain words until the story is open (`renderSentences`'
    `plainBlocks`; a separate `restingHook` memo, so opening swaps that one
    block mid-spring and nothing else). A country in the hook opened a
    country sheet instead of the story, and its underline — solid on Android
    — was the heaviest mark in the sentence a swiping reader decides on.
  - **Body text carries no `letterSpacing`.** On Android a paragraph with any
    tracking measures a line taller than it draws, and `textAlignVertical:
    'center'` split that phantom line into blank space above and below it —
    in every sheet, not only the card.
  - **A story opens over the globe, and the globe does not move.** Until
    2026-09-21 the earth stepped back as the sheet rose: the resting disc was
    scaled into the band left above the open sheet by a transform inside the
    canvas (`MiniGlobe.canvasTransform` — a view transform scales pixels, and
    cut a zoomed globe at the canvas's edge), with the projection carried past
    the screen (`grownReach`) so the shrink had ground to uncover. Every frame
    of the sheet's travel replayed every picture on the globe on the UI
    thread; the user found opening a story slow and asked for the sheet to
    open on top instead. The sheet is opaque, so the globe draws nothing while
    it moves. What that costs is the story's place: on most phones it sits
    under the open sheet, and the strip of earth above is the top of the disc.
    The gesture layer is tap-to-collapse there, so a touch puts the story down
    rather than turning the earth out from under it. Do not bring the shrink
    back to show the place. Its remains — `grownGlobeTransform`, `grownReach`
    and the globe's never-passed `canvasTransform`/`canvasReach` props, still
    looped over in the beacon's per-frame style — went on 2026-10-02.
  - **The globe slides up with the sheet, so the place stays in sight**
    (2026-09-23, `globeLiftStyle` in `app/index.tsx`). A *view* translate of
    the globe layer, `storyCenterY − centerY` times the sheet's progress: the
    story's place, drawn at the resting centre, ends in the middle of the band
    above the open sheet. The canvas is a `TextureView` on Android, so the
    compositor moves it and nothing reprojects or replays. On the emulator
    three open/close cycles measured the same with and without it (131 vs
    140 frames, p50 48 vs 44–48 ms, p90 81 ms both) — confirm on hardware.
    Taps there only collapse the story, so hit-testing never sees the offset.
    Before it, New Delhi sat under the sheet while the band showed Kazakhstan.
  - **Nothing clamps.** A long hook runs on under the dock at peek and scrolls
    when grown. A card that stops being current scrolls back to its top.
  - **The deck and the sheet never share a drag.** The deck's pan claims at
    16pt horizontal and fails at 12pt vertical; the sheet's claims at 8pt
    vertical and fails at 24pt horizontal; neither is `simultaneousWith` the
    other. A grown card's own scroll runs alongside the sheet's pan (rule 2).
    The new index is committed when the finger lifts, not in the spring's
    completion callback — `scheduleOnRN` from an animation callback aborted
    the app once.
  - **The dock is where you are in the day, under the thumb.** `StoryDock`,
    pinned to the screen's foot and not to the sheet, so it does not move
    between rest and open: `[track]`, with `‹ 3 new` floating over its left
    end — never in the row, where it took the track's width and re-laid the
    whole day under a scrub's finger (2026-09-24). The
    track is a segmented bar — one segment per story — and a scrubber: drag
    to preview, lift or tap to jump (`goToStory`).
    - **Where you are is a white playhead, and it is what the finger picks
      up** (2026-09-24, the user's report: height was confusing and their
      place hard to find). The story in front used to be its own cell raised
      in its hue, beside tall cells that rise for the most reported stories,
      so height meant two things and a teal 400-report cell out-shouted the
      reader's place. Now a stem-and-head playhead in `textEmphasis` marks
      it, and height means reports only. It is **one** view riding
      `fraction` on the UI thread — the finger under a scrub, the deck's
      position otherwise — and a drop sends it straight to the chosen
      story's centre. A second, React-placed playhead parked at the committed
      story made every drop go back and forth twice: it faded in at the story
      being left before the commit reached React, then slid over.
    - **The left end says `now`.** Without it `6h` read as a clock time and
      nothing said which end of the day was now. Its gesture, detents and tooltip are
    `hooks/useScrub.ts` + `components/ScrubBar.tsx`, shared with the briefing
    player's scrubber, so the two cannot drift apart.
    - **The track is the day, and the most reported stories stand taller**
      (2026-09-23, the user's request). Now is the left end, a day ago the
      right; each story sits at the time it ran, with a tick and `6h` / `12h`
      / `18h` every six hours inside the row's existing 48pt — no added
      height. `lib/time-track.ts` (tested) gives every story at least 5pt by
      spreading a cycle's burst about its own time, and places the ticks
      through the same mapping so a tick never has an older story on its
      newer side. The finger lands on the nearest story, which can be hours
      from the finger in a quiet stretch — the tooltip says when it ran.
    - **The most reported stories stand taller, and no count is printed**
      (`lib/coverage.ts`, tested). A story whose `eventCoverage` — the news
      API's event-cluster article count — is 400 or more gets an 8pt cell on
      the track and leads its run in the river (`compareHeat`). For a day
      (2026-09-23) the kicker and the scrub tooltip also ended in `· 884
      reports`; the user asked for it gone on 2026-09-24. Before the number
      came `most covered`, `widely reported` (unclear), a coloured bar (not
      understood) and `trending` (promises attention rising now, which the
      figure does not measure). If a count returns: unit `reports`, never
      `outlets`/`sources`, and only over the bar. The bar is fixed on
      purpose: ~90th percentile of the corpus, 0–8 a day, zero on a slow
      day — a rank within the day would crown something every day.
    - **The kicker has no dot; its category word is the colour**
      (2026-09-23, the user's request): `ECONOMY · 2H AGO · NEW` with
      `economy` in `categoryText*`. Those are the globe's hues in dark mode
      (all clear AA as 11pt caps) and a deeper step of each on cream, where
      the hues fell to 1.9–3.1:1 (`__tests__/palette.test.ts` holds them
      at AA).
    - **The tooltip says when (2026-09-22, the user's request).** It is the
      story's `5h ago`, at body size (`TIME_SCALE`, tabular, so its fixed
      width holds), over its category in the quiet line. It led with
      `12 of 48` over `politics · 12h ago` in 11pt secondary ink; in a river
      ordered by time, when is what a scrubbing reader is reading for, and
      the position is already the finger's place on the track.
    - **And which story (2026-10-03).** A run's stories share one time, so
      the tooltip read `8h ago · politics` for sixteen stories in a row and
      the finger chose among them blind. The headline sits under the two
      lines, in `captionEmphasis`, two lines held whatever its length so the
      box does not change height under a moving finger (`useScrub`
      `captionFor`, `ScrubTooltip`). The box is `PREVIEW_WIDTH` wide, never
      wider than the track, and solid (`playerBg`, the pill's hairline edge):
      it rests on the card's own title and hook, which `toastBg` let through
      behind a second headline. When still leads, at its size. The briefing's
      scrubber passes no caption and keeps its small tooltip. `‹ 3 new` steps
      aside while a finger holds the track (a switch on `holding`, never a
      fade): the box hangs over the track's left end, where the pill is.
    - **A read story is a hairline (2026-09-22, the user's request).** Read is
      `lib/read-store.ts`: two seconds in front of the reader, at rest or
      open (`useReadTracking`, `READ_DWELL_MS` — it was 15 s of the *open*
      story, which would have left a morning of reading at rest looking
      unread). A read segment drops to 1pt and a far quieter step of its hue
      (`READ_MIX`); unread segments keep the 3pt bar near full hue. Shape as
      well as colour, so it does not rest on hue. It replaced a position
      fill — everything left of the story in front a step quieter — which
      called a story read because the reader was past it: arrivals at the
      head, and every story a scrub jumped over, looked read. `ScrubBar`
      draws no fill for the dock now; the briefing's scrubber keeps one.
      **Past 60 stories the cells touch; they never merge into one bar**
      (`lib/scrub-segments.ts`, tested). A day runs to ~65 stories, and the
      track used to go continuous there — a plain rule-ink line that dropped
      every hue and every hairline on most days.
    - **The swipe is the way through; the dock has no buttons (2026-09-22,
      the user's request).** It ended in two 40pt circles until then: `⌃`
      opened and closed the story, and `›` was `StoryDeck.step(1)`. Both
      duplicated a gesture the sheet already answers — sideways on the card
      is the next story, up is read, down (or a tap on the globe) puts the
      story back — so they went, and the track runs the full width. Do not
      bring a next or open button back without asking. Screen readers lose
      nothing: the card's `next story` / `previous story` actions still call
      `step(±1)`, and the sheet's handle is adjustable (expand / collapse).
      The `masthead` hint teaches only `▶` now, and the `swipe` hint no longer
      says "or tap ›".
    - `▶` was the dock's first circle until 2026-09-21, when it moved to the
      top bar beside the menu. The circles had been three different
      treatments before the user asked for one shape.
    - It was the sheet's masthead until 2026-09-19 — on top of the card, so
      mid-screen at rest and near the top with a story open, out of reach of
      the thumb holding the phone. The user asked for the app to be driven
      from the bottom-right corner.
    - It briefly read `3 of 48 · 12 found ━━ all news ›` (the position twice,
      the found count a third time beside the globe's ring), and for one build
      led with the listen button against the start of the track — a play
      button touching a progress bar is that bar's play head. At the far end
      of the track it reads as its own control.
    - The deck once carried no position at all, and swiping a day felt like an
      unmarked corridor.
  - **There is no list of every story.** `IndexSheet` was deleted on
    2026-09-14, restored on 2026-09-19 as a headlines list (title + hook,
    by category) behind a `≡` in the dock, and removed again the same day at
    the user's request. The short resting card, the time-ordered track and
    the swipe are the way through the day. Recover it from git rather than
    rewriting it, if it is ever asked for again.
  - **Stories use the full reading width; the next one does not peek.** A
    24pt peek (`DECK_PEEK`) narrowed every paragraph, grown or not, and was
    removed for the full width (`StoryDeck`: slots are one screen apart). The
    track in the dock says there are more. A neighbour swiped in starts at
    `PEEK_OPACITY` (0.4) and comes up to full as it arrives; while a story is
    grown it fades out entirely (`peekFade`).
  - **Quick flicks each count, and a swipe is never a tap** (2026-09-24,
    found swiping on the emulator). A swipe's one-story cap is measured from
    the *committed* story, not from where the finger caught the card: a
    second flick early in the first's landing found the card still nearer the
    story being left and stopped at the one already committed. The card
    follows from the claim's 16pt threshold, not from the claiming event, so
    a swipe whose events arrive in a burst keeps its travel. And the card's
    three open targets (`useTapOnly` in `StoryCard`) count a press only when
    the finger lifted within 10pt of where it went down — a full-width
    `Pressable` fires on any touch that ends inside it, and flicks the pan
    claimed late opened the story, then the share sheet.
    Testing note: `adb shell input swipe` reports zero velocity and bursts its
    events, so it loses swipes a finger would not; use argent's
    `gesture-swipe`.
  - **The end card says `caught up` only when it is true.** A scrub to the
    end skips everything between; with unread new stories behind the reader
    it reads `end of the day · 18 new stories are still unread` (the pill's
    count, `unreadNewBehind`), and the playhead stays on the track's last
    story instead of vanishing.
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
  existed for long-form reading that 450-character stories never need. Before
  it, a list of headlines was the sheet's front door, and a list-first index
  had already been tried once (740478ba, a branch) and abandoned for
  swipe-first news. Considered and rejected at the same time: a story stage
  under the strip with vertical swipes and the globe below it (it inverted
  where the thumb is), and a reticle at the globe's centre that picks the
  nearest story (exploring the globe would swap the card being read).
- **Android's back puts a grown story down before it leaves the app.** The
  map is the root screen, so without `useHardwareBack` on the full detent the
  key a reader uses to get back down to the globe closed zuhd.
- **A card's chart can be read off, and draws what its chip and its analysis
  refer to.** `scrubbable={false}` was right while cards were pages — the
  scrubber ate five page swipes in a row — and wrong once a card became a sheet
  whose only gesture is vertical: the most-reached chart in the app could not be
  read. `CardTrend` (`lib/cards/card-chart.ts`, tested) also draws the value the
  chip's window opened on (`since Jul 24`) as a dashed rule, and the stories the
  desk cited (`card.cited`, from `/api/analysis.json` or the strait's ranked
  list) as numbered dots that match the `in the news` rows under the analysis (dots on neighbouring days share one
  label, `3 · 1 · 2`; printed apart, a `3` beside a `1` read as 31). A
  readout prints the source's precision (`dataDecimals`, the web chart's rule),
  not one decimal. `EntitySheet` uses the same chip grammar (`indicatorMove`)
  instead of a one-step `vs prev`.
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
- **The old bottom bar's three pills each went somewhere specific.**
  `listen` is `▶` in the top bar, beside the menu — as a corner pill over the
  globe it was sized to stay out of the way and was not found, it spent a few
  builds at the right of `MapHeader` before, at the start of the masthead's
  track it read as that track's play head, and it was a circle in the dock
  until 2026-09-21, when the user asked for it back at the top. While the
  player bar is up it hangs under the top bar, and `▶` hides. `share` is a word on the open card,
  where it can only mean the story it sits under (it used to share the last
  article read from any section). `zoom` is gone from the chrome: pinch on the globe
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
  timeless; `recent` says what has happened to it and why, rewritten daily on
  the 05:00 UTC cycle (04:00 until 2026-09-25) against the fortnight's coverage and grounded in it. Every card
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
- **A move is green up, red down, slate unmoved — everywhere** (`moveTone`,
  `lib/valence.ts`; 2026-09-25, the user's request, tested). The chip, the
  strip, the menu's lists, the globe's arrows and a strait's traffic sign all
  follow it; a contract's points stay slate (odds are never tinted). Until
  then the colour said what a move *meant* for an ordinary life — oil up red,
  a currency up green, bitcoin slate — so one ▲ came in three colours for a
  reason only a sentence at the top of the markets list gave, beside globe
  arrows that were green up and red down all along. The user's rule: the
  screen should explain itself by looking. What a move means is the card's
  prose to say. How bad a strait's fall is, is its glyph's to say (the pinch).
  **Do not bring colour-as-consequence back** without the user: a table
  (`RISE_MEANS`) declared what a rise in each published series did to a
  reader and `valenceOf` applied it, so a fall in oil was green and bitcoin
  was slate on purpose. It was careful and nobody could see the rule. The
  table, `riseMeansFor`, `valenceOf` and the `valence` every `CardDelta`
  carried were removed the same day (history before 2026-09-25 if they are
  ever wanted); a strait's pinch is `straitSqueezed`.
  - **One module still answers the colour, and that part stays.** It was
    four answers once and three of them disagreed — a card chip in
    sage/rose, `EntitySheet` tinting on *magnitude* in dome gold, and
    `ChokepointSheet` calling a strait disrupted at 15% where `markets.ts`
    said 10%. Nothing in any of those files mentioned the others. A second
    colour rule anywhere is the regression.
  - **Slate is a colour, not an absence.** An unmoved reading and a
    contract's points are slate, never the near-white of the label beside
    them: that is how two thirds of the readings once looked uncoloured,
    and the reader's first question was whether a chip was coloured at all.
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

- **No `localeCompare` (or any `Intl`/`toLocale*` call) in per-frame code.**
  On Android Hermes it goes through ICU: `layoutMarketClusters` sorted by it on
  every reprojection, and it was the single largest JS cost of a 19 s map
  session (174 ms, 2026-09-22). Compare with `<`. A time in a zone goes
  through one cached `Intl.DateTimeFormat` per zone (`formatLocalTime`):
  `toLocaleTimeString` builds a formatter per call, ~9 ms each on Android,
  and it ran inside swipe landings.
- **What changes on a landing or a read re-renders only what shows it**
  (2026-09-22, dev-build commits on the emulator). The read store is
  subscribed in `StoryDock`, not `HomeScreen` (a read re-rendered the screen,
  the sheet and the header: 127–141 ms → ~55 ms); the screen takes only the
  `fresh` set (`useFreshSlugs`), so `markLanded` no longer re-renders it a
  second time after each landing; the track's cells are a memoized `Segment`
  on primitives, so a read re-renders one cell, not ~42. A new card mounts
  `sources · save · share` when JS is next idle (`requestIdleCallback`) and
  its veil is a view's own `experimental_backgroundImage` gradient, not a Skia
  canvas — together about 15% off the median landing commit.
- **Opening and closing the story re-renders only what shows it**
  (2026-09-24, profiled on the emulator, dev build). Only the card in front
  takes `open` (`renderStory`: `storyOpen && index === frontIndex`); handed to
  all three mounted cards, every open and close re-rendered the two off-screen
  neighbours. And the globe's gestures take `enabled` as a `SharedValue`
  (`GlobeGestureLayer`): as a boolean in their configs, every open and close
  changed three config identities and RNGH pushed each to the native side
  whole (`setGestureHandlerConfig`, 23 ms of one open's commit). Measured:
  1,645 → 1,258 fibers over the same eight gestures. The commit's wall time
  sits inside the emulator's run-to-run spread (39–91 ms), so judge it on
  hardware. Still open: Reanimated's `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS`
  static flag (native rebuild, so a `runtimeVersion` bump and a store build).
- **An inline object prop on `<MiniGlobe>` re-renders the globe.** The
  compiler caches it with the whole element, so it is rebuilt whenever that
  block is. `marketViewport` did this on every swipe landing; key such props
  with `useMemo` on their numbers.
- **The canvas is its own memoized component (`GlobeCanvas`), and must stay
  one** (2026-09-25). It was the tail of `MiniGlobe`'s render, and Skia's
  reconciler answers any commit under `<Canvas>` by redrawing the whole scene
  on the JS thread (`resetAfterCommit` → `redraw`), reading every picture and
  warp through `runOnUISync` — so every globe render (a find, a gauge's
  ring, an arrival's layers) paid a JS redraw that waited on a UI thread busy
  with the burst or spring that caused it. `MiniGlobe` itself is not
  compiled. Everything the canvas draws reaches it as shared values; its
  props are the layout, the ring's colours and whether there is a ring.
- **The screen reads the network as one boolean** (`hooks/useOffline.ts`,
  2026-09-25). `useNetworkState` stores a new object on every native event,
  and Android emits one per capability change (bandwidth, signal,
  validation), so the whole map screen re-rendered on a phone walking between
  cells, for an error message it shows only when the feed failed.
- **JS never reads the zoom override to redraw** (2026-09-25). The effect
  that redraws the globe for new inputs read `overrideActive.value` /
  `overrideAngle.value`, which waits on the UI thread whenever it has written
  them: 44 ms of a story open's commit (the find), on the emulator, in the
  middle of the sheet's spring. It replays the last frame instead
  (`lastReprojRef`: its `oA`, `oG` and tier, `moving`). Forcing the settled
  tier there had also drawn the resting geometry mid-spring whenever a
  landing found a story. `finalizeReproject` still reads them live: it runs
  after motion has stopped, to catch the values the last frame missed.
- **The globe's redraw throttle has a trailing edge** (`MiniGlobe` `retick`,
  2026-10-03, the user's report: after dragging the globe the map stayed at
  the coarse motion tier about half the time). The reaction that publishes a
  projection runs once per display frame, and only on a frame in which
  something it reads changed. Two things followed. A change skipped inside
  the 32 ms window was dropped for good if it was the last one — a finger
  lifting, a glide ending, a flight to a gauge. And the redraw at full detail
  was asked for by the run that saw the last projection finish
  (`previous.busy`), which a projection that starts and finishes inside one
  frame never shows. So the detail came back only when the last coarse frame
  took longer than a frame to project: always on the emulator's dev build,
  where this was written, and a coin flip on a fast phone — more often
  missed with every speed-up to the projection. A skipped run now asks for
  the next frame's by writing a value the reaction reads; it polls only
  inside the window and nothing runs at rest. A story swipe's landing never
  depended on this (`drawLanding`, and the exact landing passes the
  throttle). Two things keep the trailing run from costing a landing a
  second projection: a flight's landing frame records the framing as its
  angle, and a landing stays marked drawn while the deck rests on it.
  **Unmeasured on a device**: the cause is read from the code and the
  library's scheduler, not reproduced. Check it by dragging the globe on a
  release build, and count frames at rest (`gfxinfo`) to confirm the poll
  stops.
- **The deck recycles its three slots** (`lib/deck-slots.ts`, tested;
  2026-09-25). Keyed by slug, every landing unmounted one card and mounted
  another — scroll view, native gesture, animated style, scroll handler and a
  card of views, set up on the JS thread and created on the UI thread as the
  spring settled — and a jump (a mark, the scrubber, `‹ n new`) mounted
  three. Keyed by slot, a story keeps its slot while it stays in the window,
  so the card being read keeps its scroll through an arrival, and a story
  entering takes the slot one leaving gave up. Across the swipe bench
  (`.argent/flows/deck-swipe-grow-bench.yaml`) component mounts fell from
  455–479 to 89, and the idle commit that mounted each new card's
  `sources · save · share` is gone (the actions carry over). A slot handed a
  new story scrolls to its top. Count mounts, not milliseconds, when A/B-ing
  this on a loaded host: the commit files' `isFirstMount` is deterministic.

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
- **A recorded frame allocates as little as it can, and nothing that moves
  goes through React.** Glow gradients are cached in unit space by their
  stops (`glowShader`) and placed by the canvas transform, rather than built
  per glow per frame; the found burst's colour is a shared value, not state;
  lakes and resting rivers are settled-frame work. A chart's scrub readout is
  its own component (`ScrubReadout`), so a step along the line re-renders the
  number and not the block, and its scrub stops are one path. None of this is
  measured on hardware yet — judge it there before building on it.
- **At rest the app renders zero frames, and two shapes break that silently.**
  Neither shows in a React profile. Check with `dumpsys gfxinfo news.zuhd.app
  reset`, then read "Total frames rendered" after 5 s untouched, beside a
  screenshot, because a JS error also renders nothing.
  - **Never use Skia's `usePathValue`.** It writes its path and reads it back
    (`notifyChange`) in one derived value, so it subscribes to itself and runs
    every frame forever. Each run re-played the whole globe canvas on the UI
    thread: 23 frames in 5 s and 74% main-thread CPU with nothing moving (0 and
    6% after). Use `useDerivedValue` returning a built path, as `ringPath` does.
  - **A `useAnimatedStyle` updater runs once on the JS thread when it mounts.**
    A JS read of a shared value the UI thread has changed blocks on
    `runOnUISync` until the UI thread answers. `DeckSlot` mounts as a swipe
    lands, mid-spring, so that read was 150–290 ms of each landing's commit on
    the emulator (landings 1,166 → 578 ms in total). An updater for something
    that mounts while its inputs animate returns a style computed from props
    when `globalThis.__RUNTIME_KIND === 1`, and keeps those props out of its
    dependency list.
- **What moves with the sheet costs a native update per frame on iOS, and
  three shapes make it cost more than they show** (2026-10-03, found when
  opening a story lagged on an iPhone Pro and never on the emulator). On iOS
  Reanimated commits the shadow tree for every animated frame
  (`IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` is off; turning it on needs RNGH
  `Pressable`s, breaks `Text` links in moving views, and needs Reanimated
  built from source on SDK 57). Keep the per-frame set to what visibly moves:
  - **No opacity between 0 and 1 on a view with children.** iOS draws it off
    screen as a group every such frame; Android and the emulator's host GPU
    hide the cost. Fade a leaf instead — a plain `sheetBg` view over the
    content is the same picture over a solid sheet (`DeckSlot`'s dimming) —
    or switch 0/1 at the motion's true end, not near it (`StoryCard`'s veil:
    within 1% of rest it popped in mid-crawl). Never animate opacity on a view with
    `experimental_backgroundImage`: any change rebuilds its gradient layers.
  - **A `transform` array defeats the diff.** Reanimated skips an update only
    when every value is `===` the last, and a fresh array never is, so a
    style returning one is re-sent each time its mapper runs. Keep a
    transform in a style whose inputs change only when it does.
  - **No layout props per frame** (`top`, `bottom`, `height`): each re-runs
    layout. Snap to the stops when only the stops matter
    (`GlobeGestureLayer`'s bounds).
- **Reduce Motion is Reanimated's by default** (`ReduceMotion.System` on every
  animation and layout builder: it jumps to the end). Don't add
  `useReducedMotion()` branches for Reanimated animations; spread `KEEP_MOTION`
  into the few that must not snap (a spring released from a finger, the tap
  ring's fade). Every spring states its `mass` or `duration`/`dampingRatio` —
  Reanimated 4 defaults a missing mass to 4 (`DESIGN.md` §Motion). Check battery
  saver before changing timings.
- React Compiler has been **enabled app-wide since 2026-07-24**
  (`app.json` → `experiments.reactCompiler: true`, commit `9227e99b`) — flows
  CLI → Metro `customTransformOptions.reactCompiler` → babel caller
  `supportsReactCompiler` → `babel-preset-expo`. Verify live status with
  `react-profiler-analyze`: compiled components show a `Forget(...)` wrapper
  name in the render cascade (`react-profiler-stop`'s own
  `any_compiler_optimized` flag is unreliable — it reflects only the fibers a
  given capture happened to touch, not whole-app status).
  Consequence: for a component the compiler actually compiles, new manual
  `memo`/`useMemo`/`useCallback` for perf is usually redundant — check
  `Forget(...)` before adding any. But **not every component compiles**: a
  function with a ref write during render, a `try/finally`, or other
  compiler-unsupported shapes silently bails out of the whole function, and
  existing manual memoization there is still load-bearing. `HomeScreen`
  (`app/index.tsx`) does not compile — confirmed 2026-10-02 with
  `babel-plugin-react-compiler` 1.0: a `try/finally` in `handleRefresh` and a
  `??=` stop it before the compiler reaches the refs it writes in the render
  body (`sheetOpenRef`, `notificationsOnRef` and others), which bail it too.
  `MiniGlobe` carries a `'use no memo'` directive as the **first statement of
  its body** for the same class of reason: it relies on several
  deliberately-stale `useCallback(..., [])` closures in its reprojection hot
  path (`callReproject` etc., `biome-ignore`-marked) that the compiler is
  documented to rewrite given the chance. The directive sat after the file's
  imports until 2026-10-02, which is no directive position: the formatter
  wrapped it in parentheses and it opted nothing out — a probe component in
  that shape compiles — so `MiniGlobe` escaped only by bailing on other
  shapes, and `GlobeCanvas` and `useGlowTexture` in the same file were (and
  are) compiled. `__tests__/directives.test.ts` fails on any string statement
  outside a directive position, which also covers a slipped `'worklet'`. To
  see what compiles, run the plugin with a `logger` and read its
  `CompileSuccess` / `CompileError` / `CompileSkip` events — note that an
  opted-out function is still attempted, so a body that cannot compile logs
  `CompileError` with or without its directive.
