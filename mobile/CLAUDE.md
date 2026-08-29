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

Horizontal swipe = section (`news` · `markets` · `shipping` · `outlook`), vertical
paging = item inside one. Every column but `news` is a `CardPager` over a
`Card[]`; `news` is `ArticleList` over the ordered river and owns the only
globe. `SectionBar` follows the pager and draws a rule after `news`.

- **The data axis is specific and graph-only.** `markets` holds prices, rates,
  currencies and crypto; `shipping` holds chokepoint traffic; `outlook` holds
  prediction-market probabilities. Every admitted card needs a usable time
  series and live pipeline analysis (`why`). Wikipedia attention, calendars,
  static comparisons and humanitarian snapshots do not enter these decks.
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
- **`recent` reaches the app through `/api/analysis.json`, and that is a
  second endpoint on purpose.** `build.js` withholds it from `api/trends.json`
  because that payload is also what the website's instrument rail downloads on
  every homepage visit, and no rail row prints a paragraph. The web gets it
  per-instrument from `/api/entity/{id}.json` on the press that opens a card;
  the app has no such page and no such press — it builds a whole column up
  front — so it needs every paragraph before it renders anything. 17.2KB, prose
  only: carrying the citations measured 34.7KB and no card shows them, so they
  stay on the entity endpoint. A 404 is a supported state, not a loading one.
- **The bottom bar is not global.** `zoom` drives the globe, which lives on
  `news` alone, and `share` shares `activeArticleRef` — so on a card column one
  pill did nothing and the other sent a link to an unrelated article. Both are
  gated on `articleActions` now; `listen` stays everywhere because the briefing
  is not about what is on screen. Sharing a card needs a per-card URL and only
  the indicator-backed ones have one (`/e/{id}`).

- **The graph and pipeline analysis stay visible.** The reading, chart, the
  desk's analysis, delta and current change make up the recurring surface.
  Hand-written fallback definitions are not rendered in the graph decks; static
  copy does not earn a card. Related articles remain ranking metadata and are
  not repeated below analysis that already names the news.
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
