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

## The two axes

Horizontal swipe = section (`news` · `commodities` · `money` · `outlook`), vertical
paging = item inside one. `SectionBar` follows the pager and draws a rule after
`news`.

- **Every column is an index, and a row opens the detail.** One model, four
  columns: `NewsIndex` → `ArticleList`, and `ColumnIndex` → `CardPager` on the
  other three. `openItem` in `app/index.tsx` is the whole of it — `{section,
  key}` or null — and a section change clears it, so a column is always
  re-entered through its own front door.
  - **`news` was the exception for one commit and it was the wrong one.** The
    three instrument columns got an index; the column a reader actually lands
    on kept a forty-three-page river with no way to see past page one. The
    question they arrive with — what is going on this morning — cost forty-odd
    swipes and forty-odd readings, when the headline, the desk, the age and the
    place were all already written and all already on the row. An app that
    teaches one navigation model on three of its four columns cannot ask for a
    second on the fourth.
  - **Nothing about the river changed.** It is what a row opens: the globe, the
    isnad, the sources sheet, the entity links, the bookmark gesture, the
    caught-up boundary, all untouched. What it stopped being is the front door.
  - **A detail opens at its own page zero, so nothing needs seeding.** Both
    detail views slice their list from the item that was tapped, which is what
    makes the pull-down free (see below). The scroll offset a detail opens at
    is therefore zero, and the trap `useScrollState`'s header describes — a
    page whose scroll-linked arrival opacity computes as if it were twelve
    pages away, and paints invisible — cannot arise. Seeding existed to
    compensate for a condition the slice removes.
  - **`NewsIndex` is a `ScrollView`, and that is the opposite call to the one
    virtualisation suggests.** A `FlatList` cannot restore its own scroll
    position: `scrollToOffset` moves a view only as tall as
    `initialNumToRender` has made it, so returning from the twentieth headline
    landed on the eighth, silently clamped — which reads as a bug, not a
    restore. (`contentOffset`, the prop that sets a starting position, is
    iOS-only.) The feed is capped by the API at thirteen articles a category
    across four, so the ceiling is ~43 rows of two `Text`s — a cheaper mount
    than the six Skia sparklines `ColumnIndex` already renders eagerly, and it
    buys a content height that is right in the first layout pass. The restore
    itself hangs off `onContentSizeChange` with a latch, not off mount, for
    the same reason: a scroll to an offset the content has not reached yet is
    clamped silently.
  - **The offset outlives the component** — `NewsIndex.scrollOffset`, a shared
    value owned by `HomeScreen`. Every list in the medium restores its place;
    this one is not special, and a reader who taps the twentieth headline and
    comes back to the first will stop using the list. It is belt-and-braces
    now that the index stays mounted behind the sheet and keeps its position
    natively, and worth keeping for exactly that reason: it is the thing that
    still works if the index ever goes back to unmounting.
  - **The bottom bar's `articleActions` is not "the section is news" any more.**
    `zoom` drives the globe and `share` shares the article on screen, and the
    news index has neither — so it is `openItem?.section === 'news'`. The
    scrim under the pills is gated on the same flag and therefore turns itself
    on over the headline list, which is what the scrim was written for.
  - **The way out is one component.** `BackToIndexButton`, with `CLOSE_SIZE`,
    because two detail views now draw one and the header of each has to keep
    clear of it. It was a style block in `CardPager` and a constant in
    `CardFrame`; a second copy is how the two would have stopped agreeing.
  - **…and it is also in the bar, because the corner is unreachable.** A 34pt
    target in the page's top-right is the least reachable point on a phone
    held in one hand — a right thumb sweeps an arc from the bottom-right and
    does not get near it without regripping. Android readers had an undisclosed
    way round it (the system back gesture from the screen edge, which does
    close a detail); iOS readers had none, because nothing here is a navigator
    with an interactive pop. `close` is the last pill in `BottomActionBar`
    whenever `openItem` is set, which is where the thumb already is. The corner
    control stays rather than moving: it is the conventional place to look, it
    is what a two-handed or left-handed reader reaches first, and it is the
    only one still on screen while the briefing player owns the bar's row.
    Both announce `Back to the list` — a `BACK_LABEL` const, not a prop,
    because the moment a call site could rename its own they disagreed and a
    screen reader read one action twice under two names.
  - **Pull down to close, and the detail opens at its own page zero so that it
    can.** A downward drag is vertical paging, so the only place it is free is
    the top of the list — which used not to be where anyone stood, because a
    detail opened at whatever page had been tapped. So `ArticleList` slices
    from `entrySlug` and `CardPager` from `entryId`: arrival and "the top" are
    the same place, and the pull is free at exactly the moment a reader wants
    it. Down stays honest all the way — page one pulls back to page zero, page
    zero pulls out to the list — so nothing has to be explained. The cost is
    swiping back *earlier* than the story you opened, and the index answers
    that better: one pull away, and it remembers where you were.
    - **The keys are a slug and a card id, never an index.** A refresh
      reorders the river and a gated card shifts every index behind it; the
      slice is recomputed by key on every data change, so the reader stays on
      the thing they opened. `openItem` in `app/index.tsx` carries the key for
      the same reason.
    - **Seeding the scroll offset is gone, and that is a consequence rather
      than a regression.** The entry item is index 0 now, so the offset a
      detail opens at *is* zero — there is no third page whose scroll-linked
      arrival opacity computes as invisible. The slice removed the condition
      instead of compensating for it.
    - **`manualActivation`, and this is the one that took a device to find.**
      The first build used `activeOffsetY`/`failOffsetX` and let the recogniser
      decide, which meant that on a drag it was going to ignore anyway the pan
      still *activated* — and an activating pan cancels the touch stream of the
      views under it. The fifteen-currency card, scrolled down, could no longer
      be scrolled back up: the drag reached nothing at all. Silent, and exactly
      the failure this file spends a page warning about. The decision is made
      in `onTouchesMove` now, where declining costs nothing: not armed → fail,
      sideways → fail (that is `PagerView`'s), upward → fail (that is the next
      story), downward and at rest → activate.
    - **Do not damp the primary drag, and do not measure it in distance
      alone.** Both were wrong in the first tuning and both made the gesture
      feel like hauling. The page followed the finger at *half* its travel
      against a 96pt threshold, so committing took 192pt of real movement — a
      quarter of the screen, dragged, every time. A sheet does not lag its own
      drag: tracking is 1:1 to the commit point and resistance lives only
      *past* it, where resistance is doing the job it is for. And distance
      alone ignores the half of the gesture people actually use — a throw. A
      flick over `FLICK_VELOCITY` closes at any distance beyond a small guard,
      because that is what a hand does when it is putting something down
      rather than placing it.
    - **`manualActivation` re-bases the pan's own `translationY`, and that ate
      the flick.** The zero is set at the moment of activation, so on a
      gesture that is over inside a hundred milliseconds there is almost
      nothing left for the pan to measure: an 82pt throw reached the release
      handler as `translationY: 0` with a velocity of 694. Nothing warned, and
      no amount of lowering the threshold would have fixed it — the movement
      was invisible, not small. The pull is measured from the *touch* now,
      against a `startY` latched at touch-down, which also recovers the
      `ACTIVATE_Y` spent deciding. Found with one `console.log` on a device;
      three rounds of guessing at numbers before that found nothing.
    - **`armed` reads two offsets, not one.** An article longer than the screen
      and a card taller than the page carry their own scroll, and a reader
      dragging down inside one is scrolling back up through their own content.
      `ArticlePage` and `CardFrame` report `innerOffset`; the pager resets it
      on every settle, since a newly-arrived page is at its own top.
    - **`bounces={false}` / `overScrollMode="never"` on both detail lists**, or
      the same movement is drawn twice — and on iOS the two disagree about how
      far.
    - **Pull-to-refresh left the river with it, and belongs gone.** It lived at
      exactly this offset, so the two were the same drag on the same pixel.
      `NewsIndex` carries refresh, which is where a reader looks for it: the
      list is the surface that gains new stories; an open article is not.
    - **A gesture with no signifier is a secret.** The first version shipped
      the pull with nothing on screen to suggest it, which is Norman's
      distinction exactly: the affordance existed and the *signifier* did not,
      so the only readers who would ever find it are the ones who tried by
      accident. Three things say it now, and each is the one every card-dismiss
      a reader already uses says it with — `PullHandle` (the same 36×4 bar the
      app's sheets draw), `RADIUS.sheet` on the detail's top corners, and the
      page shrinking as it is pulled. An object getting smaller is an object
      going away; that shrink is what separates *dismissing* from *scrolling*.
    - **The handle does not borrow the sheet's ink, and that is deliberate.**
      `SheetHandle` draws in `colors.rule` and gets away with it because a
      sheet is a lighter surface with its own edge and a system animation that
      has just played. This bar sits on `colors.bg`, where `rule` (#2e2e2e on
      #0F0F11) measured invisible on a device — which for the app's only signal
      that a detail is dismissible is the same as not drawing it. Shape and
      size stay identical; only the ink is `textSecondary`.
    - **Every feedback channel reports the same fact: what releasing will do.**
      The handle brightens and stretches, the page reaches its smallest, the
      backdrop comes fully forward and the haptic ticks — all keyed to
      `CLOSE_DISTANCE`, all at the same moment. One number, exported from
      `usePullToClose`, because two copies would let the bar say "committed" at
      a distance that does not commit.
    - **The index stays mounted behind the sheet, and that is what makes it a
      modal rather than a page that shrinks.** `SheetStage` settles the column
      back to 0.94 and dims it while a detail is presented, and the pull walks
      all of it forward again — so a reader can see where they are going before
      they commit to going there. Pulling over an empty background could never
      give them that half.
      - **Mounting both is close to free, and may be cheaper.** The index
        stopped unmounting on open and re-mounting on close; what is paid is
        peak memory, not time. Its scroll position is now preserved natively,
        which makes `NewsIndex.scrollOffset` belt-and-braces rather than the
        only thing holding it.
      - **The sheet needs its own floor.** A detail used to be the only thing
        on its page and could let the screen's colour show through. With the
        index behind it, `usePullToClose.sheetStyle` has to paint `colors.bg`
        or the headline list reads straight through the article.
      - **And the sheet must not fade.** It did, back when what showed through
        was the app background. With a backdrop the same fade renders the list
        *through* the article, which reads as a rendering fault rather than a
        page leaving. No sheet a reader has ever dismissed goes translucent on
        the way out: it moves, it gets smaller, and the thing behind comes
        forward to meet it.
      - **The backdrop takes no touches while presented.** The sliver above
        the sheet is a row of the index, and tapping it would open a second
        detail behind the first.
      - **The detail hands the rail back on unmount.** The index used to reset
        `progressesSV` on its way back in; it never leaves now, so the detail
        has to zero its own slot or the rail keeps showing how far through a
        card the reader got, under a column they are no longer in.
      - **`stageSection` lags `openItem`.** One progress value serves the whole
        screen, so each stage is told whether it is the one holding it — and
        if that flag flipped the instant `openItem` cleared, closing would snap
        the ground forward instead of animating it. Cleared on a JS timer,
        because worklets 0.10.0 aborts the process when `scheduleOnRN` is
        called from a `withTiming` completion callback.

- **The other three columns have a front door, and it is not a card.** A column
  opens as `ColumnIndex` — one `IndicatorRow` per card, six on a normal day, the
  whole column on one screen — and a row tap swaps the page for `CardPager`
  entered at that card. Nothing was cut: every card still carries all five
  parts. What changed is that the question a reader actually arrives with — did
  anything move this morning — used to cost six swipes and six readings per
  column, when the number, its direction and what that direction means were
  already computed and already coloured and were simply arriving underneath four
  paragraphs.
  - **The detail is presented over the index, and this used to say the
    opposite.** The rule was "swapped, never overlaid", on the grounds that an
    overlay would eat the horizontal pan. The fear was right and the diagnosis
    was not: that pan belongs to `PagerView`, whose *page* is what the detail
    fills, and a child cannot take a gesture the page never gave it — which is
    why a swapped detail of exactly these dimensions could always cross
    sections while open. What would eat the pan is an overlay above the pager.
    `SheetStage` is not one, and crossing sections from an open detail is
    re-verified on device. Every gesture that crosses sections still belongs to
    `PagerView`.
  - **A row may print only strings the card already holds.** `lib/cards/row.ts`
    is a pure projection for exactly that reason, and it is tested rather than
    eyeballed. A `toFixed` in a row would let the index and the card it opens
    describe one figure two ways, one tap apart — the `EntitySheet.formatLatest`
    and `ChokepointSheet.formatCount` bug, re-introduced one level up.
  - **Entering at index *n* has to seed the scroll offset.** `CardFrame`'s
    arrival is a *scroll-linked* style off `scrollY`, not a mount animation, so
    a pager opened three pages in with the offset still reading 0 computes that
    card's opacity as if it were three pages away and paints it invisible.
    `useScrollState({ offset, index })` exists for that and for the phantom
    haptic the first settle would otherwise fire.
  - **The right-hand cluster is a fixed width and the sparkline is small.**
    Content-sizing the cluster let each row absorb a different amount of slack,
    so six sparklines started and ended at six different x positions down one
    screen; the web rail pins its own level and move columns for the same
    reason. And a sparkline's amplitude means nothing here — each autoscales to
    its own domain and, unlike the rail, the series in one column do not share a
    calendar window (a strait is 90 days, an FX mover a month, a contract six
    observations). Magnitude belongs to the chip; nothing is ranked on the
    picture.

- **The axis is cut by reader question, not by asset class.** It was six
  sections split the second way and the split is what broke it: `markets` held
  food, energy, rates, shipping, Wikipedia pageviews and a calendar — eight
  cards, three of them not markets by any reading — beside `crypto`, `metals`
  and `currencies` at two or three cards each, all three asking one question.
  Now `commodities` is what things cost, `money` is what your money is worth
  and what borrowing costs, `outlook` is what is not yet a fact. The first two
  take the FT's and Reuters' own word for that ground rather than an invented
  one — `prices`/`money` was the first pair and the two words read as the same
  question. Four labels also *fit* (~330pt all-in against a 360pt phone, where
  six measured past 440 in type alone), so the whole axis is visible at once.
  - The two placements to know, because both look wrong until you know why:
    **VIX is in `outlook`**, since what saved it from the cut that took the S&P
    and the NASDAQ was its *fear* reading, and a price on what traders expect
    is a contract by another name. **Crypto is in `money`**, which is what its
    own first sentence says it is.
- **A card ships because it changed.** Standing conditions (famine, conflict,
  hazards, genocide determinations) were a section until an audit killed it:
  median famine analysis seven months old, conflict window 145 days behind, one
  determination 2,902 days old. They now gate on their own data being new and
  lead `commodities` on the day one is. Apply the same test to anything new — the
  eleven-strait table and the release calendar both failed it later and are now
  gone and gated respectively.
- **A gated card says so, and `lead` is how.** A condition card and a disrupted
  strait are on screen because their data moved this morning; the nisab and the
  gold-to-silver ratio are standing reference that happens to have moved a
  little. They arrived in identical typographic weight, so the distinction was
  one only a reader who already knew the gating could make. `CardFrame` now
  prints `today ·` before the kicker — an ink step, never a colour, because the
  chromatic budget is spent on `CardDelta` and `colors.determination`.
- **The straits are the globe's, not a column's.** `MiniGlobe` draws all eleven
  as tappable rings and `ChokepointSheet` carries the blurb, the standing
  paragraph, what is happening there now, the weather and the series — so a
  flat sorted table of the same eleven names was a worse copy of something the
  reader could already touch. Only `straitMovedCard` survives, gated on
  `CHOKEPOINT_DISRUPTED` and leading `commodities` on the day it fires. Same rule
  for anything else the globe already carries.
- **Nothing may steal the horizontal swipe.** `TrendBlock`'s scrubber ate five
  page swipes in a row before `scrubbable={false}` existed. Cards pass it;
  sheets do not.
- **Nothing may steal the vertical one either, and the fix for that once ate
  the content instead.** A card taller than the page carries an inner
  `ScrollView`. Handing its leftover overscroll up to the pager parks the list
  between two pages — the parent moves having never been dragged, so
  `pagingEnabled`, which only snaps a gesture the list received itself, has
  nothing to snap, and both cards sit at half opacity. The response was to turn
  `nestedScrollEnabled` off. On Android that is the default anyway, which meant
  the parent intercepted *every* vertical drag and the inner scroll never ran
  at all: a card taller than the page did not scroll, it silently truncated.
  Four did it at default type — the Kerch strait, the fifteen-currency table,
  the nisab, wheat-and-rice — each losing its source caption and, on two of
  them, a whole related-stories section. **A card citing IMF PortWatch never
  said so.** Three guards now, and all three are load-bearing:
  - the inner scroll arms only when content is genuinely taller than the page,
    which means `CardFrame` must add `COLUMN_PAD_V` back — that padding is on
    the ScrollView's `contentContainerStyle`, *outside* the view whose height
    `onContentLayout` measures, so the naive comparison is 80pt optimistic and
    was the truncation's proximate cause;
  - `nestedScrollEnabled` is **on**, because without it the first guard is moot;
  - `CardPager.settleToPage` corrects the resting offset — and it is armed from
    the *scroll worklet*, not only from `onScrollEndDrag`. That matters: the
    handoff produces neither a drag end nor a momentum end on the parent, so a
    drag-armed timer can never see it. The worklet hop is throttled to 10/sec
    and declines while `draggingRef`/`momentumRef` are set, so it never fires
    under a finger or cuts a fling short.

  The lesson worth keeping: the first two guards make the parked page rare, the
  third makes it impossible, and removing the second to avoid the first trades
  a visible layout glitch for silent data loss — which is the worse bug,
  because nobody reports it.
- **The bottom bar is not global.** `zoom` drives the globe, which lives on
  `news` alone, and `share` shares `activeArticleRef` — so on a card column one
  pill did nothing and the other sent a link to an unrelated article. Both are
  gated on `articleActions` now; `listen` stays everywhere because the briefing
  is not about what is on screen. Sharing a card needs a per-card URL and only
  the indicator-backed ones have one (`/e/{id}`).

- **Card content is not written in the app.** Part four of every card — why the
  number reaches an ordinary life — is the pipeline's `standing` paragraph,
  rendered verbatim. 48 of the 50 indicators, all 11 chokepoints and all 12
  calendar events carry one, and nothing rendered any of them before this.
- **`standing` is authoritative, so part two usually does not render.** The two
  were written by different hands and were saying the same thing on *every*
  reading card — brent, us-10y and vix each carried two definitions of
  themselves separated by a chart. The 25-character prefix guard that was meant
  to catch this missed all three by a word: a same-opening test cannot catch a
  same-meaning collision. `definitionUnlessStanding` is structural instead — if
  the pipeline wrote one, the app does not add a second. Same rule per column
  is why the "what a prediction contract is" explainer appears on the first
  belief card only; three cards deep it was the identical 200 characters three
  times over.
- **A composite card's part four must say whose it is.** `standing` belongs to
  one indicator, and four cards are built from several — so each printed one
  constituent's paragraph as if it explained the card: wheat's under "Wheat and
  rice", Syria's under a fifteen-row attention table, US GDP's under a list of
  four releases. Nothing on screen said which one, and the paragraph is well
  written and about something visible, so there was no tell. `whyLabel` names
  the owner in three words and keeps the desk's sentence verbatim. Where the
  paragraph is about the wrong *subject* rather than a partial one it is
  dropped instead — `paxg.standing` describes a gold-backed **token**, and
  under "Gold against silver" a label would only have made the mislabelling
  explicit. `currenciesCard` had already reached both resolutions; neither had
  been carried across.
- **The copy is a wire desk's, not an essay's — and the failure mode is
  repetition, not length.** A card has five parts and they are written in three
  places (this app, the pipeline, the payload's own labels), so the same fact
  arrives two and three times over with nobody able to see it from any one
  file. Every cut so far has been a duplicate rather than a digression: the
  attention card stated its normalisation in the reading note, the column
  header, part three *and* part two; the conflict card said "coded by hand" in
  parts two and three and "the lag is the method" in part four; the hazard card
  restated its own first sentence as its third. Before adding a line, read the
  card top to bottom on a device — that is the only place the parts are ever
  seen together.
  - **Say what it is, not what the app does.** "Weakened further than any other
    currency the app follows" became "Biggest faller of the 15 currencies
    tracked": a newspaper does not report what it itself follows, "more than
    all but one" is a riddle whose answer is "second", and the rank is the news
    and belongs in the first word. Same cut took "inside the window held here"
    off three belief cards — the scope still has to be stated, but the chart
    below now draws exactly that period with a date at each end, so "the period
    shown" points at something the reader can check.
  - **One name per thing, across the card and the sheet it opens.** The strait
    said "90-day normal" and "its baseline" in adjacent sentences; the sheet
    said "vs 90d" for the comparison the card spells out as "vs its 90-day
    normal", and `EntitySheet` said "vs prev" for a period it could simply have
    named. This is `formatReading`'s lesson (below) applied to words.
  - **British spelling, FT style: "per cent", "modelled", "analysed",
    numerals from 10 up.** Two visible strings had drifted to US forms.
- **A headline count must equal what the table paints.** "4 of 15 weakened"
  over three rose pills and one slate one, because the count took every
  positive rate change and the rows took `FX_NOISE_FLOOR`. Two answers to one
  question, four words apart.
- **The chart draws the window the chip names, and nothing either side of
  it.** `DAILY_WINDOW` measures thirty observations; brent, the ten-year and
  VIX ship sixty-odd. So each of those cards read "▲33%, since Jul 7" over a
  line that opened on 26 May and *fell* about eight per cent across the width
  of the screen. Both numbers were right, which is why it survived — and the
  picture is the half a reader trusts without checking. `plotWindow` slices
  from the same `WindowChange` the chip was built from, so the two cannot be
  computed twice and drift; `readingWindow` exists only to hand that object to
  both. This is the currency table's rule (above) as arithmetic, and it is also
  what every finance app does — the period control moves the chart and the
  percentage together, and nobody ships a three-month line over a one-month
  change.
- **A stated change needs a level to be stated against, and the chart is where
  it belongs.** Every single-series card now draws a dashed rule at
  `CardSeries.baseline` — the value the window opened at — and fills the
  distance between it and the line. It is the "previous close" line of every
  stock app, and it is what turns "up 33%" from a figure taken on trust into a
  height. Two things set it: `plotWindow` returns it with the slice, so it
  cannot be derived apart from the chip; and the strait, whose chip compares
  against a *level* rather than a window, marks its 90-day normal instead.
  - **The strait's normal is `n_total`'s, not `primaryField`'s.**
    `series.total` is the only series PortWatch ships and it counts every hull,
    while seven of the eleven straits are *read* on one vessel class — Panama
    on containers, whose normal is 8.1 a day against 30.9 for all ships. Off
    `primaryField` the rule sat a quarter of the way up a chart it had nothing
    to do with, and it also dragged the y-domain down to meet it. Kerch, the
    strait that has been leading the column, is `n_total` — so every reading of
    it on a device agreed with the bug.
- **The line is coloured, because every move in this app is.** `lib/valence.ts`
  says so and the card chart was the one surface that had dropped it: the 56×24
  sparkline on the column index took the chip's valence, and the 148pt chart
  the row opened drew the same series in near-white. The glance-sized picture
  made the claim; the read-it-properly one did not. Single-series only — one
  colour cannot belong to two lines — and the colour is still the consequence,
  never the direction, so on an FX card a rose line climbs. The endpoint dot
  went with it: it was `colors.accent`, dome gold, which made the last point
  read as a callout rather than as the end of the line and put a gold marker
  beside the top range label, exactly where a stock app prints the current
  price ("$78,425" against a bitcoin reading of $76,867).
- **The time axis had never rendered.** `TrendBlock` parsed each period into a
  `Date` and asked `scaleTime` for ticks; Hermes parses only ISO-ish dates and
  every period the pipeline emits is `"May 26"` or `"Aug 2024"`, both `Invalid
  Date` on device. So the parse bailed and every chart in the app — card and
  sheet alike — silently fell through to two endpoint labels, which is a
  reasonable-looking axis and gave nobody a reason to look. Ticks now come off
  the period array by index: the label is the string the pipeline already
  wrote, placed at `x(i)`, which needs no year to infer and is *under the
  reading it names* even on a series with weekends in it — a time scale over an
  index-spaced plot cannot promise that.
- **A dot per observation is a mark that means nothing when everything is
  marked.** Sixty-one 4pt discs along a 1.5pt stroke turned brent's line into a
  caterpillar, and no chart a reader has ever used dots a daily price series.
  They now appear only at fourteen readings or fewer — a fortnight of daily, a
  year of monthly — where each one is a reading worth pointing at, and at 2.5pt
  rather than 2 so they are actually visible. The six-point ceasefire contract
  is the case that needs them: `curveMonotoneX` draws it as one continuous
  swoop and the beads are the only thing saying which parts were measured.
- **A percentage series moves in points.** The ten-year printed "4.69%" at
  display size with "▲3.3%" beneath it — a level and a relative change, both
  spelled `%`. `windowPointChange` says mandatory on its own doc comment and
  `dailyDelta` was the last call site ignoring it; `formatMagnitudePoints` had
  to keep a decimal before it could, since an integer round called fifteen
  basis points *unchanged*, which is how the misleading unit survived.
- **An axis is a range, a reading is a level — but the axis was not even
  agreeing with itself.** `formatReading` rounds a price and groups it — "the fourth
  significant digit of a wheat price is noise the reader will never repeat" —
  while `formatBlockNumber` capped at one decimal and padded to none, so the
  bitcoin card printed `$76,867` at display size above an axis reading
  `$78,317.8`, and Ethereum's two axis labels disagreed with *each other*
  (`$2,515` over `$1,844.6`). A cap is not a format: it lets each value keep
  whatever precision it happens to have. `axisDecimals` picks one precision
  per chart from its endpoints and the axis, the scrub readout and the
  accessibility range all take it — whole endpoints stay whole (a contract
  priced 39 to 75), four figures and up lose the tenth, and below that the
  *span* decides, because a rand moving 16.04 → 16.80 in a month is a story
  told inside one digit and `16`/`17` throws it away.
  It deliberately stops short of matching `formatReading` everywhere. The two
  agree on five live cards of eight and part company on three — VIX, the
  ruble, the rand — all between ten and a thousand with a span of a few units,
  and that is the level/range split doing its job rather than a gap left in
  it. The rand is the proof: agreement there costs the card its subject.
- **The same rounding rule, written four times, had already stopped
  agreeing.** `formatSignedPct`, `formatMagnitudePct` and
  `formatMagnitudePoints` each carried
  `Math.abs(v) >= 10 ? Math.round(v) : Number(v.toFixed(1))`;
  `formatSignedPoints` rounded to an integer always, so one twenty-basis-point
  move was "0.2 points" in a chip and **unchanged** in the sentence beside it
  — the exact bug the entry above this one records fixing, still live one
  function down. `roundedMove` is the rule now. The `Number()` in it is also
  why the fifteen-currency table printed `+1%` beside `+0.8%` and `+3%` beside
  `+3.5%`: a trailing zero is right in prose and wrong in a column, so
  `formatSignedPct` takes `tabular` and the rail is one pill width again.
- **Two more copies of a formatter, in the two sheets a card opens.**
  `EntitySheet.formatLatest` was `formatReading` under another name — its
  comment promised thin-space separators over code emitting commas, which is
  how you can tell a copy has been edited alone. `ChokepointSheet.formatCount`
  was `formatQuantity` and had *drifted*: `10.0` where the card said `10`,
  `1235` where the card said `1,235`, and a third meaning for a name
  `format.ts` already exports. Both now import the original. This is the
  `RelatedStories` lesson applied to arithmetic — the sheet and the card it
  opens describe the same number and must not be free to describe it
  differently.
- **A chart caption names the unit; the ticks were naming it again.** Every
  card said its unit in English above the chart ("dollars a barrel") and then
  pasted the raw data column onto both tick labels — `22.2 index` / `14.3
  index` on VIX, `82.3 RUB⁠/⁠USD` on every FX mover, wide enough that each
  label wrapped onto two lines. `tickUnit` drops the two that are pure
  decoration: `index` is a kind rather than a denominator (the same judgement
  `readingParts` already made about the note, which had removed one of that
  word's four appearances and left three), and a currency pair is the column
  the caption had just been rewritten to stop showing. Accessibility keeps
  both — the label leads the a11y string.
- **A caption that repeats the note is not a caption.** The FX chart read
  "RUB to the dollar · higher is weaker" under a `readingNote` of "RUB to the
  dollar", and the metals chart repeated "ounces of silver to one of gold"
  verbatim from thirty-one characters above it. What a chart adds to a reading
  is the part the reading cannot hold: for FX that is the direction, for the
  ratio it is time. Both captions say only that now.
- **A guard on a property of the unit must not live inside a branch on the
  cadence.** The `%`-means-points rule was written into `dailyDelta` and not
  `monthlyDelta`, and `describeYearChange` had none at all — so nothing was
  wrong today only because no indicator is currently both monthly and per
  cent, and the day the pipeline gives `us-10y` a monthly cadence the fixed
  bug returns with no test touching it. One `readingDelta`, guard above the
  split.
- **`daysSince(x) <= limit` is not a freshness gate — it accepts the
  future.** `daysSince` is negative ahead of the clock, and every negative
  satisfies every gate, so device skew, a payload assembled in another
  timezone or a typed `2027` all sail through and lead a column under the
  `today ·` mark. Four gates were written that way (the strait, conflict,
  hazard, determination). `isFresh` bounds both ends, in one place.
- **Two lines on one axis need one order of magnitude, not one unit.**
  `types.ts` guards the unit and gold-against-silver failed the other half at
  ninety-four to one: silver drew as a flat line on the axis floor, showing
  neither its level nor its move nor which metal was cheaper — the card's whole
  question. It charts the ratio now, which is what its reading and chip already
  measure. Wheat and rice stay paired; they sit inside a factor of two.
- **The `today ·` mark needs a freshness gate behind it, and the strait had
  none.** PortWatch publishes weekly and lags, so `strait-*` led `commodities`
  under the word "today" on a reading six days old, and a file that stopped
  updating would have gone on doing it forever. This is the gate
  `lib/cards/conditions.ts` was written to enforce, missed on the one other
  card carrying the mark. Fourteen days (one missed publication), and
  `readingNote` names the week it counted.
- **Rank a column by what moved, not by what the feed listed first.**
  `outlook` opened with a contract flat for a fortnight and resolving in two
  years, and buried one eight points up in three days tied to three of today's
  stories. Sorting before the `.map()` matters twice: the once-per-column
  explainer is keyed on `position === 0`, so it now lands on the card a reader
  actually meets — and on the one with no `standing` of its own, which is where
  the column most needed it.
- **Quote the thing the reader owns, or the sign fights the colour.** The FX
  table printed the *rate* — rupees per dollar — where up means your money buys
  less, so it showed "+5.6%" in rose beside "−0.8%" in sage. No caption fixes
  that; a reader does not re-derive the denominator, they read the sign. Rows
  and the mover chips report the currency's own move now (`currencyMove`, the
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
    The FX table and the mover cards quote `currencyMove`, the reciprocal of
    the published rate, so they invert the meaning with it. Everywhere else,
    call the table — that is what stops a card and its sheet drifting.
- **The builders are pure and tested** (`lib/cards/`). Card arithmetic is
  pinned in `__tests__/cards-*.test.ts`, not eyeballed in a simulator, because
  the failure mode is a plausible wrong number rather than a crash. Two of them
  already bit: a relative-percent change printed as "points" on a probability,
  and a `windowChange` on a *daily* series described as month-on-month.
- **A card's part five was a list of headlines that did nothing.** "In 2 of
  today's stories" named them and rendered them as `Text`, so the one place a
  card says *this number is in that story* was the one place a reader could not
  follow it — the way there was to remember the headline, cross to `news` and
  find it. They are buttons now, on `SourceRow`'s rule: interactive only when a
  handler reaches them, because a row with nothing behind it is not a control
  and announcing one to a screen reader is worse than announcing none. They
  stay captions rather than becoming `ArticleRow`s; a sheet can afford that
  row's title-sized type, a card with five parts on one page cannot.
- **An empty state that centres itself needs a box with a size.** `EmptyState`
  uses `fill`, and both of the search sheet's empty states rendered at zero
  height: a term with no matches gave a bare input row and no "no articles
  found", and opening search said nothing about what it searches. It is the
  wrapper, not the component — the bookmarks page draws the same component in
  the same kind of content-sized sheet correctly — so the floor
  (`LAYOUT.emptyStateMinHeight`) is applied where the collapse was observed and
  `EmptyState` was left alone. The failure mode is worth knowing: nothing
  errors, nothing warns, the screen is just missing the half that explains it.
- **`threadSummary` must never be rendered.** It reads like a summary and is
  the desk's instruction to the writer ("Lead with the mechanism, not the
  outrage"). All 40 articles carry one.
- **A thread kicker needs `threadArticleCount > 1`.** Every article carries
  `threadArc` and `threadDay`; 38 of 40 carry them with a count of one, where
  "developing, day 13" is a claim the data does not support.
- **`useDeterminations` is the one network-only hook.** A genocide
  determination is a citation, and rendering one from disk asserts a finding on
  a launch where nothing confirmed it. `NEVER_PERSIST` keeps it off disk and
  there is no bundled fallback — no network, no card. This is the arrangement
  `41732ffc`'s revert note asked for.
- **`colors.determination` is for that card and nothing else.** A second
  chromatic accent only works while it means one thing; spend it on a falling
  market and it stops meaning this.

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
