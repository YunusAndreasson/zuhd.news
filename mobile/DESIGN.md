# Mobile Design System

Typography-first, dark-default, hairline-everywhere. Source Sans 3 only. `#c9a84c` dome gold as the sole accent. Hierarchy through type, not color.

See root `foundation.md` for the philosophy. This document is the operational reference: tokens, primitives, rules. If you're building or changing UI in `mobile/`, read it.

## Voice

One typeface family. Whitespace is designed. Color carries meaning only — every non-monochrome element must justify its hue. No shadows, no gradients except the `ArticlePage` globe-fade backdrop and the `BriefingBar`'s iOS-only frosted glass (see §Native chrome carve-outs), no decorative icons. Restraint is the brand.

## Tokens — `constants/theme.ts`

All design tokens live in one file. Components consume via `useTheme()`.

| Token group       | Export                                          | What it is                                    |
|-------------------|-------------------------------------------------|-----------------------------------------------|
| Colors            | `DARK_COLORS`, `LIGHT_COLORS` (via theme hook)  | Semantic keys — never inline a hex. Brand accent is `dome` (gold); `accent` is a soft text tier, not a brand color. |
| Typography        | `makeTypography` → `sizeBase`, `sizeLg`, etc.   | Responsive scale + leading (`leadingBody` / `leadingHeading` / `leadingTight`) + `trackingCaps` / `trackingHeading` / `trackingWordmark`. `leadingTight` (1.1) is the single tight single-line leading for small-caps labels/captions — use it instead of an ad-hoc `× 1.1`. |
| Variants          | `makeTextVariants` → 15 roles                   | The `<Text variant>` catalog (see below)      |
| Variant caps      | `VARIANT_CAP`                                   | Dynamic Type ceiling per variant              |
| Variant breaking  | `VARIANT_TEXT_PROPS`, `PROSE_BREAK_PROPS`       | Per-role line-breaking + iOS Dynamic Type ramp props, auto-applied by `<Text>`: prose hyphenates (Android) and uses iOS `standard` breaking; display/title use `balanced`/`push-out` widow control. Article sentences in `lib/markdown.tsx` get the body set via `PROSE_BREAK_PROPS`. |
| Spacing           | `SPACING` (xxs → xxl + `smPlus`, `screenPadding`, `articlePadding`) | Four-pt-ish scale. `articlePadding` (14) is the reader column inset — `CategoryBar` mirrors it so tabs align with the article body. |
| Gap tokens        | `GAP` (none, tight, row, item, group, section)  | Named Stack gap tiers derived from SPACING    |
| Radii             | `RADIUS` (handle, pill, floating)               | Three semantic tiers, intent-named            |
| Icons             | `ICON` (sm=14, md=20, lg=26)                    | Three-tier. Anything else is a mistake.       |
| Flag emoji        | `FLAG` (chip=16, row=18, inline=22, display=32) | Pictogram sizing — flags aren't type          |
| Animation         | `ANIMATION`, `EASING`                           | Durations, spring configs, Reanimated easings |
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

The sentiment palette splits into background and foreground variants:

- **`colors.toneFavorable / toneUnfavorable / toneNeutral`** — background fills only. Tuned for `BLACK` foreground text on the tone (CompareBlock pills, TimelineBlock spans, TreemapBlock cells). Do not use as foreground text on `bg`: in light mode the contrast is ~3.4:1 (AA-large only).
- **`colors.toneFavorableText / toneUnfavorableText / toneNeutralText`** — foreground text variants. Hue-aligned with the bg-tones, but luminance-deepened in light mode to clear AA body (≥ 4.5:1) on cream `bg`. In dark mode the values are identical to the bg-tones (dark `bg` already has ample headroom). The `tone="favorable|unfavorable|neutral"` prop on `<Text>` resolves to these.

**Direction is not sentiment, and every move is coloured.** The rule lives in
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

- `Pressable` — if you need a static-feedback element (no spring), use raw RN `Pressable` + `PRESSED_STYLE`. `Toast` dismiss and the `CategoryBar` row are references. BottomActionBar pills use the spring primitive — small chrome still deserves motion.
- `Stack` vs `Box` — Stack = flex container with gap. Box = decorative wrapper (background/radius/rule). If you need both, nest them.

### Not shipped (add when needed)

