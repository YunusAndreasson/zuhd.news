# Mobile Design System

Typography-first, dark-default, hairline-everywhere. Source Sans 3 only. `#c9a84c` dome gold as the sole accent. Hierarchy through type, not color.

See root `foundation.md` for the philosophy. This document is the operational reference: tokens, primitives, rules. If you're building or changing UI in `mobile/`, read it.

## Voice

One typeface family. Whitespace is designed. Color carries meaning only — every non-monochrome element must justify its hue. No shadows, no gradients except the top/bottom globe fades, no decorative icons. Restraint is the brand.

## Tokens — `constants/theme.ts`

All design tokens live in one file. Components consume via `useTheme()`.

| Token group       | Export                                          | What it is                                    |
|-------------------|-------------------------------------------------|-----------------------------------------------|
| Colors            | `DARK_COLORS`, `LIGHT_COLORS` (via theme hook)  | 15 semantic keys — never inline a hex         |
| Typography        | `makeTypography` → `sizeBase`, `sizeLg`, etc.   | Responsive scale + leading + `trackingCaps` / `trackingHeading` / `trackingWordmark` |
| Variants          | `makeTextVariants` → 13 roles                   | The `<Text variant>` catalog (see below)      |
| Variant caps      | `VARIANT_CAP`                                   | Dynamic Type ceiling per variant              |
| Spacing           | `SPACING` (xxs → xxl + screenPadding)           | Four-pt-ish scale                             |
| Gap tokens        | `GAP` (none, tight, row, item, group, section)  | Named Stack gap tiers derived from SPACING    |
| Radii             | `RADIUS` (handle, pill, floating)               | Three semantic tiers, intent-named            |
| Icons             | `ICON` (sm=14, md=20)                           | Two-tier. Anything else is a mistake.         |
| Flag emoji        | `FLAG` (chip=16, row=18, display=32)            | Pictogram sizing — flags aren't type          |
| Animation         | `ANIMATION`, `EASING`                           | Durations, spring configs, Reanimated easings |
| Opacity           | `OPACITY`                                       | Named tiers — never inline decimals           |
| Hit slop          | `HIT_SLOP`                                      | Standard expanded tap target                  |
| Tones             | `TextTone` + `toneColor(tone, colors)`          | Semantic color override (`default`, `secondary`, `accent`, `emphasis`, `dome`, `favorable`, `unfavorable`, `neutral`) |
| Title scale       | `titleFontScale(length)`                        | Encapsulates "shrink long titles"             |

### Rules

- **Never write a hex code** in a component. Pull colors from `useTheme().colors` or pass a `tone` to primitives.
- **Never write a `fontSize`** in a component. Use `<Text variant>`; if you need to shrink, use the `scale` prop. If no variant fits, add a new one to `theme.ts` (with a comment explaining the editorial role).
- **Never write a raw spacing literal** (e.g. `padding: 12`). Use `SPACING`, `GAP`, or a primitive's padding prop.
- **Never import `@expo/vector-icons` directly**. Go through `<Icon>`.
- **Never set decorative `fontFamily`** (bold/semibold/italic) in a component for a role that exists as a variant. Font overrides via `font.X` are an escape hatch, documented with a comment when used.
- `fontVariant: ['oldstyle-nums']` / `['tabular-nums']` as style overrides are allowed — they're orthogonal to typography size/weight and some variants need them situationally.

## Primitives — `components/primitives/`

Seven primitives. Composition over configuration.

| Primitive    | Purpose                                  | Key props                                                                  |
|--------------|------------------------------------------|----------------------------------------------------------------------------|
| `Text`       | All text — variants + tone + scale       | `variant` (required), `tone`, `scale`, `numberOfLines`, `selectable`       |
| `Stack`      | Flex layout                              | `direction`, `gap`, `align`, `justify`, `padding*`, `fill`, `wrap`         |
| `Box`        | Decorative container                     | `background`, `radius`, `padding*`, `rule` (`top`/`bottom`/`left`/`right`) |
| `Screen`     | Top-level screen scaffold                | `edges`, `padded`                                                          |
| `Pressable`  | Full-bleed row press (spring + haptic)   | `onPress`, `haptic`, all RN Pressable props                                |
| `IconButton` | Icon-only chrome button                  | `onPress`, `accessibilityLabel`, icon child                                |
| `Icon`       | Ionicons wrapper — two sizes + tone      | `name`, `size` (`sm`/`md`), `tone`                                         |

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
- Use `SheetLayout` (wraps `BottomSheetModal` with theme-styled background) + a `SheetHandle` for the drag indicator. `MenuSheet`, `ContextSheet`, `CountrySheet`, `ChokepointSheet`, `SourcesSheet` are the references.
- Content wraps in `BottomSheetScrollView` with `sheetStyles.content` padding.
- Swipe-back and Android hardware back are already wired in `MenuSheet` — copy that pattern for multi-page sheets.

### Blocks (`components/blocks/`)
- Each block type has a component. `renderBlocks(blocks, opts)` (in `blocks/index.tsx`) dispatches from data to UI.
- Every block accepts `variant: 'article' | 'context'` — full-bleed vs embedded-in-timeline sizing.
- `blockContainerStyle` (in `blocks/shared.ts`) supplies the outer margin rhythm. Use it.

### Screens
- Root `app/index.tsx` is the only route. Overlays use sheets, not pushed routes.
- For new screens, wrap in `<Screen edges={...} padded>` to get bg + safe-area + padding for free.

## Anti-patterns (don't)

- Inline hex codes (`#141414`, `#e8e8e8`) — always via `useTheme().colors` or `tone`.
- Setting `fontSize` or `lineHeight` in a component — use a variant, or add one.
- A second font family. The app ships Source Sans 3 only.
- Decorative icons just to pad a label. Use words.
- Shadows, gradients, box-shadows (except the two globe-fade gradients in `ArticlePage`).
- Raw `@expo/vector-icons` imports outside `Icon.tsx`.
- Introducing a styling library (NativeWind, Unistyles, Tamagui, Restyle). Vanilla StyleSheet + theme hooks is the decision — documented, don't re-litigate.

## Accessibility checklist

Every interactive element must have:

- `accessibilityRole` — `button`, `link`, `tab`, `radio`, `switch`, `adjustable`, `search`, `alert`, `header`.
- `accessibilityLabel` — what it is. `accessibilityHint` — what happens when activated, if not obvious.
- `accessibilityState` — `selected`, `expanded`, `disabled` when applicable.
- `hitSlop` — use `HIT_SLOP` default. `IconButton` applies it automatically.
- Dynamic Type — `VARIANT_CAP` auto-applies; override via `maxFontSizeMultiplier` only with reason.
- Reduce Motion — animations must gate on `useReducedMotion()`. Look at `Toast`, `BriefingBar`, `QuizBlock`, `LocationsBlock` for references. See also the memory note on battery saver.
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
- Haptics — `mobile/lib/haptics.ts`
