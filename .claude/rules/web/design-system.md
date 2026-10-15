---
paths:
  - "public/style.css"
  - "public/islands/**"
  - "templates/**"
  - "scripts/lib/colour-system.test.js"
  - "scripts/lib/contrast.js"
---

# Type and colour

One type scale and two palettes, each declared once in `public/style.css`.
`scripts/lib/colour-system.test.js` holds the colour rules. It runs under
`npm run verify`, not in CI and not in the build.

## Type

- One scale in `:root`: 11 / 12 / 14 / 16 / 18 / 20 (`--size-base`, body
  copy), then 25 / 31 / 40 / 52 / 68 for editorial mass.
- No `font-size` literal: every size is a `--size-*` step.
- Quiet is an ink step, never `opacity`. The colour test cannot measure
  opacity, so for controls that were caught dimmed (`.map-seam-toggle`,
  `.map-range`, `.map-markets-age`, `.map-markets-level`, `.map-mapctl`) it
  asserts there is none. Add a control there when it must stay legible.
- Metric names are lower case in `shared/` (the app and the APIs read them);
  the web prints them through `metricName` (`_map/format.ts`).
- Four text roles. Heading: `--size-2xs`, 600, small caps, `--track-caps`.
  Item (a row's name, a link, a control): `--size-xs`, 400, sentence case.
  Figure: `--size-2xs`, tabular. Qualifier: `--size-2xs`, a muted ink. Small
  caps and 600 mean heading and nothing else.
- Tracking is a `--track-*` token; small caps take `--track-caps`.
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

## Colour

- The site palette (`:root`) follows the reader: four inks, two surfaces, two
  rules, and the marks `--accent` (neutral), `--brand` (gold, the one
  chromatic mark), `--pos` and `--neg`, `--focus`, `--scrim`. Tokens are
  `light-dark()` pairs, `--brand` included: one gold hue, darkened on white to
  clear 3:1. There is no `[data-theme]` and no second dark block.
- A rule is a divider, never a link's underline: that takes an ink.
- `light-dark()` is a colour function. `opacity: light-dark(0, 0.85)` is an
  invalid declaration and is dropped silently.
- The dark-surface palette (`body.map-page, body.doc-page`) is for the two
  page types that are dark whatever the reader prefers. It is not the site in
  dark mode: it is blue-grey chrome built to sit under saturated data marks.
- No hex or `rgba()` literal outside those two blocks. The test does not see
  the `rgb(… / a)` form the box shadows use; do not use that form for
  anything else.
- Every ink clears AA (4.5:1) on every surface of its palette in both
  schemes, and focus rings clear 3:1. The test checks combinations no rule
  uses yet, on purpose.
- The seam with MapLibre: `_map/style.ts` paints the canvas and CSS the
  chrome, and neither can import the other. The test holds the shared values
  equal: `MAP_COLOURS.space` and `--map-ground`; `OVERLAY_COLOUR.straits` and
  `.straitsSurge` and `--map-straits` and `--map-straits-surge`; `marketUp`
  and `marketDown` and `--map-pos` and `--map-neg`. `--map-stale` mirrors
  `MAP_COLOURS.neutral` and nothing checks it.
- Category and overlay hues are not duplicated: a chip receives its layer's
  value inline as `--cat`, so it cannot disagree with its mark. The four
  categories share one OKLCH lightness; only the hue says which.
- Whatever floats over the map (control box, popup, group panel, sheet) takes
  `--map-line-card` and `--map-radius`; a control inside it `--map-radius-ctl`.
- `.map-sheet` re-points the site's tokens at the map's, so a card rule
  written in `--text` or `--rule` is already on the map palette.
- A new map control joins the one focus-ring list (`.map-range:focus-visible`
  and its siblings), or the browser draws its own ring there.
