# Mobile Design System

Typography-first, dark-default, hairline-everywhere. Source Sans 3 only. `#c9a84c` dome gold as the sole accent. Hierarchy through type, not color.

See root `foundation.md` for the philosophy. This document is the operational reference: tokens, primitives, rules. If you're building or changing UI in `mobile/`, read it.

## Voice

The deck marks every story that arrived since the reader last had the feed
with a `new` ink step on its kicker, and the first one after them that the
reader already had with `earlier`; landing on that card is the caught-up
moment. `new` on every new card is recent (2026-09-21): the river went to time
order, and a reader coming back asked to see what had arrived. A card whose content changed since the reader last viewed it
opens its kicker line with `updated`, in stronger ink, in the slot `current`
uses — and a card is never both, because each is the app saying "look". There
is no “New to you” and no “Previously viewed”: both restated the reader's
position as one more small-caps line to decipher before reaching the number.
Status never borrows the favorable/unfavorable delta colors. Content
signatures ignore observation timestamps and editorial promotion; history
stays on-device and is included in the privacy erase action.

One typeface family. Whitespace is designed. Color carries meaning only — every non-monochrome element must justify its hue. No shadows, no gradients, no decorative icons — the carve-outs (the `BriefingBar`'s iOS-only frosted glass, the top bar's shade, the resting story's veil) are listed in §Native chrome carve-outs. Restraint is the brand.

## Tokens — `constants/theme.ts`

All design tokens live in one file. Components consume via `useTheme()`.

| Token group       | Export                                          | What it is                                    |
|-------------------|-------------------------------------------------|-----------------------------------------------|
| Colors            | `DARK_COLORS`, `LIGHT_COLORS` (via theme hook)  | Semantic keys — never inline a hex. Brand accent is `dome` (gold); `accent` is a soft text tier, not a brand color. |
| Typography        | `makeTypography` → `sizeBase`, `sizeLg`, etc.   | Responsive scale + leading (`leadingBody` / `leadingHeading` / `leadingTight`) + `trackingCaps` / `trackingHeading` / `trackingWordmark`. `leadingTight` (1.1) is the single tight single-line leading for small-caps labels/captions — use it instead of an ad-hoc `× 1.1`. |
| Variants          | `makeTextVariants` → 15 roles                   | The `<Text variant>` catalog (see below)      |
| Variant caps      | `VARIANT_CAP`                                   | Dynamic Type ceiling per variant              |
| Variant breaking  | `VARIANT_TEXT_PROPS`, `PROSE_BREAK_PROPS`       | Per-role line-breaking + iOS Dynamic Type ramp props, auto-applied by `<Text>`: prose hyphenates (Android) and uses iOS `standard` breaking; display/title use `balanced`/`push-out` widow control. Article sentences in `lib/markdown.tsx` get the body set via `PROSE_BREAK_PROPS`. |
| Spacing           | `SPACING` (xxs → xxl + `smPlus`, `screenPadding`, `articlePadding`) | Four-pt-ish scale. `articlePadding` (14) is the reading column's inset — the story card, the dock, the gauges and the cards; platform sheets keep `screenPadding` (18). |
| Gap tokens        | `GAP` (none, tight, row, item, section)         | Named Stack gap tiers derived from SPACING    |
| Radii             | `RADIUS` (handle, pill, floating)               | Three semantic tiers, intent-named            |
| Icons             | `ICON` (sm=14, md=20, lg=26)                    | Three-tier. Anything else is a mistake.       |
| Flag emoji        | `FLAG` (row=18, inline=22, display=32)          | Pictogram sizing — flags aren't type          |
| Animation         | `ANIMATION`, `EASING`, `KEEP_MOTION`            | Durations, spring configs, Reanimated easings — see §Motion |
| Opacity           | `OPACITY`                                       | Named tiers — never inline decimals           |
| Hit slop          | `HIT_SLOP`                                      | Standard expanded tap target                  |
| Tones             | `TextTone` + `toneColor(tone, colors)`          | Semantic color override (`default`, `secondary`, `accent`, `emphasis`, `dome`, `favorable`, `unfavorable`, `neutral`, `inverse` — text on a `colors.text`-filled surface) |
| Title scale       | `titleFontScale(length)`                        | Encapsulates "shrink long titles"             |

### Rules

- **Never write a hex code** in a component. Pull colors from `useTheme().colors` or pass a `tone` to primitives.
- **Never write a `fontSize`** in a component. Use `<Text variant>`; if you need to shrink, use the `scale` prop. If no variant fits, add a new one to `theme.ts` (with a comment explaining the editorial role).
- **Never write a raw spacing literal** (e.g. `padding: 12`). Use `SPACING`, `GAP`, or a primitive's padding prop.
- **Never import `@expo/vector-icons` directly**. Go through `<Icon>`.
- **Never set decorative `fontFamily`** (bold/semibold/italic) in a component for a role that exists as a variant. Font overrides via `font.X` are an escape hatch, documented with a comment when used.
- `fontVariant: ['oldstyle-nums']` / `['tabular-nums']` as style overrides are allowed — they're orthogonal to typography size/weight and some variants need them situationally.

**One documented exception to all of the above:** `ErrorBoundary` renders *above* `ThemeProvider` (it has to catch errors thrown inside the provider itself), so it genuinely cannot call `useTheme()` or use the `<Text>` / `Pressable` primitives. Its inline dark-mode styles are intentional — don't "fix" them to tokens.

### Sentiment / severity color

- **`colors.toneFavorableText / toneUnfavorableText / toneNeutralText`** — the sentiment hues (sage / rose / slate) for foreground text. Luminance-deepened in light mode to clear AA body (≥ 4.5:1) on cream `bg`; muted values in dark mode, where `bg` already has ample headroom. The `tone="favorable|unfavorable|neutral"` prop on `<Text>` resolves to these. The background-fill tones that once paired with them went with the last blocks that drew tone pills (`CompareBlock`, `TimelineBlock`, `TreemapBlock`).

**The top bar colors direction:** up is green, down is red, and flat is neutral.
Both the glyph and its percentage use that tone, so they reinforce the same
movement at a glance. `IndicatorStrip` opts into `DeltaChip`'s direction mode.

**Detail cards color consequence, and every move is coloured.** The rule lives in
`lib/valence.ts` and nowhere else. Two channels that must not be collapsed into
one: the **caret** says which way the number went, and the **colour** says what
that direction does to the person holding it. In this app up is not good — oil
rising is a fuel bill, an FX rate rising is a currency that weakened, bitcoin
rising is neither — so `riseMeansFor` declares what a rise in each *published
series* means, and `valenceOf` applies it to the direction, which is why a fall
in something whose rise hurts is `favorable`.

The third value is the part that is easy to get wrong. Where the app has no
honest claim the answer is **`neutral` — slate — not the absence of a colour**.
It was an absence, and the absence was the bug: two thirds of the app's
readings sat in `emphasis` ink, indistinguishable from the label text beside
them, so a reader's first job was working out whether a chip was coloured
before working out which way it pointed. Slate says *the app will not tell you
whether this is good news* in the same channel as sage and rose, which is a
claim it can stand behind. A comparison row that prints a move follows the same
rule: `tone` is always set, never left undefined.

Three surfaces used to answer this question separately and all three disagreed
— a card chip in sage/rose, `EntitySheet` tinting on *magnitude* in the globe's
dome gold, `ChokepointSheet` calling a strait disrupted at 15% where the card
said 10%. They read `lib/valence.ts` now. Adding a fourth answer is the
regression; extending the table there is the change.

A corollary: **quote the quantity whose sign matches its meaning.** FX mover
cards report the currency's own move rather than the published local-currency-
per-dollar rate, so the arrow and consequence colour cannot contradict one
another.

**Severity** (GDACS / conflict / weather) is single-tier: only the most editorially urgent state — Red disaster, fatal conflict, very-rough seas — earns the `toneUnfavorableText` hue. Lower tiers read in monochrome (`text` / `textEmphasis` / `textSecondary`); severity remains legible from the focal number, eyebrow, and metadata. This is the "color carries meaning only" rule from `foundation.md` taken literally.

## Primitives — `components/primitives/`

Eight primitives. Composition over configuration.

| Primitive    | Purpose                                  | Key props                                                                  |
|--------------|------------------------------------------|----------------------------------------------------------------------------|
| `Text`       | All text — variants + tone + scale       | `variant` (required), `tone`, `scale`, `numberOfLines`, `selectable`       |
| `Stack`      | Flex layout                              | `direction`, `gap`, `align`, `justify`, `padding*`, `fill`, `wrap`         |
| `Box`        | Decorative container                     | `background`, `radius`, `padding*`, `rule` (`top`/`bottom`/`left`/`right`) |
| `Screen`     | Top-level screen scaffold                | `edges`, `padded`                                                          |
| `Pressable`  | Full-bleed row press (spring + haptic)   | `onPress`, `haptic`, all RN Pressable props                                |
| `IconButton` | Icon-only chrome button                  | `onPress`, `accessibilityLabel`, icon child                                |
| `Icon`       | Ionicons wrapper — three sizes + tone    | `name`, `size` (`sm`/`md`/`lg`), `tone`                                    |
| `Markdown`   | Inline markdown text (`**b**`, `*i*`, links) | `children`, `variant`, `tone`, `onLinkPress` (handles the `country:XX` scheme) |

### Don't use if…

- `Pressable` — if you need a static-feedback element (no spring), use raw RN `Pressable` + `PRESSED_STYLE`. `Toast` dismiss, the hint pill and the search field's clear button are the references. Anything in a reading surface — the card's `sources · save · share`, the odds line, a row — uses the spring primitive: small chrome still deserves motion, and two press styles side by side read as two kinds of control.
- `Stack` vs `Box` — Stack = flex container with gap. Box = decorative wrapper (background/radius/rule). If you need both, nest them.

### Not shipped (add when needed)

`Divider`, `Spacer`, `Button` were planned but had zero consumers after the first pass. For a one-off hairline, use `Box rule="bottom"` or a raw `View` with `StyleSheet.hairlineWidth`. For buttons, `Pressable` + `<Text variant="label">` + a local pill style covers the current call sites. Add a primitive back when a third caller needs the same pattern.

## `<Text>` variants

Each variant is a complete typographic decision. Pick the closest match; if none fit, add a new variant (don't style inline).

| Variant           | Size    | Weight/Style | Color             | Use for                                           |
|-------------------|---------|--------------|-------------------|---------------------------------------------------|
| `display`         | sizeH1  | bold         | text              | An event sheet's focal number (`SheetHero`)       |
| `title`           | sizeLg  | semiBold     | text              | An opened story's title in a sheet, block titles  |
| `rowTitle`        | ~16pt   | semiBold     | text              | Headlines in a list — river, search, saved, instruments; a category dot in the story's globe hue sits before the meta line |
| `lead`            | sizeLg  | regular      | accent            | Subtitle under a display; About-page opener      |
| `body`            | sizeBase| regular      | text (oldstyle#)  | Paragraph prose                                   |
| `bodyEmphasis`    | sizeBase| semiBold     | emphasis          | Pull quotes, lead sentences, source names         |
| `bodyItalic`      | sizeBase| italic       | text              | Editorial block quotes                            |
| `caption`         | sizeSm  | regular      | textSecondary     | Secondary body, metadata sentences                |
| `captionEmphasis` | sizeSm  | semiBold     | text              | Toast/pill labels, chrome copy at caption size    |
| `label`           | sizeBase| smallCaps    | textSecondary     | Sheet titles, primary labels                      |
| `labelSm`         | sizeSm  | smallCaps    | textSecondary     | Section labels                                    |
| `labelXs`         | sizeXs  | smallCaps    | textSecondary     | Metadata labels, swipe actions                    |
| `labelXsTight`    | sizeXs  | smallCaps    | textSecondary     | Caps labels that may wrap — the strip's gauges    |
| `tabular`         | sizeXs  | regular (tab)| text              | Time/count readouts                               |
| `tabularEmphasis` | sizeXs  | semiBold (tab)| emphasis         | Scrub tooltips, emphasised readouts               |
| `sectionHeading`  | sizeSm  | italic       | accent            | "How each outlet framed this story" lines         |
| `wordmark`        | sizeWm  | bold (neg tr)| text              | App wordmark (`zuhd.news`)                        |

Override color with `tone`; scale by a fraction with `scale` prop. Caps from `VARIANT_CAP` auto-apply — override only for a documented reason.

**Typesetting that happens for you, and what it asks of copy.**
- A spaced dash never starts a line: `Text` turns the space before an em or en dash into a no-break space, and `smartTypography` does the same for story text, run by run. About printed "— zuhd:" at the head of a line before it.
- Story text gets its quotes and apostrophes from `smartTypography`, which reads each run with the character before it: text straight after a link or emphasis is not the start of a line, so `[China](country:CN)'s` is `China’s`, not `China‘s`.
- UI copy is typed as it should print — `today’s`, `“caught up”` — because it does not pass through `smartTypography`. A straight `'` in a visible string is a bug; in an accessibility label it does not matter.

## Patterns

### Sheets
- Use `SheetLayout` (wraps `BottomSheetModal` with theme-styled background) + a `SheetHandle` for the drag indicator. `MenuSheet`, `CountrySheet`, `SourcesSheet` are the references.
- **`MapSheet` is the one sheet that is not a platform sheet, and must stay the only one.** It is the map screen's persistent story card, and a platform sheet is modal: it scrims the globe, caps Android at two detents it chooses, and cannot persist. It owns three rules that remove gesture conflicts instead of arbitrating them — at peek the card does not scroll, nothing in it bounces, and the pan decides ownership once per gesture and holds it. A second hand-built sheet is the regression; everything that opens *from* the map is a platform sheet.
- **Sheets are platform sheets** — SwiftUI on iOS, Material3 `ModalBottomSheet` on Android, via `@expo/ui/community/bottom-sheet`. Three consequences, and all three are why code that used to exist no longer does:
  - `SheetHandle` is passed to `SheetLayout` as `handleComponent` but is **rendered as the sheet's first child**, not handed to the native sheet. Native sheets don't render a custom handle — the library reads only null-vs-non-null off that prop to decide whether to draw the platform's own indicator. `SheetLayout` pins it to `null` so our handle, its title, and the back chevron survive. Don't "fix" that back to `handleComponent={Handle}`; it silently deletes the title and the way multi-page sheets navigate.
  - **There is no backdrop to render.** The scrim is the system's. `renderBackdrop` and the `BottomSheetBackdrop` that fed it are gone from every sheet and from `BaseSheetProps`.
  - **The content-sized ceiling moved into `SheetLayout`.** gorhom's `maxDynamicContentSize` prop is gone, but the cap it provided is not optional: `fitToContents` measures the RN content's *natural* height, so a long page grew past the window and pushed its own handle, title and back chevron off the top of the screen — About and privacy rendered as prose running under the status bar with no way back. `SheetLayout` applies `LAYOUT.sheetMaxFraction` itself, and only in content-sized mode; a fixed-snap sheet is already handed a bounded column and capping it would leave dead space inside an 85% sheet.
  - **There is no backdrop opacity to set** — `OPACITY.backdrop` is gone with it — and no `BottomSheetModalProvider` in `app/_layout.tsx`, because a platform sheet presents itself rather than rendering into a JS portal.
- Content wraps in `SheetScrollView` (`components/SheetContent.tsx`) — a `BottomSheetScrollView` pre-wired with `sheetStyles.content` + the `bottomInset + SPACING.lg` safe-area tail. Don't re-inline that padding recipe; extra props (`indicatorStyle`, more `contentContainerStyle`) pass through. Note the scroll views are plain React Native ones under the new library: a native sheet coordinates scrolling itself, so none of gorhom's gesture-arbitration wrappers are needed.
- **A scrollable inside a sheet must carry its own flex, and which one depends on the sheet's mode.** The re-exported RN `ScrollView`/`FlatList` do not receive it from a wrapper. A sheet with explicit `snapPoints` (`CardSheet`) gives its content a bounded column, so `flex: 1` is right there. A content-sized sheet — every other one, including the search page's list and `CountrySheet`'s `rankingWrap`, which use `flexShrink: 1` — gives it an *auto* height, where `flex: 1`'s `flexBasis: 0` measures the content as zero and collapses the sheet. `SheetScrollView` serves both, so it uses `flexShrink: 1`, which shrinks to fit when bounded and is inert when not.
- Prose sheet pages (About, privacy, contact) share one type ramp: an unheaded opening paragraph is `lead`, headed sections are `labelSm` + `body`. Never `caption` — that tier is for metadata sentences, not pages of prose, and it forced hawk vision on the privacy policy. External links go through `SheetLink` (`SheetContent.tsx`), which owns the underline + `bodyEmphasis` treatment so a link on About and a link on privacy cannot drift apart.
- Vertical rhythm inside a sheet has exactly two tiers: `SPACING.md` (16) between paragraphs of one thought, `SPACING.lg` (24) between labeled sections. `SheetAboutPage`, `SheetInfoPage` and `EntitySheet` all key off this — a section that carries its own heading gets `lg`, never `md`.
- Nav rows and info rows in `MenuSheet` are the same control (padding, chevron, pushes a page) and share `label`. Don't size the secondary group down — the divider carries the hierarchy, and shrinking it drops the tap target under 44pt.
- Event sheets (`ConflictSheet`, `DisasterSheet`) share `SheetHero` / `SheetFlagRow` / `SheetSourceFooter` from `SheetContent.tsx` so the "one family" hero/flags/footer read identically. The severity → focal-tint decision routes through `severityTint` (`lib/severity.ts`) — the "only Red / fatal earns the rose hue" rule lives there, never inline.
- Staggered row entrances use `staggerEnter(i)` / `makeStaggerEnter()` (drop-in `FadeInDown`) or `staggerFadeIn(i)` (opacity-only, for in-place block rows) from `lib/stagger.ts` — never re-inline `FadeInDown.duration(...).delay(staggerDelay(...))`.
- Swipe-back is wired in `MenuSheet` and `CountrySheet` through `useSheetBackNavigation`. Android dialogs consume Back before React Native's `BackHandler`; the local Expo UI patch adds a native `onBackPress` callback. `CountrySheet` supplies it while a ranking is open, so Back returns to the country overview. At the root, Back dismisses normally. Other sheets keep their existing dismissal behavior.
- **A sheet's title lives in its handle** (`handleTitle`), never as a heading in the body, and `SheetHandle` draws it lowercase — small caps set a capital at full height, so a title arriving in data case (a GDACS event name) read as another tier. `SheetHero` does the same for its eyebrow. Section labels inside a sheet are `labelSm`.
- **Gestures inside a sheet need the root `SheetLayout` gives them.** On Android `@expo/ui` hosts sheet content under a React `RootView`, where gesture handler stops looking for its root, so `SheetLayout` wraps every sheet's content in its own `GestureHandlerRootView`. Without it the menu's swipe-back, Saved's swipe-to-remove and a chart's scrub were never recognised on Android.
- **A two-stop sheet lifts before its content scrolls.** A Material sheet at its first stop lays its content out at the full stop and shows the top of it, and a React Native `ScrollView` offers its drags to no one unless `nestedScrollEnabled` is set: `CardSheet` at half height scrolled inside itself to an end that was off the screen, and the cited stories and the source under a card's analysis could not be reached. `SheetScrollView` sets it, and `@expo/ui` relays the drag to the sheet.
- **One platform sheet at a time.** Going from one sheet to another — a country from a disaster, a card from the instruments list — goes through `handOffSheet` in `app/index.tsx`, which presents the next sheet from the first one's `onDismiss`. Presented while SwiftUI is still dismissing, iOS rejects it; presented over an open sheet, it stacks two modals.

### Cards (`components/cards/`) — opened in `CardSheet`

- **The rule that decides what exists.** A card earns a screen if a reader who
  gives it four seconds can tell someone else something true they did not know.
  Everything that fails is not in the primary deck. Applied to the live
  payloads it cuts dozens of candidate readings to a focused graph set.
- **Live analysis is the point**, owned by `CardFrame`. The recurring surface
  shows the reading, graph, the desk's pipeline-written analysis and movement.
  That analysis is the day's account of *why this moved* where the desk wrote
  one, and the standing definition only where it did not — a chart that just
  fell raises the first question, not the second. One paragraph, never both.
  The surface does not repeat related headlines already covered by that
  analysis, and it has no static-definition info control. Static copy does not
  satisfy the deck gate or travel in the card model.
- **The hierarchy follows the kind of claim.** A measured quantity leads with
  its reading, unit and movement before naming the series; a belief states its
  question before showing the probability, because a percentage without an
  outcome has no meaning. The reading remains the largest type on both. Live
  analysis is primary body copy; the baseline or second-window sentence is
  supporting caption copy beneath it. Source attribution is the quietest
  tier. Long titles scale but never truncate, and a card that still outgrows
  the screen scrolls.
- **Four tiers, and every line on the card belongs to one.** The answer —
  reading, unit and move, in `display` over a single `caption` row where the
  coloured magnitude is the only bold thing. The subject — `title`. The
  picture — the chart, whose caption, legend, axis extremes and ticks all sit
  in the quietest register (`labelXs` / `tabular`) so none of them reads as a
  subtitle. The account — `body` analysis, one `caption` sentence where the
  chip cannot carry the fact, and the source. Above all four, one `labelXs`
  line of metadata: an ink-step word if the card earned one, the kicker, the
  observation date. A polish round in September 2026 found eight type
  treatments and six small-caps items competing on one screen, which is why
  the delta window is caption rather than caps, the chart caption is `labelXs`
  on a card, figures are one caption-sized line each, and the status line is
  gone. Adding a fifth tier, or a second metadata line, is the regression.
- **Proximity carries the grouping.** Reading, unit and delta are one tight
  group. The chart begins after an item gap; the explanatory group begins
  after a larger group gap, with supporting movement copy kept close to the
  analysis it qualifies. Do not add dividers or headings merely to restate
  those groups.
- **Colour is semantic, not sectional.** Sage, rose and slate belong to the
  movement chip and retain their consequence meanings; belief moves are
  neutral. Reading, title, analysis, chart structure and `current` stay in the
  monochrome ink hierarchy. Do not tint sections or spend dome gold as card
  decoration.
- **`lead` says why the card is here at all.** A builder that gated a card on
  its own data being new sets `lead: true`, and `CardFrame` prints `current ·`
  before the kicker. Without it a newly escalated hazard and the
  gold-to-silver ratio arrive in identical weight, and the reader can only
  tell them apart by already knowing which cards are event-gated — which is
  knowing the implementation. It is an **ink step, never a colour**: the
  chromatic budget is spent on `CardDelta`. A strait whose total traffic fell
  at least 30% carries it.
- **Pipeline analysis replaces duplicate definitions.** The pipeline text
  remains visible beneath the graph; static fallback copy is not part of the
  card model.
- **The move belongs in the chip, not in a sentence.** "−5.2% since 22 Jul." is
  not prose and gains nothing from being set as prose; what is left for part
  three is whatever neither the chip nor the chart can show — the second
  window on a monthly series, the two grains' separate directions under a
  ratio, the level a rate has sat at and since when. A percentage that
  appears in both is the same fact twice, and so is a range the y-axis
  already prints: a belief's "low 26%, high 86%" was the chart read back as
  prose, and went. A level the chip measures *against* — a strait's 90-day
  normal — is not a sentence either: it is a dashed reference line on the
  chart (`CardSeries.reference`), because the place to show what a percentage
  is divided by is beside the line it divides. Nor is the deck's selection
  rule a sentence: "largest monthly fall in this 15-currency set" described
  the builder, not the currency.
- **Two graph-card kinds.** Builders describe graph-backed `Reading` and
  `Belief` cards. `CardView` is typed to that boundary so unreachable table or
  condition rendering branches cannot return unnoticed.
- **A card ships because it changed, not because it matters.** This is a news
  app: a screen earns its place by having something new on it this morning.
  Apply the same test to anything added here.
- **Builders are pure functions in `lib/cards/`**, not components —
  `buildInstrumentCards` covers markets, shipping and outlook. It returns a shorter column
  rather than a placeholder when a payload is missing, so a partial snapshot
  degrades to fewer cards and never a broken screen. Because they are pure,
  the arithmetic is pinned by tests rather than by looking at a simulator.
- **One ranked list across every instrument family.** `buildRankedInstruments`
  (`lib/cards/sections.ts`) applies the admission gate — a valid series and
  pipeline analysis, or a scheduled date with analysis — and then calls
  `prepareSwipeCards` once over the union. The three desks used to rank each
  pool against itself, which could only ever compare a strait with other
  straits; one strip and one instruments list need the comparison across kinds.
  `prepareSwipeCards` sorts urgent updates before the strongest tie to today's
  news, unusual movement against the series' own history, and finally the
  builder's stable editorial order. Relevance uses the strongest linked story
  rather than summing matches, so a broad aggregate cannot win merely by
  carrying more tags. Raw display units are never compared.
- **Market signals rank like everything else.** The server owns their
  *selection* and *revision*; which three of forty instruments occupy three
  fixed slots is presentation, so they join the pool with `lead: true` rather
  than being prepended unranked — prepending would hand two slots to whichever
  exchanges qualified, over a strait that had closed.
- **Number grammar lives in `lib/cards/format.ts`, and using it is not
  optional.** Two rules there exist because getting them wrong produces a
  plausible, wrong sentence: a change is always measured over a window the card
  can name (`windowChange` returns the period labels with the percentage,
  because a "daily" series holds observations, not days), and anything already
  in percent moves in **points** (`windowPointChange`) — a contract going 26 →
  86 moved 60 points, and "+231%" is arithmetic pretending to be journalism.
- Graph cards reuse `TrendBlock` at `variant="context"`. Dormant comparison
  builders still use `weight` as the raw magnitude and keep the sign in their
  display-formatted `value`; `tone` is only for a direction that means
  something to the person holding it (a currency weakening), never for
  "number went down".
- **A comparison gets one visible expression per fact.** When the headline is
  a ratio and the graph already names both series, do not add raw-value figure
  rows for those same series. The ratio, legend, graph and one movement
  sentence are the compact card; detailed quotes belong in a sheet. Figures
  remain valid where they introduce different information, such as the two
  metal weights that define the nisab threshold.

### Blocks (`components/blocks/`)
- Data-display components, used directly by the surfaces that need them:
  `TrendBlock` and `SourceCaption` (`EntitySheet`, the cards). Import the
  component; there is no data-driven dispatcher.
- Every block accepts `variant: 'article' | 'context'` — full-bleed vs embedded sizing.
- `blockContainerStyle` (in `blocks/shared.ts`) supplies the outer margin rhythm. Use it.
- `blocks/locations-geo.ts` is not a block — it's the hi-res lake/river/sea
  geometry the globe's `detail-geo.ts` loads. It lives here for historical
  reasons; don't assume the directory is UI-only.
- **History:** this directory once held a full `ArticleBlock` renderer (a
  `renderBlocks` dispatcher plus prose/quiz/quote/rank/actors/sankey/treemap/
  timeline/locations components) feeding a `ContextSheet`. The sheet's entry
  point was removed in `eeba139d` and the rest sat unreachable — still bundled,
  still pulling `d3-sankey`/`d3-hierarchy`/`d3-scale-chromatic` — until it was
  deleted. If context briefs come back, recover it from git rather than
  rewriting: `git show eeba139d^:mobile/components/blocks/index.tsx`.

### Screens
- Root `app/index.tsx` is the only route, and it is one screen. Overlays use sheets, not pushed routes.
- **One earth, and every surface is a layer over it.** `MiniGlobe` is mounted once at the screen root; the bar and the sheet sit above the same canvas. Stories are read on the map, never over it: there is no full-screen reader, because covering the earth to read a 450-character story lost the one thing this screen is for.
- **Two surfaces, and each answers a different question.**
  - **The bar** (`MapHeader`) — one row above the earth: the gauges (`IndicatorStrip`) scrolling sideways from the left inset to two fixed controls at the top right — the briefing's `▶` and the menu (three lines) — over a shade of the screen's own ground that fades out below the row so the labels read over lit land and city lights. The two are bare 20pt glyphs in one shared box (`HeaderControl`), so they sit on exactly one line; `▶` hides while the player bar is up and keeps its slot, and a paused briefing draws its heard arc round it. The player bar hangs just under the row and drops in from it, floating rather than taking layout, so the globe and the sheet do not move when it appears; top toasts start under it. The name is not spelled out. Markets, search, saved, settings, the map key and the pages open from the menu — the one control out of thumb reach, on purpose: it is opened a few times a week, and a rare destination belongs in the top corner, out of the way of a thumb that could hit it by accident. It is three lines rather than a cog because a cog promises only settings, and nobody looks for search or a saved story under a gear; it is at the right rather than the left because the left is where the gauges start, largest move first. It uses default ink for clear contrast. The gauges stay, and stay tappable, while a story is open: they used to fade out to quiet the screen for reading, but the open story's globe band starts under the row, so they never covered it — hiding them only took the markets away while a story about them was on screen. The gauges: subject, direction glyph and percentage move on one line (absolute readings and graphs stay in the detail sheet), for every market, strait and currency with a week to show, largest move first. *How much, and how.* One seven-day window for every slot, spoken by accessibility without a leading label taking up row space, because a row sorted by size is only a comparison if every slot measures the same thing; the card a slot opens keeps its own window and prints it. The slot whose card is open carries a 2pt emphasis bar, and the globe rings its place. Slots grow to fit their label and move without wrapping (a strait prints `Hormuz Str.`); a partial slot at the edge signals that the row continues; a swipe lands on a slot's own left edge and never between two, ticking as it settles — at 3.4 across only one edge can be clean, and the cut belongs at the right, where it is the signal rather than a row that looks broken (`lib/strip-snap.ts`, measured offsets, since a longer name widens its slot and there is no pitch to snap to); no marquee, because a ticker moves when nothing has happened, which is an engagement mechanic.
  - **The sheet** (`MapSheet`) — news only, one story at a time (`StoryDeck` → `StoryCard`), swiped sideways, newest first across every category — it was four category bands until 2026-09-21, which put the day's newest stories in four places. At rest the card is its kicker, `title` and **hook** — the first sentence, and nothing else; open, it is the whole story, risen over the earth, which stays where it is — scaling the earth into the band above cost a replay of the whole globe for every frame the sheet moved. *What, and what happened.* The card rested on the hook and the why-it-matters sentence until 2026-09-19, which was half of every article: a reader swiping forty stories read each one to get past it, and the day felt like an obligation. The rest of the story is laid out under the hook all along, so nothing reflows when it opens; at rest a veil of the sheet's own ground lies over it (see §Native chrome carve-outs), so its first line shows at half strength and its second fades to nothing — a sign that there is more, not a second sentence to read. The veil lifts as the sheet rises, and a tap on it opens the story.
  - **The dock** (`StoryDock`) — one row pinned to the foot of the screen, not to the sheet, so it is in the same place at rest and open: `(‹ 3 new) [story track]`. It used to be a masthead on top of the sheet — mid-screen at rest, near the top with a story open, where no thumb holding the phone reaches. The track is a segmented bar (one segment per story; past 60 the segments touch, since a day runs to ~65 and one plain bar would drop every hue and read state) that scrubs like the briefing player's (`useScrub` + `ScrubBar`); each segment is its story's category hue (the globe's beacons, the card's dot), and **a story the reader has read is a hairline** — 1pt in a far quieter step of its hue (`mixHex` toward the sheet, never an opacity) — so what is left to read is the part of the track with weight, by shape as well as colour. Read is two seconds in front of the reader, at rest or open (`useReadTracking`); it replaced a position fill that called everything behind the reader read, arrivals and scrubbed-over stories included (2026-09-22). The newest story is at the track's left end. The track draws nothing for a new story — a 2pt rule over new stories' segments was removed on 2026-09-22 at the user's request, a second row that said what the `new ·` kicker and the pill already say. When new stories the reader has not had sit behind the one in front — a refresh put them ahead of where they were reading, or a scrub skipped them — a `‹ 3 new` pill (40pt, `pillBg`, hairline edge) leads the row and jumps to the newest of them; it is ink, not a badge, and it goes when nothing is left behind the reader. While scrubbing, a tooltip says when the destination ran — `5h ago` at body size, its category quiet under it — and not its position, which the finger already marks (2026-09-22). A live Red hazard alert replaces the track and opens its details when pressed. **The dock has no buttons (2026-09-22, at the user's request): the swipe is the way through.** It ended in `⌃` (open and close the story) and `›` (the next story) until then, two 40pt circles that each copied a gesture the sheet already answers — sideways on the card for the next story, up to read, down or a tap on the globe to put it back — and the track now runs margin to margin. Screen readers keep both moves as the card's `next story` / `previous story` actions and the sheet handle's adjustable value. The briefing's `▶` was the dock's first circle until 2026-09-21; it is in the top bar now. Bottom toasts end above the dock. The briefing player bar is not here: it hangs under the top bar, where the `▶` that opened it was (2026-09-22).
  - **There is no list of every story.** A headlines list was tried twice — as the sheet's front door, and on 2026-09-19 as a sheet behind the dock — and removed both times. The short card, the time-ordered track and the swipe are the way through the day.
- **One day of news.** The river, and so the deck and the globe's lights, is the last 24 hours (anchored on the newest story if the desk has not published in a day). An older story appears only when a reader asks for it by name — a saved story, a notification.
- **Information appears exactly once.** The strip prints instruments; the sheet prints news; alerts never enter the deck. A contract reaches a story only as the odds line on the open card. The scrubber is a way to jump through the same deck, not a second set of facts.
- **The card is sized from type, not a fraction of the window, and never from the story in front.** `lib/deck-layout.ts` fits the kicker, two title lines, three lines of hook and the dock at the reader's font scale, keeps the globe at least 34% of the window (140pt absolute), and is computed once per window and font scale. Open, the sheet is **one height for every story**, measured from the day's own cards: `StoryMeasure` lays them out off screen and `openStoryHeight` takes the height three in four of them fit whole, never taller than leaves the globe 20%. It used to stop at each story's own height, and reading meant watching the text, the earth and the controls jump by three or four lines on every swipe; sized for the longest possible story instead, it left four or five blank lines under a typical one. Now a short story leaves a line or two after its last row, and the tallest quarter scroll a line or two. `sources · save · share` come right after the text, so the spare space is where the story ends, not a hole between the last sentence and buttons pinned to the dock.
- **Salience is named, not enlarged.** On a day something matters, the opening camera turns the planet to it and its mark carries a label. Mark size stays normalised within its own layer — coverage percentile for stories — exactly as the web map does it. A bigger dot asks the reader to compare areas, which people do badly; a name asks them to read, which is the app's whole medium.
- **The earth reads as a sphere, not a map in a circle.** Zooming makes the planet larger — past the screen's edges when it outgrows them — rather than magnifying the ground inside a fixed disc; the horizon is always the real limb. A swipe between two stories rises in proportion to the distance and comes down close over the next story, the way a map's fly-to does; stories are framed within a narrow range so the planet does not swell and shrink on its own. The web's 30° graticule sits under the land, and the day side is lifted in `daylight` so night is visible over the sea, not only on the continents.
- **The globe shares the web map’s geographic symbols, with compact direction signs for markets and shipping.** Shape says what a mark is; its colour is the web's colour for that thing (`mark*` tokens in `constants/theme.ts`, based on `public/islands/_map/style.ts`, with theme-adjusted green/red direction signs for market and shipping changes). Stories are beacons in their **category** hue — politics, economy, science, tech — sized by coverage and faded by age, with the web's contested ring; straits are two facing coastlines in slate, gold when pinched and teal when surging; exchanges use compact green up / red down arrows (26dp visible, 48dp touch targets); nearby exchanges share a numbered target and chooser; GDACS hazards are their pictograms in amber; conflict is a red glow; famine is the IPC column in violet; thermal anomalies are a burst in orange; a UN genocide determination is a dark disc with a red ring and an always-on label. This is a deliberate exception to "hierarchy through type, not colour": on the globe, colour *is* the legend, and a phone map that disagreed with the website about what a mark is would be two maps. Reference layers retain the web silhouettes; market and traffic direction signs use theme-adjusted green and red.
- **A story is found by opening it, and a found place is dimmed, never erased.** Tapping a beacon plays a burst in its hue and jumps the deck to that story's card; once every story at a place is found, its beacon becomes a small hollow ring in the same hue, which reopens the newest story when tapped. A thin ring just outside the globe is what is left to find, shrinking back toward twelve o'clock after each burst — no number anywhere on screen: the ring is the status, and the exact count is spoken by the story track's accessibility label. Growing a card, or swiping onto one while grown, counts too; swiping past a card at rest does not. Read progress is recorded after 15 uninterrupted seconds in the expanded reader with the app active and no covering sheet or briefing. Opening or swiping past a story does not mark it read; the article itself retains normal contrast. Read progress persists locally, separately from found globe markers. State lives in `lib/found-store.ts`, places in `lib/story-places.ts`.
- **Gesture ownership is spatial, and each axis has one job.** On the globe at rest: a drag turns it (and a release glides), a pinch zooms about the fingers, a tap hit-tests; with a story grown, a tap puts it down. On the bar: sideways scrolls instruments. On the sheet: sideways is the river (next story left, newer right), vertical is depth — pull up or tap to read, pull down to put the story back, pull down at rest to refresh — and an open card scrolls. The deck's pan and the sheet's pan are never simultaneous, so a drag is a swipe or a sheet move, never half of each. The dock sits outside both: its scrub never contends with either.
- **The camera belongs to whoever touched last.** Swiping the deck turns the globe along the great circle between two datelines under the finger; a drag on the globe, or a selection from the strip or an alert, takes it; the next swipe gives it back, flying first if the earth was left somewhere else. The app opens on the newest story — at rest the card and the globe agree.
- **Stories use the full reading width.** Cards retain the 14pt reader inset on both sides, without reserving room for a neighbouring headline. The category scrubber provides navigation context. Width stays fixed while growing the sheet, so dragging does not reflow paragraphs.
- **Overflow scrolls; it must never truncate.** No card text clamps: a long title or hook runs on under the dock at rest and scrolls when open. The only single-line truncation is metadata (kickers, meta lines).
- **The river is category-first, then newest-first** — see `lib/news-order.ts`. Categories follow `CATEGORIES`: politics, economy, science, tech. Within each category, order uses the story timestamp shown in the dateline; coverage never changes that order.
- **Every mark on the globe has a row somewhere, because the globe is hidden from screen readers.** VoiceOver activates an element at its geometric centre, which on a globe is a lottery country. The bar's gauges, the story cards, the dock's alert and the instruments sheet provide accessible controls for the globe's content; a mark layer without one is an accessibility regression. The story card's swipe is reachable as its `next story` / `previous story` accessibility actions.
- For new screens, wrap in `<Screen edges={...} padded>` to get bg + safe-area + padding for free.

### Onboarding (contextual hint pills + notification primer)
- **No tutorial mode, no synthetic content.** Never inject fake/self-referential content (welcome articles, sample data) into the feed — teaching happens on REAL articles the reader is already looking at. This was tried and rejected.
- **Hint pills** (`components/HintOverlay.tsx`): one small-caps `labelSm` line on an INVERTED pill (`colors.text` fill + `tone="inverse"` text — monochrome flipped for maximum visibility; the quiet `pillBg` recipe was tried and got overlooked), bottom-centered, ONE at a time, ever. Both lessons are taught on the map (`hooks/useOnboardingHints.ts`): the sideways swipe first, because it is how the news is browsed, then the globe, because nobody discovers the lights are tappable. Sources and save are never taught — the grown card prints them as words, and a visible control does not need a pill. A third, after both, names the wordless `▶` in the top bar, which carries no word because a word would take the gauges' room on a small phone (it named the dock's `⌃` too, until that went on 2026-09-22). All three are withheld from screen-reader users, whose path is the card's and scrubber's accessibility actions. Every hint is retired forever by performing the action or tapping the pill, and expires after 3 ignored sessions. State in `lib/onboarding-store.ts` (bookmark-store pattern). No icon, no dome gold — a hint is chrome whispering, not the accent speaking. Don't add new always-on chrome for teaching; extend this system.
- **Notification primer** (`components/NotificationPrimerSheet.tsx`): the OS permission dialog is never fired cold. The one-time primer sheet (presented at the first "caught up" moment, session 2+) is the only ask path; the MenuSheet toggle is the durable control. Any new permission ask must follow this soft-primer shape.
- **Replay**: settings has a "show tips again" row → `resetOnboarding()` (re-arms hints + reading depth; never re-arms the primer).

## Motion

Tokens in `constants/theme.ts` (`ANIMATION`, `EASING`, `KEEP_MOTION`); the rules they enforce, each learned from a bug:

- **Every spring states its physics** — a mass, or a `duration` and `dampingRatio`. Reanimated 4 fills a missing mass with 4, which quietly made `ANIMATION.spring` a 2.6-second wobble. `__tests__/motion-tokens.test.ts` holds the rule.
- **Reduce Motion is the library's job.** Every Reanimated animation and layout builder defaults to `ReduceMotion.System` and jumps to its end with the setting on, so a discrete animation needs no `useReducedMotion()` branch of its own — the branches that did exist made "a shorter timing" that ran instantly anyway. Keep a JS-side check only for what Reanimated cannot see: a timer, an RN `scrollTo({ animated })`, an initial value.
- **`KEEP_MOTION` is for what must not snap, and nothing else**: a spring released from a finger (the sheet, the deck's landing) and the cross-fade that stands in for movement under the setting (the globe's tap ring, which otherwise was never seen).
- **One landing.** The sheet and the deck settle with the same critically damped `springSettle`; camera moves share `EASING.camera`.
- **The camera has one way of travelling.** A swipe, a tapped mark, a scrub, a gauge and a notification all move the globe along the great circle (`slerpLatLng`) on van Wijk & Nuij's path (`flyCurve`) — the one MapLibre's `flyTo` flies, at the web map's own `curve: 1.35` — rising out of its way by as much as the crossing is long and coming down close. One ρ sets the rise and the pacing together, so the ground crosses the screen at a constant speed; a flight (`hooks/useCameraFlight.ts`) lasts as long as its own path (`flyMs`), and a flight to a story lands on that story's framing and hands the camera back to the deck on the same frame, so the country highlight and the place's label arrive with the landing.
- **A crossing the card cannot pace belongs to the camera.** The deck's landing spring settles in ~525 ms whatever the distance (`DECK_SETTLE_MS` — Reanimated's `duration` is perceptual, actual is 1.5× it). Where a crossing's own `flyMs` is longer, the camera leaves the deck at the finger's lift and flies the rest: the card snaps, the earth takes the time the distance asks for. Comparing the two durations, rather than picking an arc, is what keeps the hand-off from ever *hurrying* a crossing.
- **Anything anchored to the settled story fades through the middle of a swipe.** `settledIndex` flips at `frac = 0.5`, so the qibla and source arcs, the country highlight, the country's name and the place label all ride one smoothstep (`ARC_WINDOW`) that dissolves to nothing across the central band. It is a dissolve through zero, never an overlap, so a second country is never projected; at rest `frac` is exactly 0 or 1 and the fade is exactly 1, so nothing changes where the reader stops.

