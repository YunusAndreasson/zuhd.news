---
paths:
  - "public/style.css"
  - "public/get.html"
  - "public/404.html"
  - "public/islands/**"
  - "templates/**"
  - "scripts/lib/colour-system.test.js"
  - "scripts/lib/contrast.js"
---

# Type and colour

One type scale and two palettes, each declared once in `public/style.css`.
`scripts/lib/colour-system.test.js` holds the colour rules. It runs under
`npm run verify` and in CI (`test:unit`), not in the build.

## Type

- Set sizes through the `--type-*` roles, backed by rem steps in `--size-*`.
  The chart axis keeps its 11px floor.
- Use `--type-label` (12px/600) for caps, `--type-item` (15px/500) for
  controls and names, and `--type-figure` (15px/600) with `--figure-numerals` for readings.
- Prose uses `--type-copy` (19px/400), ledes `--type-lede` (25px), headings
  `--type-heading` (31px), and display titles `--type-title` (60px/650).
- H1s and display titles take `--weight-title` and `--track-display` (−0.035em).
  Use `--track-heading` at 25–40px, `--track-item` at 18–20px, and `--track-caps` (+0.08em) for caps.
- Quiet is an ink step, never `opacity`. The colour test cannot measure
  opacity, so for controls that were caught dimmed (`.map-seam-toggle`,
  `.map-range`, `.map-markets-age`, `.map-markets-level`, `.map-mapctl`) it
  asserts there is none. Add a control there when it must stay legible.
- Metric names are lower case in `shared/` (the app and the APIs read them);
  the web prints them through `metricName` (`_map/format.ts`).
- A label the phone sets in small caps stays lower case in its source, and the
  desktop draws the capital with `::first-letter`, which needs a block box (an
  `inline-block` span). A one-word label in a shrink-to-fit box takes
  `text-transform: capitalize` instead: Gecko sizes the box from the lowercase
  word and the capital overflows it.
- No test pins sizes. Check a size change in a browser.
- The italic face is `font-display: swap` and nothing preloads it. Keep italics
  for prose (`em`, a quotation): chrome set in italic fetches 78 KB for a word.
- An article or archetype page has one column (`--page-column`,
  `--page-gutter` on `body`). Never `ch`: it is a different length on each box.

## Motion, focus and the fallback face

- Every transition names a `--dur-*` and an `--ease-*` token; a hover comes
  in at `--dur-instant` (the `@media (hover: hover)` rule) and fades at
  `--dur-fast`. Never transition `width`, `height` or `font-weight`.
- One focus ring: `--ring-width` at `--ring-offset` in `--focus`
  (`--map-focus` on the dark pages). A control's own `:focus-visible`
  restates the tokens, never a pixel width.
- `Source Sans 3 Fallback` is Arial scaled to the webfont at its 95%:
  re-measure its `size-adjust` and overrides if the face or that 95% moves.

## Colour

- Use `--ink-heading`, `--ink-prose` and `--ink-quiet` for emphasis, body
  and metadata. Reserve `--ink-inactive` for off controls. Map and doc chrome use the `--map-ink-*` roles.
- `:root` follows the reader with `light-dark()`. The map and documents pin dark.
  Every dark page shares `--ground-dark` with the canvas and `--panel-dark` for floating cards.
- Separate rows with `--line-divider` (8% black / 7% white) and enclose panels
  with `--line-edge` (14%). The map equivalents use the `--map-line-` prefix. Links underline in ink.
- Keep colour literals in the two palette blocks. Hairlines use `rgb(… / …%)`
  and the contrast test composites them over the surface. Shadows may use alpha black.
- `--brand` is the gold mark, `--accent` neutral, and `--pos` and `--neg` signed changes.
  `light-dark()` takes colours, including the two ends of a scrim.
- Every ink clears AA (4.5:1) on every surface of its palette in both
  schemes, and focus rings clear 3:1. The test checks combinations no rule
  uses yet, on purpose.
- The seam with MapLibre: `_map/style.ts` paints the canvas and CSS the
  chrome, and neither can import the other. The test holds the shared values
  equal: `MAP_COLOURS.space` and `--map-ground`; `OVERLAY_COLOUR.straits` and
  `.straitsSurge` and `--map-straits` and `--map-straits-surge`; `marketUp`
  and `marketDown` and `--map-pos` and `--map-neg`. Stale readings use quiet ink.
- Category and overlay hues are not duplicated: a chip receives its layer's
  value inline as `--cat`, so it cannot disagree with its mark. The four
  categories share one OKLCH lightness; only the hue says which.
- Whatever floats over the map (control box, popup, group panel, sheet) takes
  `--map-line-card` and `--map-radius`; a control inside it `--map-radius-ctl`.
- `.map-sheet` re-points the site's tokens at the map's, so a card rule
  written in `--text` or `--rule` is already on the map palette.
- A new map control joins the one focus-ring list (`.map-range:focus-visible`
  and its siblings), or the browser draws its own ring there.
