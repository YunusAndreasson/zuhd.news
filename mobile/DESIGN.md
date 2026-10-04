# Mobile Design System

The reference for choosing a variant, a token or a motion. Values are in
`constants/theme.ts`, the philosophy in root `foundation.md`, and the
non-negotiables (hex, `fontSize`, icons, typeface) in `CLAUDE.md`.

How the screen behaves is in the repo root's `.claude/rules/mobile/`, which
loads with the files it covers; this document is what things look like.

## Voice

- Hierarchy comes from type and whitespace, not from colour.
- Colour carries meaning only. `dome` gold is the one brand accent.
- Quiet is an ink step (`text`, `accent`, `textSecondary`), never opacity.
- A kicker's status word (`new`, `earlier`, `current`) is an ink step, never
  a move's colour.

## Tokens — `constants/theme.ts`

| Token | Role |
|---|---|
| `bg`, `sheetBg` | The screen's ground; a sheet's ground |
| `pillBg`, `playerBg`, `toastBg` | A button's or current row's fill on a sheet; solid chrome over the globe or text; toast |
| `textEmphasis`, `text`, `accent`, `textSecondary` | Inks, strong to quiet; `accent` is not a brand colour |
| `rule` | Every hairline |
| `tone*Text` | Sentiment inks |
| `mark*`, `categoryText*` | Globe marks, in the web map's hues; a category's word |
| `SPACING` | `articlePadding` insets the reading column, `screenPadding` sheets |
| `GAP`, `RADIUS`, `FLAG`, `OPACITY` | Named tiers; never a literal |
| `ICON` | Four sizes; `xs` only for a move chip's caret |
| `HIT_SLOP`, `INLINE_HIT_SLOP` | Tap targets; the second for links in prose |

`ErrorBoundary` renders above `ThemeProvider`, so its inline styles are the
one exception.

### Sentiment / severity color

- A move is green up, red down and slate unmoved. `moveTone`
  (`lib/valence.ts`) decides wherever a `DeltaChip` prints one, returning
  `rise`, `fall` or `neutral`; the globe's marks draw up and down in the same
  two inks. A second colour rule is the regression.
- Colour never says what a move means; the card's prose does.
- Slate is a colour: an unmoved reading never takes its label's ink. A
  contract's points are always slate, because odds are never tinted.
- Quote the quantity whose sign matches its meaning: a currency's own move,
  not its rate against the dollar.
- The tone inks share one luminance (`__tests__/palette.test.ts`).
- Severity is single-tier. `severityTint` (`lib/severity.ts`) gives
  `toneUnfavorableText` only to a Red GDACS alert or a conflict event with
  deaths. Lower tiers are monochrome.
- A chart's reference line is secondary ink, dashed, never gold or rose.

## Primitives — `components/primitives/`

| Primitive | Purpose |
|---|---|
| `Text` | All text: `variant`, `tone`, `scale` |
| `Stack` | Flex layout with a `gap` |
| `Box` | Background, radius, hairline (`rule`) |
| `Screen` | Screen scaffold |
| `Pressable` | Spring press, no haptic; `tapSlop` where swipes start |
| `IconButton` | Icon-only button with `HIT_SLOP` |
| `Icon` | One icon API for both platforms |
| `Markdown` | Inline bold, italic and links (`openLink`) |

Raw RN `Pressable` with `PRESSED_STYLE` is for static chrome only. There is
no `Divider` or `Button`: use `Box rule`, or `Pressable` around a `label` text. Add
a primitive at the third caller.

## `<Text>` variants

| Variant | Role |
|---|---|
| `display` | A card's reading; an event sheet's focal number |
| `title` | An opened story's title, a sheet's subject |
| `rowTitle` | A headline in a list; a menu row's title |
| `lead` | A prose page's opening paragraph |
| `body`, `bodyEmphasis`, `bodyItalic` | Prose; source and mark names, a row's reading; italic terms |
| `caption` | Metadata sentences, never pages of prose |
| `captionEmphasis` | Toast and pill labels, action words |
| `label`, `labelSm`, `labelXs` | Caps: sheet titles, section labels, metadata |
| `labelXsTight` | One caps line beside its move: the gauges |
| `tabular`, `tabularEmphasis` | Time and count readouts; scrub tooltips |
| `sectionHeading` | The italic line over a group of sources |
| `wordmark` | The app's wordmark |

- UI copy is typed as it prints (`today’s`); a straight `'` on screen is a
  bug.
- A link is never quieter than its sentence: the body's ink, underlined.

## Patterns

### Sheets

- Build a sheet from `SheetLayout`, its title in the handle (`handleTitle`),
  never in the body.
- Pass a custom handle as the `handle` element, never as `handleComponent`:
  a platform sheet drops it, with the title and the back chevron.
- Content scrolls in `SheetScrollView` or `SheetFlatList`
  (`SheetContent.tsx`), which own the flex and the safe-area tail.
- Any other scrollable in a content-sized sheet takes `flexShrink: 1`.
  `flex: 1` collapses it; it is right only under `snapPoints` (`CardSheet`).
