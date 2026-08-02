---
paths:
  - "public/islands/_map/sky.ts"
  - "public/islands/_map/lunar.ts"
  - "public/islands/_map/starfield.ts"
  - "public/islands/_map/solar.ts"
  - "shared/star-lore.ts"
  - "scripts/generate-stars.js"
  - "scripts/lib/sky.test.js"
---

# The sky

Added 2026-08-01, with the globe. Everything here records a decision that could
have gone the other way and a measurement that decided it. The map itself is
`map.md` beside this; the terminator and the prayer geometry are `prayer.md`.

## The measurement the whole design turns on

- **There is almost no sky on screen, and that is arithmetic rather than
  taste.** MapLibre's globe camera sits about **3.2 earth radii** out with a
  36.9° vertical field of view, so the earth's disc subtends ~36.8° and the only
  sky visible is the margin around it: measured against the built canvas
  (1176×913 at 1920, disc radius 456px) that is **4.8° of sky at the sides and
  10.1° at the corners — 1.3% of the celestial sphere.** At true scale that
  annulus holds about twenty stars to magnitude 5, and the sun and moon reach it
  only when their sub-point is near the antipode of the map centre: **the sun for
  about twenty minutes a night, a few weeks a year.** A photographically true sky
  on this camera is a sky nobody ever sees. That is why the radial scale is
  compressed, and it is the one thing to re-derive before changing `SKY_SPAN` or
  `SKY_KNEE` — `sky.test.js` fails if the sun drops under six hours a day.
- **Three channels stay exact, and they are the ones a reader actually reads.**
  *Bearing* around the disc is untouched. *Occultation* is exact — a body goes
  behind the limb at the true instant and returns on the true side. And the
  *scale at the limb itself* is exact in position and in slope: `skyRadius` is
  `rLimb + a·ln(1 + (α−αLimb)/b)` with `a/b` set to the true perspective
  derivative there, so for the first `SKY_KNEE` degrees the sky is drawn at true
  scale and a moon rising over the edge moves at the right rate and is the right
  size against it. What is given up is star *patterns*: they stretch radially
  with distance from the earth, near the limb barely and in the corner a great
  deal. `SKY_NOTE` says so on every card the sky opens, the way `PRAYER_NOTE`
  names Umm al-Qura.
- **Nothing past 90° is drawn.** Beyond that a body is level with or behind the
  camera, and placing it in a corner of the frame would be a claim about
  direction that is false — the line between compressing a sky and inventing
  one. The behaviour that falls out is true and teachable: **the sun is in frame
  when the centre of the map is in night, and behind the reader's shoulder when
  it is in day**, which is why the earth in front of them is lit. Measured at the
  home view: sun drawn **11.0h a day**, moon **11.5h**.

## The camera

- **Solved from `map.project` and nothing else.** A surface point θ from the
  sub-camera point is drawn at `f·sinθ/(d−cosθ)`; two samples give a closed
  solution for `f` and `d`, and `αLimb = asin(1/d)`. Reading `transform.fov` or
  `cameraToCenterDistance` would put a copy of MapLibre's globe sizing in this
  file and go quietly wrong on the version bump that changed it. The solve
  self-calibrates against `GLOBE_FIT`, the padding, the rails and the viewport.
- **A third sample is predicted and checked, and a mismatch draws nothing.**
  Once the projection starts interpolating toward Mercator the two-point solve
  is fitting a model that no longer holds, and a plausible wrong sky is worse
  than none. Bearing and pitch are refused outright for the same reason: both
  are zero on this map by construction, and a turned camera is one whose disc
  centre is no longer `project(getCenter())`.
- **Only *north* is measured; east is north turned a quarter, with its sign
  measured.** A latitude step is exactly a meridian and therefore exactly north.
  A longitude step runs along a *parallel*, which is not a great circle — at the
  home latitude half a degree of it comes out 0.1° off due east. Small, and small
  errors in a basis are the ones that get written down as correct. The sign is
  still measured because which way the quarter-turn goes depends on the y-axis
  pointing down, and a hemisphere-dependent guess is how a sky comes out
  mirrored for half the planet.