## Haptics

Three tiers, chosen by meaning (`lib/haptics.ts`): **tick** — movement within a surface (a story landing, a sheet settling, a page of cards, a scrub step, an option picked, back a page); **impact** — a press that opens something (a sheet, a story, a card, a link, share, play; the `Pressable` default, and scrub detents, because iOS silences selection feedback while audio plays); **notification** — state committed (saved, removed, undone, erased, every story found), with `hapticError` for what could not be done. A press whose handler gives its own haptic passes `haptic="none"`, so one touch is never two knocks.

## Anti-patterns (don't)

- Inline hex codes (`#141414`, `#e8e8e8`) — always via `useTheme().colors` or `tone`.
- Setting `fontSize` or `lineHeight` in a component — use a variant, or add one.
- A second font family. The app ships Source Sans 3 only.
- Decorative icons just to pad a label. Use words.
- Shadows, gradients, box-shadows (the `BriefingBar` iOS frosted-glass, the top bar's shade and the resting story's veil are the carve-outs — see §Native chrome carve-outs).
- A full-screen reader or modal per story on the map. It covers the earth the story is placed on; the story card grows in place instead.
- Raw `@expo/vector-icons` or `expo-symbols` imports outside `Icon.tsx`.
- Introducing a styling library (NativeWind, Unistyles, Tamagui, Restyle). Vanilla StyleSheet + theme hooks is the decision — documented, don't re-litigate.