- Pages are a stack (`useSheetNavigation`). Back is wired three ways:
  `SheetHandle`'s `onBack`, the swipe (`useSheetBackNavigation`), and
  `onBackPress` on `SheetLayout`, since an Android dialog takes Back first.
- One platform sheet at a time, chained through `handOffSheet`; iOS rejects
  a present during a dismissal.
- Android: a closing sheet swallows taps for half a second, and a sheet has
  only a half and a full stop.
- A sheet with a text field passes `avoidKeyboard`: Android lifts it.
- `selectable` text goes through the `Text` primitive. A raw RN `Text` paints
  a focus band when an Android sheet opens.
- Two spacing tiers: `SPACING.md` between paragraphs, `SPACING.lg` before a
  headed section.
- Prose pages: opening paragraph `lead`, sections `labelSm` over `body`, never
  `caption`. Links are `SheetLink`.
- An event sheet is `SheetHero`, `SheetFlagRow` and `SheetSourceFooter`.

### Rows

- `MenuRow`: a `rowTitle`, an optional `caption`, an optional `figure`, then
  what a press does: `push`, `leave`, a `Toggle`, or nothing. At least
  `LAYOUT.rowMinHeight` tall. `SectionLabel` names a group.
- A list of links is `MenuRow`s with `leave`. A choice among a few is a
  `SegmentedControl`.
- `InstrumentRow`: title over a `caption` and a date; at the right the
  reading, its unit and a `DeltaChip`. In a list with flags, a row without
  one keeps the slot.
- `MarkRow`: the globe's own glyph, a name and one line.
- `SourceRow`: only the header is the button, so the details can be selected.
- A menu row never appears or leaves while the menu is open. A list that
  loads late must hold its row from the start and keep it if the fetch fails.
- A unit every row shares is said once, over the list.

### Cards (the card tiers)

`CardFrame` is the shell. One `labelXs` line of metadata (the kicker and the
date) sits above four tiers, in this order:

- The answer: the reading in `display` over one `caption` row, the unit and
  the `DeltaChip`.
- The subject: `title`. On a `belief` or `scheduled` card it comes before the
  reading: a percentage means nothing without its question.
- The picture: the chart, its labels `labelXs` or `tabular`.
- The account: `body` analysis, one `caption` sentence, the cited stories,
  the source.

No fifth tier, no second metadata line, no dividers between tiers. Space
groups them:
`SPACING.md` before the chart, `SPACING.lg` before the account.

