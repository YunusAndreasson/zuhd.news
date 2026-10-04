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
- No test pins sizes. Check a size change in a browser.

## Colour

- The site palette (`:root`) follows the reader: four inks, two surfaces, two
  rules, and the marks `--accent` (neutral), `--brand` (gold, the one
  chromatic mark), `--pos` and `--neg`, `--focus`, `--scrim`. Tokens are
  `light-dark()` pairs (`--brand` is one value). There is no `[data-theme]`
  and no second dark block.
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
  equal: `MAP_COLOURS.ocean` and `--map-ground`; `OVERLAY_COLOUR.straits` and
  `.straitsSurge` and `--map-straits` and `--map-straits-surge`; `marketUp`
  and `marketDown` and `--map-pos` and `--map-neg`. `--map-stale` mirrors
  `MAP_COLOURS.neutral` and nothing checks it.
- Category and overlay hues are not duplicated: a chip receives its layer's
  value inline as `--cat`, so it cannot disagree with its mark.