- **Parallax is not optional for the moon.** The camera is ~2.2 radii above the
  surface and the moon is ~60 out, so geocentric and camera-centric directions
  differ by up to **2°** — over fifty pixels beside the limb, and visible as the
  moon setting behind the wrong part of the earth. The sun gets it too, for
  0.008° and no extra code.

## Rendering

- **A 2D canvas *behind* MapLibre's, and the placement is the design.** Below
  `GLOBE_ZOOM.plane` MapLibre draws `ocean` on the tile meshes and clears the
  canvas to transparent, so outside the limb there is no MapLibre colour at all.
  A canvas underneath therefore gets **occlusion by the globe in hardware** —
  exact at the edge, exact in time, including the partial clip while a body is
  halfway over — and MapLibre's own atmosphere composites over ours by the
  browser rather than by us. It carries **no `z-index`**: both are
  `position: absolute` with `z-index: auto`, so tree order decides, and the
  island appends the sky before constructing the map. Move that append after
  `new MapLibreMap` and the sky paints over the earth, with nothing thrown and
  nothing logged. `map-island.test.js` asserts the *position*, not the presence.
- **No source, no layer, no `addImage`, no feature state, and no rAF loop.** The
  sky repaints on `move` — a frame MapLibre is drawing anyway — and on the
  existing 120-second `SUN_TICK_MS` the terminator already uses, which is 0.5°
  of sky rotation, under a pixel where the sky is drawn most precisely. So it
  cannot touch the invariant that an idle tick writes nothing, which was once
  worth 56.8 renders a second and ~57% of a core. `spacefield.ts` (the article
  pages' starfield) has an rAF loop; this must not.
- **The star catalogue is fetched, the bodies are arithmetic.** ~45 KB gzipped,
  idle-deferred beside the water and the conflict feed, so first paint is a sun,
  a moon and an atmosphere and the stars arrive after. A failed or absent fetch
  is a globe with no stars, which is a complete picture — nothing to report and
  nothing to retry.
- **Culling is three dot products per star, in J2000.** The frame vectors are
  rotated *backwards* through the precession matrix rather than every star
  rotated forwards: a rotation is orthogonal, so `dot(P·v, c) === dot(v, Pᵀ·c)`,
  and that is three vectors transformed instead of three thousand. The
  magnitude cut is a `break`, not a filter, because the payload is sorted — and
  `sky.test.js` pins the sort for that reason, since an unsorted payload would
  silently draw a different set from the one `STAR_MAG_LIMIT` names.
- **Precession is applied and is not cosmetic.** The catalogue is J2000 and
  `gmstHours` is measured from the equinox of date, so leaving it out is a
  systematic 0.36° by 2026 — ten pixels at the limb, and a whole sky sitting
  quietly askew against a sun and moon that are computed correctly. Pinned
  against `astronomy-engine` to within nutation (±17″), which the oracle's `EQD`
  carries and the mean equinox does not.

## The atmosphere, and the edge the map never had

- **This map's oldest unsolved problem is that the planet has no edge at
  night.** Space and sea are the *same tone by construction* — `--map-ground`
  is `MAP_COLOURS.ocean`, which is what keeps every chrome scrim meaning what it
  means — and `night-shade` is black at 0.28 over a near-black ocean, which
  moves it about two values in 255. The scattering glow is a crescent and by
  definition stops at the terminator. So half the limb ended wherever the last
  coastline happened to be. The graticule was added as a way round it and is a
  good mark for a different reason; it was never the answer to this.
- **The answer is that the night limb is not actually dark.** Oxygen
  recombining ~90 km up emits continuously, and that band — airglow — is why the
  dark side of the earth has a visible edge in every photograph taken from
  orbit. Real, uniform around the whole limb, and the one thing that can draw
  this edge without inventing anything.
- **The tone is fixed and the width is the free variable.** `MAP_COLOURS.horizon`
  is not a hue with a brightness chosen for it — its own note states the
  measurement the value *is*: **1.45:1** against the ocean. A first pass drew it
  at 0.62 alpha, which composites to **1.21:1**, under the register the token was
  measured at, and on this ground that is the difference between an atmosphere
  and nothing; it shipped and could not be seen. So the peak is 1 and the only
  thing left to tune is width. That is the useful half of the trade — brightness
  is capped by the palette and costs legibility everywhere it is spent, width
  costs nothing but its own pixels. **2.2px**, swept: 1.6 read as an artefact of
  the circle, past ~3 it stops being an edge and becomes a ring drawn round the
  planet.
- **Day and night still read differently**, which is the objection this has to
  answer. The scattering crescent is a ~25px gradient over the airglow, so the
  lit limb is a band and the dark limb is a line. The terminator keeps saying
  what it said, and `atmosphere-blend` stays at its measured 0.34 for the half
  MapLibre draws on the planet — two tokens for one substance is exactly how the
  two halves would drift apart.
- **The two halves were pointing in different directions the whole time**
  (2026-08-02). This file's crescent is placed from `sunPosition` and has always
  been right. MapLibre's is placed from `style.light`, and the style declared
  `sky` and never declared `light` — so `getSunPos` skipped its camera rotation
  (`anchor` defaults to `'viewport'`), `u_sun_pos` became a constant in view
  space, and **MapLibre's crescent sat in the upper-left corner of the screen at
  every hour, on every date, from every camera.** Ours swept with the sun
  underneath it. Nothing could catch it: both are atmospheres, both are faint,
  and the wrong one is only wrong *relative to* a terminator you have to look
  for. `drawSolar` now calls `map.setLight({ anchor: 'map', … })` from
  `sunLightPosition` on the same 120-second tick, and the halo here is what the
  night half of that same edge is made of. The reason the airglow could not
  simply be turned up to cover for it: MapLibre's shader is a Rayleigh/Mie
  integral, so it returns **zero** where the sun is behind the planet, and no
  value of `atmosphere-blend` will ever light the night limb.
- **A missing `light` is the cheapest possible failure to write down and the
  hardest to see.** It is not a wrong value, it is an absent declaration, so
  there is no line to review, nothing in the console, and a default that renders
  something plausible. The general form is worth keeping: **an engine default
  that produces a picture is more dangerous than one that produces nothing.**
- **The crescent is 72 wedges sharing one radial gradient, drawn `lighter`.**
  Carving a crescent out of a ring means `destination-out`, which would take the
  stars underneath with it. `lighter` is both what light does and what makes
  adjacent wedges meet with no seam. What looks like banding under a 3× exposure
  boost is 8-bit gradient quantisation, not wedge seams.

## Ink

- **Stars are the one place the quiet-furniture bar is deliberately not
  applied, and the reason is area.** Every other argument on this map is about a
  mark or a wash large enough to change what the ground reads as. A magnitude-1
  star is **1.6px across**, and the whole visible sky spends about 300 square
  pixels of ink on a canvas of a million — **0.03%**. Holding a point of light to
  1.5:1 would not make the map quieter, it would make it starless. What *is*
  rationed is the ramp: alpha falls with magnitude, so the sky is a handful of
  legible stars and a great many barely there, which is what a sky is.
- **Sub-pixel stars are drawn by alpha, never by radius.** A browser rounds a
  0.4px arc up to a pixel and paints it at full strength, so a size ramp below
  one pixel silently becomes no ramp at all — the failure `glyphs.ts` records at
  3.2px, one order of magnitude down. Radius floors at 0.7px and caps at 1.6.
- **Colour is the measurement, not an encoding.** B−V is a star's temperature,
  so spending hue here is not spending it on a channel. `STAR_TINT` caps how far
  any star may travel toward `starWarm`/`starCool` at **0.35**: the extremes
  render near `#e6cec2` and `#c8d0e8`, a channel spread of 44 and 32 against
  `water`'s 100. Swept at 0.6 (a fairground) and 0.15 (indistinguishable).
- **The sun and moon are drawn at true angular size** — 0.53° and 0.52°, about
  13px against a 913px earth — so the brightest thing on the map is also one of
  the smallest, ~130 square pixels of ink. A body does **not** shrink as it moves
  into the compressed sky: the compression is of distances, and shrinking the
  moon with it would be a second, silent encoding of how far out it is.
- **The moon is a disc with a crescent on it, not a floating crescent.** From
  here the face the moon turns to us is the face the earth lights, so the unlit
  part is genuinely faintly visible — earthshine, `moonDark` at 1.10:1 against
  space. A crescent with nothing behind it reads as a logo.
- **The terminator on the disc is one path either way.** Its semi-axis along the
  sun direction is `R·(2k−1)`: positive past half, when the ellipse bulges away
  from the sun and the shape is gibbous; negative before it, when it cuts toward
  the sun and the shape is a crescent. The sweep direction carries the sign, so
  there is no branch on "crescent or gibbous". The sun's direction is resolved
  **from the two unit vectors**, not from the two drawn positions — under the
  radial compression the drawn pair are not at their true relative bearing, and a
  crescent tipped a few degrees wrong is the one error about the moon everybody
  can see.

## The data

- **Positions from the Yale Bright Star Catalogue** (Hoffleit & Warren 1991, CDS
  `V/50`), public domain; **names from the IAU WGSN** catalogue, CC BY. **Not
  HYG**, which is CC BY-SA — share-alike on a file the site serves is a licence
  term reaching into the site. 2,887 stars to magnitude 5.5, 324 named, 123 KB
  raw and 45 KB gzipped. `STAR_MAG_LIMIT` is 5.2 and is a *prefix slice*, so
  lowering what is drawn costs no refetch.
- **`scripts/generate-stars.js` is committed because its output is.**
  `shared/countries/country-augmented.ts` names a generator that is not in the
  repo, so it cannot be regenerated and 32 countries have been hatched on every
  metric ever since. A committed payload with no committed generator is a
  payload that can only ever be deleted.
- **`shared/star-lore.ts` is editorial and hand-written**, in the class of
  `place-names.ts` and `market-metadata.js` — nobody publishes etymology in
  machine-readable form, and the IAU's own file says it is working on it. It
  exists because of what the list turns out to be: of the 138 IAU names on stars
  brighter than magnitude 3, about a hundred reached every European language
  through Arabic, usually as a fragment of a longer phrase and occasionally as a
  copyist's slip preserved for eight centuries (Betelgeuse is a misread *yad*,
  "hand", as *bat*). That is the one thing a mark on a star can say that a
  picture of a star cannot. **Deliberately not Arabic-only** — Larawag is
  Wardaman, Paikauhale Hawaiian, Tianguan and Fang Chinese, Imai Mursi, Tiaki
  Māori, Nunki and Sargas Mesopotamian — and **deliberately silent** where no
  derivation is agreed (Kraz, Hatysa, Hassaleh, Tejat), because a confident
  sentence about one of those would be the file inventing a source. **No Arabic
  script**: a hundred lines of orthography is a hundred factual claims and this
  file should not publish claims nobody has checked. Adding it with a reviewer is
  a good next change.
