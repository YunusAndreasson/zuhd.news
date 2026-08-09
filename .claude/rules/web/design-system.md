---
paths:
  - "public/style.css"
  - "public/islands/**"
  - "templates/**"
  - "scripts/lib/colour-system.test.js"
  - "scripts/lib/contrast.js"
---

# Type and colour

Two palettes and one type scale, each declared once. `colour-system.test.js`
fails the build on a colour literal outside those blocks.

## Type

One scale, in `:root`: **11 / 12 / 14 / 16 / 18 / 20**, then 25 / 31 / 40 / 52 / 68
for editorial mass. `--size-base` (20px) is body copy and has never moved; every
rung below it went up one step on 2026-07-27, and `--size-md` (18px) is new.

- **The small end was a floor, not a scale.** The three rungs the chrome is built
  from were 12 / 12 / 11px on a bottom rung of 10, and between `--size-sm` (14)
  and `--size-base` (20) sat a 6px gap with nothing in it. So everything that was
  not body copy fell to 11–14px and stayed there, because there was no rung to
  promote it *to*: the map's story headlines, the whole HUD, the money ribbon,
  the footer, and on the article page the kicker, the share row, the pagination
  and the isnad — a sentence the site publishes about itself, set two rungs under
  the prose it certifies. Nothing was renamed, so the ~200 call sites rose
  together and the relationships the three-rung rule encodes are untouched: a
  legend is still a step under the control it explains.
- **The literals were the real floor.** A scale only binds what uses it, and the
  smallest type on the site was off it entirely — `.map-feed-title` at `0.9rem`
  (the rail's *headlines*, smaller than the article page's kicker),
  `.map-popup-lead` at `0.85rem`, `.map-country-metric` at `0.82rem`. Those are
  the map's reading surfaces. They are all on the scale now, and
  `font-size: 0.8x rem` should not come back; `--size-md` exists because
  `.map-popup-title` wanted 18 and the ramp had no such step.
- **Quiet is an ink step, never opacity.** The rule the filter chips and the
  scrubber head already followed, with the footer as the last holdout:
  `.footer-links` was `--text-secondary` at `opacity: 0.5` (**2.73:1**) and
  `.footer-social a` at `0.62 × 0.85` (**2.21:1**) — both under AA, on the only
  links that reach /about, /contact and /privacy. `colour-system.test.js` cannot
  see this class of bug, because opacity is not a colour literal. That is what
  makes it worth restating rather than assuming.
- **The footer was not the last holdout** (2026-08-02). `.map-seam-toggle` — the
  fold button on the pane seam, and the *only* control that reopens a folded
  rail — was `--map-ink-dim` at `opacity: 0.5`. Measured off the rendered page:
  **2.97:1** on the left seam, under the 3:1 that WCAG 2.2 SC 1.4.11 sets for a
  control and that this site already holds its focus rings to. The comment
  directly above it read *"a control nobody can see is a control nobody has"* —
  the rule stated correctly and then implemented in the one channel nothing
  could check. Both states are ink now (**5.53:1** measured after), and the
  element opacity had also been halving the border that says the thing is a
  button. **A rule with no reader is a comment**, so the fix ships with one:
  `colour-system.test.js` asserts *structurally* that this control carries no
  `opacity` at all, precisely because what it cannot do is measure one. The grip
  hairline beside it keeps its alpha deliberately — decoration on a 9px drag
  target rather than the control, and no token reproduces the 2.41:1 it was
  tuned to (its neighbours are 1.96:1 and 5.47:1).
- **Bigger type is paid for, not absorbed.** Leading and padding are the budget:
  `.map-feed-item` gave back 0.2rem of vertical padding and tightened both
  leadings, so the rail row went from ~60px to ~58px while its headline grew
  14.4 → 16px and its dateline 12 → 14px. More readable *and* denser.
- **The map's HUD has two layouts and one breakpoint** (2026-08-03). It had three
  and two. `@media (max-width: 1250px)` existed for the band between the phone
  and a screen wide enough for the instrument rail — laptops at 1152, 1280, 1366,
  where the strip was still the desktop's but at 1200px got 719px of the window
  because the rail took 336 and the clock reserved another 116 — and it hid the
  **clock**, on the argument that the scrubber readout carries the same instant
  in the same frame with more of it. That band is gone: the rail is the desktop
  layout at every width above 900px, so the block would now hide the rail's own
  head, and it is deleted along with the measured `padding-right` reservation it
  was compensating for. `.map-rail-base` steps down to 17rem below 1200px
  instead, which is a width judgement about the *story* column rather than about
  a piece of chrome. One threshold now — `NARROW_PX`, 900 — quoted by the island
  and the stylesheet, and `.map-filters` states `display: flex` in each of the
  two layouts rather than escaping a base rule that dissolved it.
- Sizes are not pinned by a test. `colour-system.test.js` covers contrast, and
  the contrast of every rung was checked in a browser at the sizes above; the
  quietest ink now measures 4.91:1 (the isnad) against a 4.5:1 floor.

## Colour

Two palettes, declared once each. **No colour literal may appear outside those two blocks** — `scripts/lib/colour-system.test.js` fails the build if one does, along with every other invariant below.

- **The site palette** (`:root`), for pages that follow the reader: four inks, two surfaces, two rules, plus the marks — `--accent` (neutral, link underlines and value bars), `--brand` (the one chromatic mark, gold; was `--dome`, which named the shape it debuted as), `--pos`/`--neg` (a signed change), `--focus`, `--scrim`. Every token is `light-dark()`; there is no `[data-theme]` and no duplicate dark block. Remember `light-dark()` is a *colour* function — `opacity: light-dark(0, 0.85)` is an invalid declaration that gets dropped, which is how a black canvas once covered every light-mode article.
- **The dark-surface palette** (`body.map-page, body.doc-page`), for the two page types that commit to dark regardless of the reader: five surfaces, two row states, five lines, six inks, and the marks. It is *not* "the site in dark mode" — it is a blue-grey chrome built to sit under saturated data marks. Before it existed these were 180 raw hex literals across 61 values, with nine near-blacks inside three points of each other.
- **Contrast is enforced, not assumed.** Every ink clears WCAG AA (4.5:1) on every surface in its own palette, in both schemes; focus rings clear the 3:1 of WCAG 2.2 SC 1.4.11 on every surface they can land on. The test checks combinations no rule currently makes, because a scale whose steps are only safe in the places they happen to be used is a trap for the next edit.
- **The seam with MapLibre.** `_map/style.ts` paints the canvas, CSS paints the chrome on top of it, and neither can import the other (the style is handed to a worker before any stylesheet is queryable). Three values live on both sides — `MAP_COLOURS.ocean` = `--map-ground`, `OVERLAY_COLOUR.straits`/`.straitsSurge` = `--map-straits`/`--map-straits-surge` — and the test asserts they agree. Category and overlay hues are *not* duplicated: HUD chips receive the layer's own value inline as `--cat`, so a chip cannot disagree with the mark it names.
- `theme-color` follows the page, not the preference: `body.map-page`/`body.doc-page` are served an unconditional `#080a0d` (see `headCommonDark` in `build.js`), because a white address bar over a permanently dark map is a claim about the page that isn't true.

## The starfield behind the article and country pages

`spacefield` is **dark-mode only, via a media query**. It was
`opacity: light-dark(0, 0.85)`, which is invalid — `light-dark()` is a *colour*
function, so the declaration was dropped, the near-black canvas painted at full
strength over the white page on every light-mode device, and the `#000` headline
vanished. The island stops its rAF loop entirely when the field is invisible.
