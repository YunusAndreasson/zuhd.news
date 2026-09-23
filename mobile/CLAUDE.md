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
  day's most reported story when there is a lead, else the newest — not on
  the top instrument: at rest the card and the globe have to agree.
- **The sheet is for news; the strip is for instruments.** `buildNowSurfaces`
  (`lib/now.ts`) builds both in one pass. The sheet's NOW block used to hold
  instruments a builder marked `lead`; once the strip held every reading that
  moved, what was left there was contracts and dates sitting above the stories
  as though they were stories, so NOW holds only live Red GDACS alerts — news
  with no article yet, whose globe mark needs an accessible row. It holds no
  stories and no conflict events (UCDP publishes months in arrears, and NOW
  over a March event is a false claim). **Alerts never enter the deck**: the
  camera track is stories only. They reach the reader as the dock's line in
  place of the story track (`now · …`, which opens the alert). A contract
  reaches the sheet the one honest way: as the odds on the story it settles.
- **The strip scrolls sideways and holds the ten readings that moved most this
  week, largest move first.** It was three fixed slots, and the reader asked for
  all the markets, straits and currencies in one swipe, sorted so the most
  dramatic change sits at the left; at twenty-odd slots it became a ticker, and
  the user asked for ten (2026-09-23, `STRIP_SLOTS`). The rest are behind
  `all →`. Only the row is cut: `strip` keeps every mover, because a gauge
  opened from the instruments list or a strait tapped on the globe still looks
  itself up there to fly and ring its place.
  - **Every slot is the same seven days** (`gaugeMove`, `lib/cards/week-move.ts`,
    tested), with the week's line under it (`Sparkline`). The strip used to sort
    each card's own delta with its window hidden: a strait's gap from its 90-day
    normal beside an index's four sessions beside a currency's whole series — one
    sort over three quantities, printed as though they were one. The card keeps
    its own window and prints it; `InstrumentsSheet` rows read like their gauge.
  - Calendar days, not observations, read off the period labels (`Sep 7`); a
    month label is a monthly series, which has no week and stays in the list. A
    currency's week is the currency's (`currencyMove`), a strait's is its
    seven-day average against the one before, coloured by `chokepointValence`.
  - The slot whose card is open is marked and the globe rings its place
    (`MiniGlobe.selectedAt`, a position, since a strait's card id is not its
    mark's id). An exchange mark's colour still follows its card's own chip.
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
  conditional, `menu → markets` opens the same browser, and `InstrumentsSheet` lists every card in `buildRankedInstruments`
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
- **The river is in time order, and what arrived says so** (2026-09-21, the
  user's request). `orderNewsRiver` sorts every story newest first by the
  dateline's time, whatever its category. It was four category bands, newest
  first within each, so the track could be scrubbed to a category by colour —
  and the day's newest stories sat in four places, one at the head of each
  band, and a reader coming back could not tell whether anything had arrived.
  - **The day's top stories lead it** (2026-09-23, the user's request: top
    news at the top, as Apple News and Google News open). `leadWithTopStories`
    (`lib/news-order.ts`, tested) moves up to `TOP_STORIES` (5) stories over
    the report bar (`isMostCovered`, 400), inside the day, to the front, most
    reported first; everything else stays newest first behind them. It is a
    short lead and not a sort on purpose: three in five stories carry no
    count and could never rise, and a sorted river would send the track's
    marker all over the day on every swipe. On a quiet day there is no lead
    and the river is plain time order. The track places each story by its
    own time whatever its river position (`timeTrackLayout` sorts, then hands
    back river order), so the first swipes hop to the top stories' times and
    the rest run through the day; `buildStoryRows` looks for the `earlier`
    boundary after the lead (`lead`), since the lead is out of time order.
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
    `· 884 reports` follows them for the same reason. The track has no mark for
    new: a 2pt rule over new stories' segments shipped on 2026-09-21 and was
    removed the next day at the user's request — a second row of dashes over
    the colours that added nothing the kicker and the pill did not already
    say. Do not bring it back. And when new stories the reader has not *read* sit
    behind the one in front — a resume or pull put them ahead of where they
    were reading, or a scrub or a quick swipe skipped them — `‹ 3 new` leads
    the dock and jumps to the newest of them. New stories still *ahead* of the
    reader are not counted: they will reach them. Read is the track's rule
    (`read-store`, two seconds in front); the pill counted any story merely
    landed on until 2026-09-22, so a new story swiped past in a second stayed
    bold on the track while the pill said nothing was left.
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
    its tier decodes (`geography.ts`); a frame is a 3×3 rotation, one compare
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
- **The menu and the briefing are the controls at the top.** Markets,
  search, saved, settings, the map key and the pages open from the menu
  (three lines) at the top right, out of thumb reach on purpose — it is
  opened a few times a week, and the top corner is where both platforms put
  a destination that rare. It was a cog until 2026-09-19; a cog promises
  only settings, and the top left, where a hamburger usually goes, is where
  the gauges start. (A `Z` home mark sat top left until 548457c8 removed it.)
  - **`▶` sits beside it and `markets` moved into it (2026-09-21, the user's
    request).** `markets` was a word between the gauges and the menu; it is
    the menu's first row now, and opens the browser the strip's `all →`
    opens. `▶` came up from the dock. Both are bare 20pt glyphs in one
    `HeaderControl` box — one width, one height, one `GAUGE_EXTRA` nudge, the
    glyph centred in one square — so they line up exactly by construction;
    the user asked for exact vertical alignment, and a style on one of them
    alone is how that breaks. A paused briefing draws its heard arc round
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
  strip, the story cards or the instruments sheet; that is the accessible path,
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
  `checking for new stories` while it runs. A refresh that inserts stories in
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
  slug, with a 250 ms `LinearTransition` (`ScrubBar` `cellKeys`), and the raised
  cell is placed by `left` so it moves with its own cell.
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
  `sources · save · share` as words after the text — risen over the globe,
  which stays where it is, and with the strip still in place (it used to recede;
  it never covered the story, so hiding it only took the markets away). Nothing mounts or reflows when
  it grows: every sentence after the hook is laid out all along under a
  `Veil` — the
  sheet's ground over them, the first line at half strength fading to
  nothing by the second, which the user preferred to blank space as the sign
  that the card opens. It lifts with the sheet's `progress` (computing its
  first style from `open`, because the card mounts as a swipe lands), a tap
  on it opens the story, and the rest takes no touches and is hidden from
  screen readers until the sheet settles open.
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

    **Scrolling an open story is the norm, not the exception, and that is a
    2026-09-20 decision rather than a discovery.** The article budget rose to
    480/560 characters and every block went back to being its own paragraph;
    together those put a typical story about 5 lines past the cap on a
    393×852 phone, measured. The alternative was a shorter story or a smaller
    globe, and the user chose the scroll on the grounds that nothing above the
    prose moves with it — the globe and the dock's track are both outside
    the scrolling area. Two things follow that were true of an
    exception and are not true of a norm: `showsVerticalScrollIndicator` is
    off, so nothing says there is more below, and `sources · save · share`
    sits at the end of the card, which means below the fold on most stories. It used to stop
    at each story's own height (`contentHeight`), and a swipe while reading
    re-sprang the sheet *and* rescaled the globe — the text jumped by three or
    four lines on every story, which the user asked to have gone. Do not
    bring the per-story stop back. Sized for the longest story it left four
    or five blank lines under a typical one, which the user also flagged; the
    spare space now sits after `sources · save · share`, at the end of the
    story, rather than between the text and buttons pinned to the dock.
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
    back to show the place.
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
    between rest and open: `(‹ 3 new) [track]`. The
    track is a segmented bar — one segment per story, the one on the card
    raised in its full hue — and a scrubber: drag to preview, lift or tap to
    jump (`goToStory`). Its gesture, detents and tooltip are
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
    - **The report count is the one claim about reach** (`lib/coverage.ts`,
      tested). A story whose `eventCoverage` — the news API's event-cluster
      article count — is 400 or more gets an 8pt cell on the track, `· 884
      reports` at the end of its kicker in the `new` ink step, and the same
      words in the scrub tooltip. Only those stories print a count: about
      three in five carry no figure (RSS origin), and a count on some
      kickers and not others would make theirs read as zero. The unit is
      `reports` — articles counted, syndication included — never `outlets`
      or `sources`, which the data cannot support; and it is the figure when
      the pipeline picked the story, not a live one. The bar is fixed on
      purpose: ~90th percentile of the corpus, 0–8 a day, zero on a slow
      day — a rank within the day would crown something every day. Worked
      through with the user on 2026-09-23: `widely reported` read as
      unclear, a coloured bar beside the kicker was not understood (no news
      app marks reach with a shape — Jakob's law), `trending` promises
      attention rising now, which the figure does not measure, and `most
      covered` gave way to the number, which the user asked for as more
      specific.
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
- **An inline object prop on `<MiniGlobe>` re-renders the globe.** The
  compiler caches it with the whole element, so it is rebuilt whenever that
  block is, and every globe render also makes Skia redraw on the JS thread,
  reading each shared value through `runOnUISync` (~30 ms a render in dev).
  `marketViewport` did this on every swipe landing; key such props with
  `useMemo` on their numbers.

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
  existing manual memoization there is still load-bearing (`app/index.tsx`
  writes several refs directly in the render body — `sheetOpenRef`,
  `notificationsOnRef`, and others — which was the *documented* reason it
  bailed out when the compiler was enabled; unconfirmed whether that's still
  true today). `components/globe/MiniGlobe.tsx` carries a `'use no memo'`
  directive at the top of the file for the same class of reason: it relies on
  several deliberately-stale `useCallback(..., [])` closures in its
  reprojection hot path (`callReproject` etc., `biome-ignore`-marked) that the
  compiler is documented to rewrite given the chance.
