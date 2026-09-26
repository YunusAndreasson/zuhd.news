---
paths:
  - "public/islands/_map/sky.ts"
  - "public/islands/_map/sky-paint.ts"
  - "public/islands/_map/solar.ts"
  - "scripts/lib/sky.test.js"
---

# The sky

Added 2026-08-01, with the globe. Everything here records a decision that could
have gone the other way and a measurement that decided it. The map itself is
`map.md` beside this; the terminator and the prayer geometry are `prayer.md`.

## What the sky is now: the sun and the atmosphere

- **The stars and the moon were removed on 2026-09-26, at the owner's
  request** — a product decision, not a defect. What went: the star field (the
  Yale Bright Star Catalogue, 2,887 stars, `shared/data/stars.json` and
  `/basemap/stars.json`, its generator `scripts/generate-stars.js`, the
  hand-written etymologies in `shared/star-lore.ts`, the star cards), the moon
  (`_map/lunar.ts`, a Meeus ch. 47 transcription, its phase and earthshine, its
  card), precession (only the J2000 catalogue needed it), camera parallax (the
  moon's 2°; the sun's is 0.008°, under a pixel), the move-time "quiet" repaint
  (its only saving was the star field), and `fmt.magnitude`. The article and
  country pages' ambient starfield island (`spacefield.ts`, with its Mars
  sprite) went the same day, for the same reason.
- **What stayed, and why none of it depended on the stars:** the camera solve,
  the compressed radial scale, the sun at true size with its card, the
  atmosphere crescent and the airglow. The airglow is the one that must not be
  mistaken for decoration — it is the only edge the night hemisphere has.
- **If the stars come back**, the catalogue, the lore and the Meeus lunar
  series are in git history before this date, with the measurements below
  that sized them. The earlier text of this file describes them in full.

## The measurement the whole design turns on

- **There is almost no sky on screen, and that is arithmetic rather than
  taste.** MapLibre's globe camera sits about **3.2 earth radii** out with a
  36.9° vertical field of view, so the earth's disc subtends ~36.8° and the only
  sky visible is the margin around it: measured against the built canvas
  (1176×913 at 1920, disc radius 456px) that is **4.8° of sky at the sides and
  10.1° at the corners — 1.3% of the celestial sphere.** At true scale the sun
  reaches that annulus only when its sub-point is near the antipode of the map
  centre: **about twenty minutes a night, a few weeks a year.** A photographically true sky
  on this camera is a sky nobody ever sees. That is why the radial scale is
  compressed, and it is the one thing to re-derive before changing `SKY_SPAN` or
  `SKY_KNEE` — `sky.test.js` fails if the sun drops under six hours a day.
- **Three channels stay exact, and they are the ones a reader actually reads.**
  *Bearing* around the disc is untouched. *Occultation* is exact — a body goes
  behind the limb at the true instant and returns on the true side. And the
  *scale at the limb itself* is exact in position and in slope: `skyRadius` is
  `rLimb + a·ln(1 + (α−αLimb)/b)` with `a/b` set to the true perspective
  derivative there, so for the first `SKY_KNEE` degrees the sky is drawn at true
  scale and the sun rising over the edge moves at the right rate and is the right
  size against it. What is given up is *distance out from the limb*, and
  `SKY_NOTE` says so on the sun's card, the way `PRAYER_NOTE` names Umm al-Qura.
- **Nothing past 90° is drawn.** Beyond that a body is level with or behind the
  camera, and placing it in a corner of the frame would be a claim about
  direction that is false — the line between compressing a sky and inventing
  one. The behaviour that falls out is true and teachable: **the sun is in frame
  when the centre of the map is in night, and behind the reader's shoulder when
  it is in day**, which is why the earth in front of them is lit. Measured at the
  home view: sun drawn **11.0h a day**.

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
- **No parallax correction.** The camera is ~2.2 earth radii above the surface,
  which shifts the sun by 0.008° — well under a pixel — so it is placed from its
  geocentric direction. The correction existed for the moon, ~60 radii out,
  where it reaches 2°; it went with the moon.

## Rendering