- The card's move is the chip. The caption sentence carries only what the chip
  cannot: a second window, a ratio's two parts. A level it is measured against
  (a strait's normal) is a dashed line on the chart (`CardSeries.reference`).
- A fact appears once: no figure rows for series the chart names.
- A title scales and a long reading shrinks; neither is cut.

### Charts and blocks

- `TrendBlock` is the chart for cards, sheets and stories: `variant="context"`
  on a card or sheet, `variant="inline"` under a story (the line alone, no
  scrub). `TrajectoryChart` is the country cards'.
- `StoryChart` sits in `OddsLine`'s frame, ruled and never filled, and
  replaces the odds line.

### The map screen

- `app/index.tsx` is the only route. Anything else is a sheet.
- The top bar's ground is a gradient of `bg` (`Shade` in `MapHeader`), never
  a plate. Keep `SHADE_ROW` at 0.82 or above: under it, secondary ink over
  city lights fails AA.
- A gauge is a `labelXsTight` label in default ink beside its move. The open
  card's slot takes a 2pt `textEmphasis` bar. No ticker.
- Card inks: kicker `labelXs`, its category word in `categoryText*`; `title`
  and the lede in emphasis ink; blocks in `text`; footer words
  `captionEmphasis` in `accent`, `saved` in emphasis.
- Card text never clamps; it scrolls. Only the kicker is cut to one line.
- Chrome that floats over card text (`‹ n new`, the scrub tooltip) is solid
  `playerBg` with a `rule` edge. `pillBg` lets the text through.

### The story card's spacing ladder

Space groups the card. Add no labels and no rules between blocks.

- Line: the variant's leading alone.
- Paragraph: 0.5 em under every block (`mdStyles.sentence`).
- Lede: 1 em under the hook (`mdStyles.lede`); it groups title and lede.
- Section: `AFTER_PROSE_GAP` over the last block's own gap, about
  `SPACING.lg`, before the chart or odds line. The thread line closes it.
- Set nothing in a story's last `SPACING.md`: the footer's fade covers it.

### Onboarding

- Teach on real stories. No tutorial mode, welcome article or sample data.
- A hint pill (`HintOverlay`) is only for what the screen does not say: the
  swipe, the globe's lights, the wordless `▶`. One at a time. Don't add
  always-on chrome to teach.
- The pill is inverted: `colors.text` fill, `labelSm` in `tone="inverse"`, no
  icon, no accent. A quiet pill was overlooked.
- `HINT_COPY` must be true of the current gestures. A wrong hint costs trust.
- A hint retires when its action is done, when it is tapped, or when any
  swipe or story open begins. It leaves after `HINT_VISIBLE_MS` and expires
  after `MAX_HINT_SHOWS` sessions.
  Screen readers get none.
- Never fire an OS permission dialog cold. `NotificationPrimerSheet` asks
  once; `resetOnboarding` re-arms hints, never the primer.

## Motion

- Every spring states its physics: a `mass`, or a `duration` with a
  `dampingRatio` (`__tests__/motion-tokens.test.ts`).
- Reduce Motion is the library's job. Reanimated animations default to
  `ReduceMotion.System` and jump to their end, so a discrete animation needs
  no `useReducedMotion()` branch. Check in JS only what Reanimated cannot
  see: a timer, an RN `scrollTo({ animated })`, an initial value.
- `KEEP_MOTION` is only for what must not snap: a spring released from a
  finger, and the cross-fade that stands in for movement (the tap ring).
- Motion that tracks a finger is exempt. Gate the transition, not the
  tracking, and prefer a cross-fade to no feedback.
- Camera moves ease on `EASING.camera`.

## Haptics

A haptic answers a finger, and only when it tells the hand something the eye
might miss. Never an ordinary press or a move the app makes itself. One
event, one haptic (`lib/haptics.ts`).

| Call | When |
|---|---|
| `hapticSwipe` | A sideways swipe landing |
| `hapticTick` | A threshold crossed under a finger, a sheet released onto a stop, a pick |
| `hapticImpact` | A globe tap that hit; a notch per story on the track |
| `hapticNotification` | State committed: saved, removed, erased, caught up |
| `hapticError` | What could not be done |

Android uses `performAndroidHapticsAsync` only.

## Anti-patterns

- A `lineHeight`, spacing literal or opacity decimal in a component.
- An icon that only pads a label.
- `expo-symbols` imported outside `Icon.tsx`.
- A shadow, blur or gradient outside the carve-outs.
- Opacity that quiets text meant to be read.

## Native chrome carve-outs

Five. Nothing else in the app's chrome gets a blur or a gradient. The globe's
marks and their row glyphs are drawn as the map draws them, and sheets are the
platform's.

1. Icons on iOS are SF Symbols, mapped from Ionicons names in `Icon.tsx`.
2. `BriefingBar` is frosted glass on iOS, the only surface that blurs.
   Android gets solid `playerBg`.
3. The top bar's shade (`MapHeader`): a gradient of `bg`, a legibility scrim.
4. The resting story's veil (`StoryCard`): a gradient over text not meant
   to be read at rest.
5. The footer fade (`StoryFooter`): the sheet's ground over the last
   `SPACING.md` of a story scrolling behind its action row. No story text
   is set under it.

## Accessibility checklist

- `accessibilityRole` and `accessibilityLabel` on every interactive
  element; `accessibilityHint` where the result is not obvious.
- `accessibilityState` for selected, expanded and disabled.
- A tap target of `HIT_SLOP` or `LAYOUT.rowMinHeight`.
- No `maxFontSizeMultiplier` override without a reason.
- An `adjustable` control states its position in `accessibilityValue`.
- A change with no focus on it goes through `announce()`.
- Reduce Motion as in Motion; motion that tracks a finger is exempt.
- AA contrast (4.5:1 for body text) in both themes, at default and largest
  text.

## Adding a component or a variant

A component: compose primitives, give every text a variant, use `tone`
before a colour and `scale` before a size, then run the checklist.

A variant: only for a distinct role, named for it (`rankDigit`, not
`xsBoldAccent`). Add it to `makeTextVariants` with a JSDoc line, give it a
`VARIANT_CAP`, add a row above, and migrate the call sites.

## Globe detail

- Shape says what a mark is, so its state survives without colour: a strait
  pinches or bows (`STRAIT_BULGE`), a hazard grows with its level
  (`gdacsGlyphScale`). The thermal burst is the only radial mark.
- A mark's size is a rank or a level, never a raw figure: a story's coverage
  rank in the day, a hazard's level, a conflict mark's dead.
- The story's place is the largest label (`DOT_LABEL_PT`). Countries are
  small caps; water and straits are italic.
- A mark's name is `text` ink, never the move's colour. The move sits under
  it, larger (`MARK_VALUE_PT`), in its colour.
- A story count is `textEmphasis`; a conflict count is `markConflictText`.
- Quiet neighbour labels never go under `ANCHOR_LABEL_OPACITY_LIGHT`/`_DARK`:
  the one place opacity quiets text.
- Capitals and lakes over `LAKE_FILL_MIN_AREA` show at every zoom, on settled
  frames. Rivers
  show at rest under `RIVERS_REST_CLIP`, always under `RIVERS_APPEAR_CLIP`.
- Land, borders, ice and the highlight share one tier (`geographyTier`).
- The grid and the `daylight` lift are drawn under the land. The grid is 0.8
  wide; thinner vanishes.
