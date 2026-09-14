# Horizontal news swipes — 2026-09-14

Cancellation handling was fixed before these captures. Canceled deck gestures
return to the committed article with zero velocity; canceled sheet gestures
return to the committed detent without refresh or detent notification; canceled
scrubs restore their starting fraction and end the hold without committing.
Four callback-driven regression tests cover these paths and successful release.

## Method and limits

Android API 35 pixel emulator (emulator-5556), development build, React Compiler,
RN 0.86.3, Reanimated 4.5.1, Gesture Handler 3.3, Worklets 0.10.1, Skia 2.6.2.
Metro 8082. Live feed: 43 articles. The route was Islamabad → Stockholm → next
politics story → Stockholm → Islamabad, collapsed throughout.

The initial 750ms four-swipe sequence missed a landing under profiler load.
`h1-*` and `h2-*` are exploratory captures, not matched benchmark runs. Their
common geographic path hotspots informed the investigation, but their counts
must not be used as an optimization comparison.

The replacement `.argent/flows/perf-horizontal-globe-verified.yaml` uses 1500ms
swipes, settling delays, and an explicit story-position wait after every swipe.
Its initial live recording had one unmet wait; the subsequent full replay passed
all eight steps. The final dual-profiler replay (`v1-*`) and the later lightweight
timing replay both passed all four destination checks, ending at story 1.

The dual capture requested a 1000us Hermes sampling interval. Emulator scheduling
made sampling much coarser; sampler stalls inflate individual function self times.
Do not interpret sampled CPU time as a precise per-invocation measurement.
Native Perfetto hotspots were dominated by goldfish GPU transport/kernel frames.
These are emulator-specific, not representative physical-device costs. The
combined report's lack of matching React commits does not prove all remaining
work is native: globe projection runs in JS outside React rendering.

## Findings

- Geographic path construction is a repeated JS hotspot: rotation, clipping,
  resampling, and Skia path `lineTo`. In the verified 32.8s dual capture, `lineTo`
  had 1367ms sampled self time. React recorded 16 commits, 10 at least 16ms.
  This is not a per-frame React render loop.
- The native trace reported 142 jank events over the capture, including waits,
  scheduling contention, and emulator GPU work. This is not a production FPS
  estimate, and it does not establish that all jank comes from projection.
- A separate capture without either profiler temporarily timed
  `runScrollReproject` around `callReproject`, including picture recording and
  publication. The 28 samples are in `reprojection-timing.json`:

| Fraction of inter-story transition | Calls | Elapsed range |
| --- | ---: | ---: |
| Middle (0.25–0.75) | 14 | 84.6–229.2ms |
| Near either endpoint | 14 | 375.5–900.4ms |

These are wall-clock durations, including emulator scheduling/JSI waits, not
pure CPU time. All exceed a 16.7ms frame budget in this environment. The
near-endpoint calls account for 9476ms of 11437ms total measured reprojection
time. Different geography/zoom/detail and cold-cache effects can contribute;
this is a strong candidate for a controlled experiment, not proof of one layer's
exclusive cost.

`MiniGlobe.tsx` enables extra layers via `nearSettled` throughout the first and
last quarter of a swipe. Geography itself has a stricter endpoint gate, but
lakes and other detail work return while the finger/spring may still be moving.
Latest-only backpressure already prevents an unbounded projection queue.
The deck and vertical sheet transformations remain on the UI thread.

## Recommended next experiment

Keep optional detail disabled until the horizontal camera has actually settled,
then render one complete frame. Preserve all final labels, hit targets, and
geographic detail. Measure the same verified flow before/after, including the
final full-detail frame; ensure reduced motion and caught/reversed swipes still
restore detail. Do not simply move this expensive projection onto the UI thread
or increase its update rate. No rendering optimization was applied in this task.

## Verification and artifacts

- `npm run verify`: typecheck, Biome, deprecated API check, 51 suites / 479 tests.
- Normal swipes verified in the emulator; cancellation itself covered by callback
  regression tests, not a claimed emulator-injected ACTION_CANCEL test.
- Temporary timing changes were removed and the globe source restored exactly.
  Explicit reload + runtime evaluation confirmed `__globeTiming` is undefined.
- Argent runtime log registry: five startup log messages, no warnings/errors.
- `v1-analysis.json`, `v1-combined.json`, `v1-tree.json`, `v1-nativequery.json`
  preserve reports. `v1-flow.json` preserves destination checks and timestamps.
  Raw Hermes CPU/commit paths and native trace paths are in the corresponding
  analysis/start/stop files under `/tmp/argent-profiler-cwd`.
