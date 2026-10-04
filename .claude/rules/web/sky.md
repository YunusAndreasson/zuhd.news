---
paths:
  - "public/islands/_map/sky.ts"
  - "public/islands/_map/sky-paint.ts"
  - "public/islands/_map/solar.ts"
  - "scripts/lib/sky.test.js"
---

# The sky

The sun, the scattering crescent and the airglow, on a 2D canvas behind the
globe. `sky.ts` is the geometry and `sky-paint.ts` the painter; `sky.test.js`
bundles only the first, so anything testable stays out of the painter. The
camera locks, the light and space's tone are `map.md`; the night wash is
`map-layers.md`; the terminator is `prayer.md`.

## What is drawn

- No stars, no moon, no precession, no camera parallax and no `spacefield`
  island. Do not add them unasked.
- The true sky on screen is a thin margin round the disc, so `skyRadius`
  compresses distance out from the limb, and `SKY_NOTE` says so on the sun's
  card. `sky.test.js` fails if `SKY_SPAN` or `SKY_KNEE` leaves the sun drawn
  under six hours a day.
- **Never draw past `SKY_SPAN`** (90°): a body behind the camera has no true
  place on screen.
- The view axis is `-c`, so `alpha` is measured from the antipode of the map
  centre. Over the centre a body is behind the reader (null); over the antipode
  it is behind the earth (`hidden`).
- The sun keeps its true angular size everywhere (`skyPxPerDegree`): shrinking
  it with the compression would encode distance twice.

## The camera

- `calibrate` solves the camera from `map.project` alone. Never read
  `transform.fov` or `cameraToCenterDistance`: a copy of MapLibre's globe
  sizing goes wrong quietly on a version bump.
- A third sample is predicted and checked. A mismatch (the morph to Mercator)
  or any bearing or pitch returns null: no sky beats a wrong one.
- **Never add `padding` to those refusals**: `project` runs through the padded
  matrix that also places the disc, so the ring already sits on the limb.
- Only north is measured, off a latitude step. East is north turned a quarter
  with its sign measured: a longitude step is not due east, and a guessed sign
  mirrors the sky in one hemisphere.

## The canvas

- The canvas sits under MapLibre's, so the globe occludes the sky in hardware.
  It has no `z-index`: the island appends it before `new MapLibreMap`.
  Appended after, it covers the earth and nothing throws
  (`map-island.test.js`).
- No source, layer, `addImage`, feature state or rAF loop. It repaints on
  `move` and on `drawSolar`'s tick, so an idle tick still writes nothing.
- `draw` paints nothing while `document.hidden`, and nothing repaints it until
  the next `move` or tick.

## The atmosphere

- Airglow is the night limb's only edge, not decoration: sea and space are one
  tone and the crescent stops at the terminator.
- Both glows are `MAP_COLOURS.horizon` at full alpha; lower could not be seen,
  and a second token would drift from MapLibre's half. Width is the free
  variable (`AIRGLOW_WIDTH`): past 3px it is a ring round the planet.
- Airglow is an annulus, hard at the limb and graded outward; a stroke read as
  a drawn circle. Never grow `AIRGLOW_REACH` to light the day side.
- **Never raise `atmosphere-blend` to light the night limb**: MapLibre's glow
  is a scattering integral, dark wherever the sun is behind the planet.
- The crescent is wedges of one gradient drawn `lighter`: `destination-out`
  would also cut the airglow beneath it.

## Testing and measuring

- `astronomy-engine` is a devDependency and never ships. Ask it through the
  test's `geoOfDate`: `Astro.Equator` is topocentric and J2000, and the error
  it reports is its own.
- Measure the map's runtime headed (`map.md`, "Idle cost and measurement"):
  headless Chromium skipped the idle tier (lakes, rivers) with a clean console.