- **Both tables are merged into `/basemap/stars.json` at build time**, not
  imported by the island: this is card text reachable only by clicking a star,
  and the island's bundle is downloaded by every reader of the homepage. Both
  files are in `BASEMAP_V`, or the sky goes stale for a day with no way for a
  reader to force it.

## The library is a test oracle

`astronomy-engine` (MIT) is a devDependency and **none of it ships** — the same
arrangement `prayer.ts` has with adhan-js, and for the same reason: the island
needs three numbers from the moon, the closed form is published (Meeus ch. 47,
tables 47.A and 47.B, transcribed whole), and ~100 KB minified against a 40 KB
island is the wrong trade. `sky.test.js` compares every function against it
across a decade of sampled instants. Measured: **moon position 0.020° worst**,
distance **25 km**, sun **0.016°**, illuminated fraction **1.4e-4**.

**The oracle has to be asked the right question, and the first run of the suite
did not.** `Astro.Equator(body, t, observer, …)` is *topocentric* — it applies
the parallax of an observer on the surface, up to a degree for the moon — and
its default frame is J2000 while ours is the equinox of date. Compared naively
it reported a **1.46° error that was entirely the oracle**. The right call is
`EquatorFromVector(RotateVector(Rotation_EQJ_EQD(t), GeoVector(body, t, false)))`,
and the residual left after that is nutation, which is the only slack in the
bounds.

## Measuring this in a browser

**`requestIdleCallback` does not fire in headless Chromium here**, so a headless
run shows no stars, no lakes and no rivers — the whole idle-deferred tier, absent,
with a clean console and a plausible picture. That cost an hour. It is the same
class of trap `map.md` records for `requestAnimationFrame` in an occluded window,
and the rule is the same: **anything about the map's runtime is measured headed
or not at all.**