- **A 2D canvas *behind* MapLibre's, and the placement is the design.** Below
  `GLOBE_ZOOM.plane` MapLibre draws `ocean` on the tile meshes and clears the
  canvas to transparent, so outside the limb there is no MapLibre colour at all.
  A canvas underneath therefore gets **occlusion by the globe in hardware** —
  exact at the edge, exact in time, including the partial clip while the sun is
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
  worth 56.8 renders a second and ~57% of a core.
- **`padding` was added to `calibrate`'s refusals and taken back out** (2026-08-08). The argument was good on its face — `origin` *is* the assumed disc centre, MapLibre's padding offsets the principal point, and the phone writes a bottom inset for the story drawer — so the whole sky should have sat off the limb by half that inset. It does not, because `project` runs through the *same* padded matrix that places the disc. Measured on a 390×844 phone, reading the ring off the sky canvas and the limb off the composited frame on one row: drawer closed, row 200 gives ring 81–97 and 292–308 against limb 89 and 301; row 300 gives ring 5–14 and 375–384 against limb 9 and 380; drawer open, row 220 gives ring 1–9 and 380–388 against limb 4 and 382. The annulus straddles the edge every time, which is what `drawHalo` is drawn to do. **Refusing would have taken the sky off every phone to fix nothing** — kept here because the reasoning is the kind that will be had again.

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
- **It was a *stroke*, and a stroke has two hard edges** (2026-08-03). Measured
  off a headed render along a ray through the night limb: `(6,7,9)` planet,
  `(34,46,64)`, `(34,46,64)`, `(8,10,13)` space — the token's value at full
  strength for two pixels and then nothing, between a black planet and black
  space. The day limb on the same frame ramps from `(102,113,132)` to space over
  24px. So the only hard edge anywhere in this sky was the one thing here that
  is supposed to be made of light, and it read as exactly what it literally was:
  a circle stroked around the globe. The **inner** edge is right and stays — the
  planet is opaque and its limb is a real discontinuity. The outer one is not:
  airglow is a shell seen edge-on, so it fades with the atmosphere above it. It
  is an annulus with a graded alpha now, **peak unchanged and still on the limb**
  so the 1.45:1 measurement above is untouched, then half strength half a width
  out, a sixth at one and a half, gone by `AIRGLOW_REACH` (2.5 widths). The area
  under that curve is 1.73px of full-strength ink against the stroke's 1.65, so
  it does not read fainter — only softer. Measured after: `(33,45,63)` on the
  limb, then 21, 17, 12, 10, back to space over five pixels. **`AIRGLOW_REACH`
  is not free to grow into an answer for the day side** — a long enough tail
  reintroduces at low alpha exactly the ring the 3px sweep above rejected.
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
  Carving a crescent out of a ring means `destination-out`, which would also cut
  the airglow drawn beneath it. `lighter` is both what light does and what makes
  adjacent wedges meet with no seam. What looks like banding under a 3× exposure
  boost is 8-bit gradient quantisation, not wedge seams.

## Ink

- **The sun is drawn at true angular size** — 0.53°, about 13px against a 913px
  earth — so the brightest thing on the map is also one of the smallest, ~130
  square pixels of ink. It does **not** shrink as it moves into the compressed
  sky: the compression is of distances, and shrinking the disc with it would be
  a second, silent encoding of how far out it is.

## The library is a test oracle

`astronomy-engine` (MIT) is a devDependency and **none of it ships** — the same
arrangement `prayer.ts` has with adhan-js. `sky.test.js` compares the sun
(`solar.ts`, the NOAA low-precision equations) against it across a decade of
sampled instants: **0.016° worst**, half a pixel at the scale the sky is drawn
beside the limb.

**The oracle has to be asked the right question.** `Astro.Equator(body, t,
observer, …)` is *topocentric* and its default frame is J2000, while ours is
geocentric and the equinox of date; compared naively it once reported an error
that was entirely the oracle. The right call is
`EquatorFromVector(RotateVector(Rotation_EQJ_EQD(t), GeoVector(body, t, false)))`,
and the residual left after that is nutation, which is the only slack in the
bounds.

## Measuring this in a browser

**`requestIdleCallback` does not fire in headless Chromium here**, so a headless
run shows no lakes and no rivers — the whole idle-deferred tier, absent, with a
clean console and a plausible picture. That cost an hour. It is the same
class of trap `map.md` records for `requestAnimationFrame` in an occluded window,
and the rule is the same: **anything about the map's runtime is measured headed
or not at all.**
