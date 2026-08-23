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
paging = item inside one. Every column but `news` is a `CardPager` over a
`Card[]`; `news` is `ArticleList` over the ordered river and owns the only
globe. `SectionBar` follows the pager and draws a rule after `news`.

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
- **A headline count must equal what the table paints.** "4 of 15 weakened"
  over three rose pills and one slate one, because the count took every
  positive rate change and the rows took `FX_NOISE_FLOOR`. Two answers to one
  question, four words apart.
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
