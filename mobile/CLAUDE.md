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

Horizontal swipe = section (`news` · `now` · `next`), vertical
paging = item inside one. Every column but `news` is a `CardPager` over a
`Card[]`; `news` is `ArticleList` over the ordered river and owns the only
globe. `SectionBar` follows the pager and draws a rule after `news`.

- **The data axis is temporal, not an asset taxonomy.** `now` holds measured
  facts: humanitarian conditions, shipping, prices, currencies, rates and
  crypto and observed attention. `next` holds evidence about what may happen:
  prediction contracts, volatility and scheduled events. This replaces the superficially
  tidy `prices` / `money` / `outlook` split, which had nowhere truthful to put
  a disaster or legal determination. Three short labels fit with room to
  spare, so the whole axis is visible at once.
- **A card ships because it changed.** Standing conditions (famine, conflict,
  hazards, genocide determinations) were a section until an audit killed it:
  median famine analysis seven months old, conflict window 145 days behind, one
  determination 2,902 days old. They now gate on their own data being new and
  lead `now` on the day one is. IPC is the exception to the `current` mark: its
  payload supplies a covered period but no dependable publication timestamp.
  Apply the same test to anything new — the
  eleven-strait table and the release calendar both failed it later and are now
  gone and gated respectively.
- **A current card says so, and `lead` is how.** An event-dated condition card
  or a disrupted strait is on screen because its source cleared a freshness
  gate; the nisab and the
  gold-to-silver ratio are standing reference that happens to have moved a
  little. They arrived in identical typographic weight, so the distinction was
  one only a reader who already knew the gating could make. `CardFrame` now
  prints `current ·` before the kicker — an ink step, never a colour, because the
  chromatic budget is spent on `CardDelta` and `colors.determination`.
- **The straits are the globe's, not a column's.** `MiniGlobe` draws all eleven
  as tappable rings and `ChokepointSheet` carries the blurb, the standing
  paragraph, what is happening there now, the weather and the series — so a
  flat sorted table of the same eleven names was a worse copy of something the
  reader could already touch. `straitMovedCards` retains only straits gated by
  a 30% total-traffic gate; the deck ranker then uses current-news relevance to
  order them instead of letting a small strait's percentage move hide a major
  live story. Same rule for anything else the globe already carries.
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
- **Long decks state their scope.** The kicker line carries a quiet `3 / 15`
  position. The section underline still shows continuous progress; the count
  answers the different question of how much is left.
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

- **Daily facts stay visible; standing context is disclosed.** The reading,
  chart or comparison, delta and current change make up the recurring surface.
  Definitions and the pipeline's `standing` paragraph sit behind the card's
  info control so a daily reader does not meet the same prose every morning.
- **`standing` is authoritative, so a fallback definition is usually omitted.** The two
  were written by different hands and were saying the same thing on *every*
  reading card — brent, us-10y and vix each carried two definitions of
  themselves separated by a chart. The 25-character prefix guard that was meant
  to catch this missed all three by a word: a same-opening test cannot catch a
  same-meaning collision. `definitionUnlessStanding` is structural instead — if
  the pipeline wrote one, the app does not add a second. Prediction-contract
  context stays concise on every belief card because a reordered deck may open
  on any one of them.
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