## Native chrome carve-outs

The "no native chrome" rule has four specific, intentional carve-outs:

- **Icons on iOS resolve to SF Symbols.** `components/primitives/Icon.tsx` switches on `Platform.OS`: iOS renders the matching SF Symbol via `expo-symbols` (sharper optical sizing, automatic tinting, system feel); Android renders Ionicons. The public `<Icon name="..." size="sm|md|lg" tone="..." />` API stays unified — call sites pass an Ionicons name and the mapping table in `Icon.tsx` resolves to SF Symbol on iOS. An Ionicons name not in the mapping table silently falls back to Ionicons on both platforms — no missing-glyph placeholder.
- **BriefingBar uses iOS frosted glass.** The floating audio chrome on the dock uses `BlurView` (`tint="systemThinMaterial"`) on iOS so the bar reads as a native floating surface. Android keeps a solid `playerBg` fill (`pillBg` over the sheet, composited — `pillBg` itself is 88% and let the story card's lines show through the bar) because Android's BlurView implementations are uneven. This is the only sheet-or-bar surface allowed to blur — editorial sheets stay typography-first.
- **The top bar sits on a shade.** `MapHeader` floats over the globe, and caps gauge labels over a lit coastline were hard to read. Behind it, one vertical gradient of `bg` — strongest under the status bar, still holding under the row, gone `SPACING.xl` below it — so the earth runs up into the bar instead of stopping at an edge. It is a legibility scrim, the web map's HUD answer, not decoration.
- **The resting story is veiled below its hook.** `StoryCard`'s `Veil`: two body lines of gradient from half the sheet's ground to all of it, then solid ground, attached to the rest of the story (never to a place on screen, so it cannot lie over the hook). It is the one place text is quieted by opacity, and only because that text is not meant to be read at rest: the card rests on the hook so the day is a choice rather than a queue, and the fade is the sign that opening it reveals more. Nothing else gets a gradient.

## Accessibility checklist

Every interactive element must have:

- `accessibilityRole` — `button`, `link`, `tab`, `radio`, `switch`, `adjustable`, `search`, `alert`, `header`.
- `accessibilityLabel` — what it is. `accessibilityHint` — what happens when activated, if not obvious.
- `accessibilityState` — `selected`, `expanded`, `disabled` when applicable.
- `hitSlop` — use `HIT_SLOP` default. `IconButton` applies it automatically.
- Dynamic Type — `VARIANT_CAP` auto-applies; override via `maxFontSizeMultiplier` only with reason.
- Reduce Motion — see §Motion. Reanimated snaps every discrete animation by itself; what needs care is the motion that must *not* snap. See also the memory note on battery saver.
  - **Exempt: motion that tracks direct manipulation.** The story deck follows a sideways swipe, the sheet follows a drag, and the globe scales with the sheet as a story grows — and their release springs (`KEEP_MOTION`) carry the finger on. Reduce Motion targets discrete, decorative, or unexpected motion; snapping a finger-tracked element reads as broken, not accessible. Gate the transition, not the tracking.
- Announcements — `accessibilityLiveRegion` is Android-only. Anything that changes with no focus on it (a toast, the dock's status line, a story swapped in by an accessibility action) goes through `announce()` (`lib/announce.ts`).
- `adjustable` controls carry their position as `accessibilityValue`, not in the label, so VoiceOver reads the new value after each adjustment.
  - Prefer a cross-fade to removing feedback entirely — `MiniGlobe.showPulse` still draws its ring under Reduce Motion, just at final radius without the expansion.
- WCAG AA contrast — the dark and light palettes meet 4.5:1 body / 3:1 large at normal text weights.

## Adding a new component

1. Read `foundation.md` — the design voice is sacrosanct.
2. Sketch the layout using existing primitives. If you can't express it, consider: can a new variant cover this? Can `Stack`/`Box` compose it?
3. Pick `<Text variant>` for every text element. Never set `fontSize`.
4. Use `tone` before a color override. Use `scale` before a `fontSize` override.
5. Wire a11y props — `role` + `label` minimum.
6. Verify light + dark modes at default and max Dynamic Type.
7. If the component introduces a reusable pattern (three+ usages likely), add an example to this doc.

## Adding a new variant

Add it only if it's a distinct editorial/interaction role, not a one-off size tweak. Workflow:

1. Name it semantically (`rankDigit`, not `xsBoldAccent`).
2. Add the entry to `makeTextVariants` in `theme.ts` with a one-line JSDoc explaining the role.
3. Add the `MAX_FONT_SCALE` tier to `VARIANT_CAP`.
4. Update this doc's variant table.
5. Migrate existing call sites that match the new role.

## References

- Voice & manifesto — `/foundation.md`
- Theme file — `mobile/constants/theme.ts`
- Primitives — `mobile/components/primitives/`
- `useTheme` hook — `mobile/hooks/useTheme.tsx`
- Shared press animation — `mobile/hooks/useSpringPress.ts`
- Shared sheet content (scroll/hero/flags/footer) — `mobile/components/SheetContent.tsx`
- Stagger entrances — `mobile/lib/stagger.ts`
- Severity → tint rule — `mobile/lib/severity.ts`
- Haptics — `mobile/lib/haptics.ts`

## Globe geography detail

While the story deck moves, expensive globe detail waits for the exact story
endpoint. Arc fades keep their existing timing. The final detail transition
must bypass frame throttling and numeric no-op filtering, but still respect
projection backpressure so an interrupted swipe cannot restore stale detail.

The news scrubber keeps its two muted segment palettes stable across landings;
the raised current-story marker carries the full category hue separately.

The mobile globe renders tiers generated from Natural Earth 10m by
`node scripts/generate-globe-geography.mjs`. Borders, coastline, ice and the
country highlight must use the same tier. Resting detail follows projected
scale; the lightweight motion tier is replaced on the final stopped frame.
Country taps use the resting tier. Do not restore 110m as the resting map.
The generator corrects reversed island rings before merging land and simplifies
shared arcs once, preserving alignment. Projection resampling remains enabled
so long edges curve smoothly when magnified.


### Map exploration (September 2026)

The mobile globe includes every exchange published in `/api/markets.json`, not just scored highlights. Market signs show the latest quoted session versus prior close, with an asterisk for older quotes. `menu → markets` (and the strip's `all →`) opens all / rising / falling filters and Other data, including commodities, currencies, straits and predictions. Selecting an exchange flies to its actual coordinates and opens its source, date, history and context. Non-geographic indicators stay in the browser.

The market marker is 26dp across with a separate 48dp touch target. Screen-space clusters preserve every exchange, split as zoom creates space, and expose members in a chooser. Placement avoids story and hazard targets; short leader lines connect displaced signs to their geographic origin. Labels pack around higher-priority text and stay within the map viewport.

Straits retain their coastline silhouettes and disruption hues. Compact green up / red down signs and percentage labels show the seven-day average for all ships against the strait's 90-day normal (`vs 90d`). This differs from the header's seven-day movement and the markets' prior-close window; each comparison is stated. Missing traffic comparisons receive no invented direction.

**A market's or strait's label is two lines (2026-09-22, the user's request).** The name, then the move under it: `Strait of Hormuz` over `↓57% vs 90d`, `BIST 100` over `↓4.8%`. It was one 11pt line tinted end to end in the move's colour, which ran a third of the way across a phone and put the name in a traffic colour. The hierarchy is the data map's: the figure carries the weight, the name says what it is. The name is 11pt in plain `text` ink — upright semibold for an exchange, the water labels' italic for a strait, the atlas convention for a passage. The move is 13pt semibold (`MARK_VALUE_PT`) in its direction's colour; a strait's `vs 90d` stays 11pt `textSecondary` after it, a qualifier rather than a second figure. One halo covers every line. The story's location (16pt) is still the largest text on the globe, and a cluster's `3 markets` stays one line, since it has no single move. Two lines are narrower and taller, so in a crowded region a label now finds room more often sideways and less often vertically; with no room either way it is dropped as before, and the mark stays tappable.