`Divider`, `Spacer`, `Button` were planned but had zero consumers after the first pass. For a one-off hairline, use `Box rule="bottom"` or a raw `View` with `StyleSheet.hairlineWidth`. For buttons, `Pressable` + `<Text variant="label">` + a local pill style covers the current call sites. Add a primitive back when a third caller needs the same pattern.

## `<Text>` variants

Each variant is a complete typographic decision. Pick the closest match; if none fit, add a new variant (don't style inline).

| Variant           | Size    | Weight/Style | Color             | Use for                                           |
|-------------------|---------|--------------|-------------------|---------------------------------------------------|
| `display`         | sizeH1  | bold         | text              | Article hero title                                |
| `title`           | sizeLg  | semiBold     | text              | Row titles, block titles                          |
| `lead`            | sizeLg  | regular      | accent            | Subtitle under a display; About-page opener      |
| `body`            | sizeBase| regular      | text (oldstyle#)  | Paragraph prose                                   |
| `bodyEmphasis`    | sizeBase| semiBold     | emphasis          | Pull quotes, lead sentences, source names         |
| `bodyItalic`      | sizeBase| italic       | text              | Editorial block quotes                            |
| `caption`         | sizeSm  | regular      | textSecondary     | Secondary body, metadata sentences                |
| `captionEmphasis` | sizeSm  | semiBold     | text              | Toast/pill labels, chrome copy at caption size    |
| `label`           | sizeBase| smallCaps    | textSecondary     | Sheet titles, primary labels                      |
| `labelSm`         | sizeSm  | smallCaps    | textSecondary     | Section labels                                    |
| `labelXs`         | sizeXs  | smallCaps    | textSecondary     | Metadata labels, swipe actions                    |
| `tabular`         | sizeXs  | regular (tab)| text              | Time/count readouts                               |
| `tabularEmphasis` | sizeXs  | semiBold (tab)| emphasis         | Scrub tooltips, emphasised readouts               |
| `sectionHeading`  | sizeSm  | italic       | accent            | "How each outlet framed this story" lines         |
| `wordmark`        | sizeWm  | bold (neg tr)| text              | App wordmark (`zuhd.news`)                        |

Override color with `tone`; scale by a fraction with `scale` prop. Caps from `VARIANT_CAP` auto-apply — override only for a documented reason.

## Patterns

### Sheets
- Use `SheetLayout` (wraps `BottomSheetModal` with theme-styled background) + a `SheetHandle` for the drag indicator. `MenuSheet`, `CountrySheet`, `ChokepointSheet`, `SourcesSheet` are the references.
- **Sheets are platform sheets** — SwiftUI on iOS, Material3 `ModalBottomSheet` on Android, via `@expo/ui/community/bottom-sheet`. Three consequences, and all three are why code that used to exist no longer does:
  - `SheetHandle` is passed to `SheetLayout` as `handleComponent` but is **rendered as the sheet's first child**, not handed to the native sheet. Native sheets don't render a custom handle — the library reads only null-vs-non-null off that prop to decide whether to draw the platform's own indicator. `SheetLayout` pins it to `null` so our handle, its title, and the back chevron survive. Don't "fix" that back to `handleComponent={Handle}`; it silently deletes the title and the way multi-page sheets navigate.
  - **There is no backdrop to render.** The scrim is the system's. `renderBackdrop` and the `BottomSheetBackdrop` that fed it are gone from every sheet and from `BaseSheetProps`.
  - **The content-sized ceiling moved into `SheetLayout`.** gorhom's `maxDynamicContentSize` prop is gone, but the cap it provided is not optional: `fitToContents` measures the RN content's *natural* height, so a long page grew past the window and pushed its own handle, title and back chevron off the top of the screen — About and privacy rendered as prose running under the status bar with no way back. `SheetLayout` applies `LAYOUT.sheetMaxFraction` itself, and only in content-sized mode; a fixed-snap sheet is already handed a bounded column and capping it would leave dead space inside an 85% sheet.
  - **There is no backdrop opacity to set** — `OPACITY.backdrop` is gone with it — and no `BottomSheetModalProvider` in `app/_layout.tsx`, because a platform sheet presents itself rather than rendering into a JS portal.
- Content wraps in `SheetScrollView` (`components/SheetContent.tsx`) — a `BottomSheetScrollView` pre-wired with `sheetStyles.content` + the `bottomInset + SPACING.lg` safe-area tail. Don't re-inline that padding recipe; extra props (`indicatorStyle`, more `contentContainerStyle`) pass through. Note the scroll views are plain React Native ones under the new library: a native sheet coordinates scrolling itself, so none of gorhom's gesture-arbitration wrappers are needed.
- **A scrollable inside a sheet must carry its own flex, and which one depends on the sheet's mode.** gorhom used to supply it from inside its scrollable HOC; the re-exported RN `ScrollView`/`FlatList` do not, so a list with no flex measures to its own content height, overflows the sheet and stops scrolling at the fold. A fixed-snap sheet (`useSheetSnaps(true)`) gives its content a bounded column, so `flex: 1` is right — that's what `SheetSearchPage`'s list and `CountrySheet`'s `rankingWrap` use. A content-sized sheet gives it an *auto* height, where `flex: 1`'s `flexBasis: 0` measures the content as zero and collapses the sheet. `SheetScrollView` serves both, so it uses `flexShrink: 1`, which shrinks to fit when bounded and is inert when not.
- Prose sheet pages (About, privacy, contact) share one type ramp: an unheaded opening paragraph is `lead`, headed sections are `labelSm` + `body`. Never `caption` — that tier is for metadata sentences, not pages of prose, and it forced hawk vision on the privacy policy. External links go through `SheetLink` (`SheetContent.tsx`), which owns the underline + `bodyEmphasis` treatment so a link on About and a link on privacy cannot drift apart.
- Vertical rhythm inside a sheet has exactly two tiers: `SPACING.md` (16) between paragraphs of one thought, `SPACING.lg` (24) between labeled sections. `SheetAboutPage`, `SheetInfoPage`, `ChokepointSheet` and `EntitySheet` all key off this — a section that carries its own heading gets `lg`, never `md`.
- Nav rows and info rows in `MenuSheet` are the same control (padding, chevron, pushes a page) and share `label`. Don't size the secondary group down — the divider carries the hierarchy, and shrinking it drops the tap target under 44pt.
- Event sheets (`ConflictSheet`, `DisasterSheet`) share `SheetHero` / `SheetFlagRow` / `SheetSourceFooter` from `SheetContent.tsx` so the "one family" hero/flags/footer read identically. The severity → focal-tint decision routes through `severityTint` (`lib/severity.ts`) — the "only Red / fatal earns the rose hue" rule lives there, never inline.
- Staggered row entrances use `staggerEnter(i)` / `makeStaggerEnter()` (drop-in `FadeInDown`) or `staggerFadeIn(i)` (opacity-only, for in-place block rows) from `lib/stagger.ts` — never re-inline `FadeInDown.duration(...).delay(staggerDelay(...))`.
- Swipe-back and Android hardware back are already wired in `MenuSheet` — copy that pattern for multi-page sheets.

### Cards (`components/cards/`) — every column except `news`

- **The rule that decides what exists.** A card earns a screen if a reader who
  gives it four seconds can tell someone else something true they did not know.
  Everything that fails is not in the primary deck. Applied to the live
  payloads it cuts dozens of candidate readings to a focused graph set.
- **Live analysis is the point**, owned by `CardFrame`. The recurring surface
  shows the reading, graph, pipeline-written `standing` analysis and movement.
  It does not repeat related headlines already covered by that analysis, and
  it has no static-definition info control. Static copy does not satisfy the
  deck gate or travel in the card model.
- **The hierarchy follows the kind of claim.** A measured quantity leads with
  its reading, unit and movement before naming the series; a belief states its
  question before showing the probability, because a percentage without an
  outcome has no meaning. The reading remains the largest type on both. Live
  analysis is primary body copy; the range, baseline or second-window sentence
  is supporting caption copy beneath it. Source attribution is the quietest
  tier. Long titles scale but never truncate, and a card that still outgrows
  the screen scrolls.
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
  three is whatever the chip cannot show — the baseline a strait is measured
  against, the range a belief has travelled, the second window on a monthly
  series. A percentage that appears in both is the same fact twice.
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
- **The swipe boundary validates and ranks.** `buildSwipeSections` first
  requires a valid time series and pipeline analysis; `prepareSwipeCards` is the only
  path from builder output into `CardPager`: it requires explanatory copy,
  computes ranking metadata internally, and sorts urgent
  updates before the strongest tie to today's news, unusual movement against
  the series' own history, and finally the builder's stable editorial order.
  Relevance uses the strongest linked story rather than summing matches, so a
  broad aggregate cannot win merely by carrying more tags. A final two-card
  run cap keeps one kicker from becoming a hidden lane. Raw display units are
  never compared. Refresh reordering anchors the visible card by id.
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

### Blocks (`components/blocks/`)
- Three data-display components, used directly by the sheets that need them:
  `TrendBlock` and `SourceCaption` (`EntitySheet`, `ChokepointSheet`) and
  `CompareBlock` (`ChokepointSheet`). Import the component; there is no
  data-driven dispatcher.
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
- Root `app/index.tsx` is the only route. Overlays use sheets, not pushed routes.
- **Two axes, and they are the whole navigation.** Horizontal swipe moves
  between four sections (`news` · `markets` · `shipping` · `outlook`); vertical
  paging moves between full-screen items inside one. Nothing should require the
  reader to aim at a small target.
- **The data sections are focused graph desks.** `markets` is prices, rates,
  currencies and crypto; `shipping` is chokepoint traffic; `outlook` is
  probability markets. A real time series plus live pipeline explanation is
  the admission rule. Static reference, Wikipedia attention, calendars and
  snapshot-only conditions stay out of the primary rail.
- **A card's graph visualises its headline quantity.** If the payload has only
  total-traffic history, a chokepoint card cannot headline tankers; if the
  headline is a gold/silver ratio, the graph is that ratio rather than two raw
  prices whose scale makes one invisible. Secondary figures may explain the
  components without replacing the promised visual.
- **Progress appears once.** The tab underline is the deck progress signal;
  cards do not repeat it as `current / total` text.
- **Nothing may steal the horizontal swipe.** `TrendBlock`'s scrubber spans the
  chart, and on a card that is most of the screen — five page swipes in a row
  did nothing but drag a dot along a line. Charts on cards pass
  `scrubbable={false}`; scrubbing lives in sheets, where there is no pager to
  compete with. Any new gesture on a card owes the same check.
- `SectionBar` follows the pager. Four specific labels may scroll on a narrow
  phone or at large Dynamic Type; abbreviating ("curr") is not the alternative.
  Driven by the
  settled `currentSection`, not by `pagerOffset` — a rail sliding under a live
  drag fights the drag, while the indicator tracking the finger is the part
  that should feel live.
- **The rail groups, because the sections are not peers.** A rule sits after
  `news`: it is an article river and the other three are data-card decks, so
  drawing all four at identical weight would make a false claim about
  symmetry the content does not keep. Full point, not `hairlineWidth` — a
  10pt vertical hairline disappears at some Android densities, and a group rule
  nobody can see does not group.
- **A card that overflows scrolls; it must never truncate.** The five parts are
  prose, so at large Dynamic Type — and at default type for four cards today —
  a card outgrows its page. `CardFrame` arms an inner `ScrollView` when that
  happens, and getting the measurement right means adding `COLUMN_PAD_V` back:
  the column's padding lives on the `contentContainerStyle`, outside the view
  being measured. `nestedScrollEnabled` is on (Android defaults it off, which
  silently disabled the whole mechanism), and `CardPager` corrects any resting
  offset the handoff leaves behind. The cost is one extra swipe to leave a tall
  card; the alternative was losing the source caption off the bottom.
  When an inner card actually consumes a gesture, `CardPager` pins the parent
  to its current page before Android can apply the gesture's leftover momentum;
  the next swipe from the inner scroll's end may page normally. This prevents
  one gesture both scrolling the card and skipping it, or parking the deck
  between two cards.
- **A card arrives; it does not appear.** `CardFrame` runs the same
  scroll-linked opacity + translate as `ArticlePage` (incoming rises 14pt,
  outgoing leaves 6pt — the asymmetry is what makes it read as arrival). Use
  the shared interpolation rather than a mount animation: with three pages held
  in a list, a mount animation plays two screens away and is over unseen.
  Gated on `useReducedMotion()`, like the reader's.
- The four categories are a vertical ordering inside `news`, not lanes — see
  `lib/news-order.ts`. The globe lives on `news` only: it is the backdrop to
  the stories it locates, and there is nothing on a wheat price for it to
  point at.
- For new screens, wrap in `<Screen edges={...} padded>` to get bg + safe-area + padding for free.

### Onboarding (contextual hint pills + notification primer)
- **No tutorial mode, no synthetic content.** Never inject fake/self-referential content (welcome articles, sample data) into the feed — teaching happens on REAL articles the reader is already looking at. This was tried and rejected.
- **Hint pills** (`components/HintOverlay.tsx`): one small-caps `labelSm` line on an INVERTED pill (`colors.text` fill + `tone="inverse"` text — monochrome flipped for maximum visibility; the quiet `pillBg` recipe was tried and got overlooked), bottom-centered, ONE at a time, ever. Triggered one per article read (`hooks/useOnboardingHints.ts`: swipe after ~8s on the first article, sources on the 2nd, bookmark on the 3rd, globe on the 4th — sparser gates were tried and read as "no tips at all"), retired forever by performing the action or tapping the pill, expired after 3 ignored sessions. State in `lib/onboarding-store.ts` (bookmark-store pattern). No icon, no dome gold — a hint is chrome whispering, not the accent speaking. Don't add new always-on chrome for teaching; extend this system.
- **Notification primer** (`components/NotificationPrimerSheet.tsx`): the OS permission dialog is never fired cold. The one-time primer sheet (presented at the first "caught up" moment, session 2+) is the only ask path; the MenuSheet toggle is the durable control. Any new permission ask must follow this soft-primer shape.
- **Replay**: settings has a "show tips again" row → `resetOnboarding()` (re-arms hints + reading depth; never re-arms the primer).

## Anti-patterns (don't)

- Inline hex codes (`#141414`, `#e8e8e8`) — always via `useTheme().colors` or `tone`.
- Setting `fontSize` or `lineHeight` in a component — use a variant, or add one.
- A second font family. The app ships Source Sans 3 only.
- Decorative icons just to pad a label. Use words.
- Shadows, gradients, box-shadows (except the `ArticlePage` globe-fade backdrop gradient and the `BriefingBar` iOS frosted-glass — see §Native chrome carve-outs).
- Raw `@expo/vector-icons` or `expo-symbols` imports outside `Icon.tsx`.
- Introducing a styling library (NativeWind, Unistyles, Tamagui, Restyle). Vanilla StyleSheet + theme hooks is the decision — documented, don't re-litigate.

## Native chrome carve-outs

The "no native chrome" rule has two specific, intentional carve-outs:

- **Icons on iOS resolve to SF Symbols.** `components/primitives/Icon.tsx` switches on `Platform.OS`: iOS renders the matching SF Symbol via `expo-symbols` (sharper optical sizing, automatic tinting, system feel); Android renders Ionicons. The public `<Icon name="..." size="sm|md|lg" tone="..." />` API stays unified — call sites pass an Ionicons name and the mapping table in `Icon.tsx` resolves to SF Symbol on iOS. An Ionicons name not in the mapping table silently falls back to Ionicons on both platforms — no missing-glyph placeholder.
- **BriefingBar uses iOS frosted glass.** The floating audio chrome over the article reader uses `BlurView` (`tint="systemThinMaterial"`) on iOS so the bar reads as a native floating surface. Android keeps a solid `pillBg` fill because Android's BlurView implementations are uneven. This is the only sheet-or-bar surface allowed to blur — editorial sheets stay typography-first.

## Accessibility checklist

Every interactive element must have:

- `accessibilityRole` — `button`, `link`, `tab`, `radio`, `switch`, `adjustable`, `search`, `alert`, `header`.
- `accessibilityLabel` — what it is. `accessibilityHint` — what happens when activated, if not obvious.
- `accessibilityState` — `selected`, `expanded`, `disabled` when applicable.
- `hitSlop` — use `HIT_SLOP` default. `IconButton` applies it automatically.
- Dynamic Type — `VARIANT_CAP` auto-applies; override via `maxFontSizeMultiplier` only with reason.
- Reduce Motion — *discrete* animations must gate on `useReducedMotion()`. Look at `Toast`, `BriefingBar`, `QuizBlock`, `LocationsBlock`, `MiniGlobe` (zoom + tap pulse) for references. See also the memory note on battery saver.
  - **Exempt: motion that tracks direct manipulation.** The `CategoryBar` tab indicator follows `pagerOffset` under the user's finger, and `ArticleList`'s `bgFade` follows scroll position. Reduce Motion targets discrete, decorative, or unexpected motion; snapping a finger-tracked indicator reads as broken, not accessible. Gate the transition, not the tracking.
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
