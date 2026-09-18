# Globe projection — where a frame goes, and what came out of it (2026-09-18)

Android API 35 `zuhd-qa` emulator (emulator-5556), development build, Metro on
8084, Hermes. **The host ran at load average 10–24 throughout** (another
project's emulator and several other sessions), so absolute wall times are
inflated and drift by 2–4× between minutes. Every speed claim below is either an
interleaved A/B inside one `debugger-evaluate` on the running Hermes runtime
(A and B alternate per camera, so drift hits both), or a count, which load does
not change.

## Where a moving frame went

Temporary `performance.now()` marks in `callReproject` (removed), median of 23
moving frames over `.argent/flows/globe-drag-bench.yaml`, motion tier:

| phase | ms | share | path points |
| --- | ---: | ---: | ---: |
| land | 155 | 43% | 1,500 |
| graticule + polar circles | 48 | 13% | 741 |
| borders | 41 | 12% | 775 |
| day / night / twilight | 34 | 10% | ~550 |
| marks, story marks, labels, arcs | 16 | 5% | — |
| picture recording | 13 | 4% | — |

A settled frame (swipe landing) at a 35° framing: 21,300 land points from
27,600 input vertices, ~30,000 path calls in all. Same-camera redraws (a font
arriving, a story found, a gauge opened) still re-projected the rivers: 80–400
ms each, because the river path was not in the settled geometry cache.

## Changes

1. **Skia methods are read once per builder, not per vertex**
   (`createSkiaPathContext`). A property read on a Skia host object is a JSI
   call — `JsiHostObject::get` copies the name to UTF-8 and searches two maps —
   and cost more than the call it fetched. 20k `lineTo` in the live runtime:
   36.1 ms as `b.lineTo(x, y)`, 10.6 ms through a held function (3.4×). The
   functions are bound to their builder natively but return `thisValue`, so
   they are invoked with `.call(builder, …)`; a method read from one builder
   and called on another draws into the first.
2. **Circles on the sphere in closed form** (`sphere-circles.ts`). Graticule,
   polar circles and the day, night and twilight caps are ellipse arcs on
   screen, one `conicTo` per quarter. Interleaved on device: **197 ms → 3.3 ms
   per frame (60×)**, 608 → 86 graticule points. Offscreen pixel diff against
   the d3 drawing: the twilight fill differs on ≤ 87 of 192k pixels
   (antialiasing); the graticule differs only where d3 clipped the polar
   circles *as polygons* and stroked a stray arc along the limb — gone now.
   The old 5° walk also bowed parallels 0.4 px poleward at high zoom; these are
   the true parallels. `__tests__/sphere-circles.test.ts` holds boundaries
   within 0.2 px of a finely resampled d3 and fills pixel-identical, holes
   included.
3. **Moving frames skip d3's resampling below scale 400**
   (`MOTION_RESAMPLE_SCALE`). Resampling added ~30 of 2,280 points to moving
   land and borders and cost **27% of their time** (interleaved, on device):
   d3 tests the midpoint of every edge to find those few. Measured stray of the
   straight chords: ≤ 1.0 px at scale 230, 1.5 px at 355, on < 1% of points; it
   reaches 3 px at 720, which is why pinch-zoomed drags keep resampling. The
   resting frame always restores 0.25 px resampling.
4. **Rivers ride in the settled geometry cache.** Same-camera redraws went from
   80–400 ms of river projection to 0.
5. **Every point mark is placed by `screenPoint`**: a dot product for the cone
   and two multiply-adds for the position, from unit vectors built once per
   snapshot — where each mark paid `geoDistance` (haversine) plus d3's point
   projection (rotation trig, two allocations). Marks + story marks + labels +
   arcs: 16.4 → 6.1 ms at comparable load. Pinned against `geoDistance` and d3
   to 1e-6 px in the test.
6. **`shared.ts` stops building geometry nobody draws.** A Visvalingam pass over
   the whole 110m topology plus four meshes ran at module load, on the JS
   thread before the globe's first frame — ~100 ms on a laptop's V8 — for the
   pre-tier land and border layers only tests and benches used. They live in
   `perf/fixtures/globe-geometry.ts` now.

After, same flow, median of 13 moving frames (at load ~11 against ~20 before —
compare shares, not totals): land 124 ms (68%), borders 32 (18%), recording 20
(11%), graticule 0.9, night 0.6, all marks and labels 6.1. Frame 357 → 183 ms.

## What is left, ranked

1. **Land and borders through d3 are 86% of a moving frame and most of the
   settled stall.** A trig-free rotate/cull/emit of the same moving-tier land
   vertices ran **3.6 ms against d3's 48.6 ms at precision 0 (13.5×)**,
   interleaved on device. That floor omits horizon stitching (d3's
   `clipRejoin` along the limb, polygons that contain the view, the pole and
   antimeridian rings), which a real replacement must port and pin against d3
   the way `cap-cull.test.ts` and `sphere-circles.test.ts` do. It would cut
   the swipe-landing stall by about the same factor (27k vertices).
2. **Startup projects the full resting tier first**; the globe stays blank
   until 27k land vertices are through d3 (the first frame here was 13.6 s at
   load 20, 8.4 s of it land, 3.4 s decoding the 50m rivers). Drawing the
   first frame at the motion tier and settling on the next tick would show the
   globe ~10× sooner.
3. **Recording (11%)** reads Skia methods per call too (`c.drawPath`,
   `paint.setColor`, …, ~1k per frame) and builds an `RSXform` host object per
   atlas instance. Caching the canvas and paint methods would save the lookup
   share of it.
4. Country areas and label centroids (`geoArea`/`geoCentroid` × 177) are
   ~110 ms of V8 module-load time and could be baked at build time.

## Environment notes

- The `pixel` emulator was running another project's app on Metro 8081; this
  run used `zuhd-qa` with the zuhd Metro on 8084. The dev client's default
  host on an emulator reaches the host's 8081 through 10.0.2.2 and loaded that
  project's bundle (an AsyncStorage red box); pinning `debug_http_host` to
  `localhost:8084` in `shared_prefs/news.zuhd.app_preferences.xml` fixed it.
- At this load the app was killed twice for failing to start within Android's
  10 s window; the third launch came up.
- Repeated hot reloads left the Skia views without a GL context (a black screen
  with the React tree mounted and `EGLConsumer is not attached` in logcat). A
  cold start restored it; it was not the code.

## Follow-up, same day: the projection is no longer d3's

Items 1, 2 (partly) and 4 above are done; measured in node, not on the
emulator, because the emulator was not available to this session.

- **`components/globe/ortho-stream.ts`** replaces d3 for every path on the
  globe: unit vectors per vertex at tier decode, a 3×3 rotation, one compare
  and two multiply-adds per vertex a frame, with d3's clip, `clipRejoin`,
  whole-view fill and `resample` ported in cartesian form and pinned command
  for command against d3 (`__tests__/ortho-stream.test.ts`: the 110m
  fixtures, the motion and overview tiers, four countries, rings around the
  poles, a ring wider than a hemisphere, edges dipping through a small clip,
  precisions 0 and 0.25, 22 cameras). Node, land + borders at a 40° framing
  (`perf/benches/ortho-stream.bench.ts`): **1.81 → 0.33 ms moving (5.5×),
  2.05 → 0.44 ms settled (4.7×)**. Resampling costs the streamer 35% where
  it cost d3 27% of a much larger number; a moving frame still skips it below
  `MOTION_RESAMPLE_SCALE`, to be re-measured on hardware.
- **Startup**: the mount frame is drawn at the motion tier; the passive effect
  and the reaction's first tick settle it. The 50m rivers and lakes decode in
  a `setTimeout(0)` after the first settled frame and redraw it
  (`warmDetailGeo`); a settled frame drawn before that goes without them and
  the cached entry is filled in on the redraw.
- **Country areas and label centroids are baked**
  (`assets/geo/country-metrics.json`, `scripts/generate-country-metrics.mjs`,
  held to the computation by `__tests__/country-metrics.test.ts`).
- **Paint setters are held** like the path builders' methods.

Still open: the recording's canvas method reads (item 3), and every number
here on hardware.
