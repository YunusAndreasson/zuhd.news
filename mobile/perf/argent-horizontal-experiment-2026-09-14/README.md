# Horizontal swipe experiments — 2026-09-14

Kept two changes, tested sequentially:

1. Extra globe layers and high-detail geography now wait for an exact story
   endpoint. The original quarter-story opacity fade remains unchanged.
   Detail-tier transitions bypass the reaction's throttle and numeric no-op
   filter, while retaining latest-only backpressure. This ensures the final
   full-detail frame is restored even after a tiny final spring update.
2. The scrubber's muted passed/ahead palettes stay stable across article changes.
   Its existing raised marker receives the full current category hue separately.
   React Compiler can reuse both segment tracks without new manual memoization.

## Measurements

Pixel Android API 35 emulator, development build, Metro 8082, 43 live stories.
Used the existing `perf-horizontal-globe-verified` flow: four 1500ms swipes and
four checked destinations (1 → 2 → 3 → 2 → 1). All reported captures passed all
eight steps. Timing captures followed explicit reload and feed readiness; each
dual profile followed its corresponding timing flow to warm the same route.

Timing wraps `runScrollReproject` around projection, picture recording and
publication. It measures elapsed time, including scheduling/JSI waits, not pure
CPU time. Neither native nor Hermes profiler ran during these timing captures.

| Timing metric | Original | Exact endpoint only | Both changes |
| --- | ---: | ---: | ---: |
| Moving reprojections computed | 19 | 40 | 42 |
| Median moving reprojection | 490ms | 161ms | 150ms |
| Maximum moving reprojection | 1442ms | 744ms | 673ms |
| Exact endpoint redraws | 4 | 4 | 4 |
| Median endpoint redraw | 780ms | 959ms | 871ms |
| Total reprojection elapsed time | 12.17s | 12.35s | 11.28s |

The clear benefit is shorter individual moving updates and more computed
updates during the same gestures. This is not a delivered-FPS measurement.
The total-work difference is modest and could be noise; the endpoint redraw
did not improve. All timings are inflated by the development emulator and do
not predict physical-phone latency. No claim of universally smooth animation.

An initial candidate using a 0.002 endpoint tolerance was rejected: it caused
expensive near-final and exact-final redraws, with 14.80s total measured work.
Its `detail-*` files preserve that experiment. `exact-*` records the corrected
exact-endpoint implementation; `final-*` includes the scrubber change.

| Dual-profile metric | Original (`eb`) | Globe only (`ed`) | Both (`ef`) |
| --- | ---: | ---: | ---: |
| Duration | 27.7s | 28.9s | 29.9s |
| Captured React commits | 20 | 16 | 26 |
| Reported commits ≥16ms | 11 | 4 | 7 |
| Segment component renders | 8 | 8 | 0 |
| Native jank events | 149 | 116 | 122 |

The `ef-segments.json` query confirms no Segments renders in the analyzed
capture. Fewer segment renders is deterministic; overall commit counts varied
and increased in the final run, so this is not a claim of fewer total commits.
Profiler selection may omit zero-work commits; raw stop counts and analyzed
counts can differ. Native hotspots remained dominated by emulator GPU transport
and kernel work. Native event counts span slightly different durations and are
not a production-performance comparison. Combined reports are saved for all
three captures, with raw trace/CPU paths in the start/stop/analysis files.

## Verification

- The normal four-swipe route passed at every stage.
- Final emulator checks: rapid forward/reverse gestures, expansion, scrubbing
  from politics into tech, collapse, restored globe labels/detail and top bar.
- Settled predicate tests cover the exact endpoints, tiny nonzero fractions,
  reversal/cancellation endpoint and the sub-epsilon final update boundary.
- Temporary timing instrumentation removed. Explicit reload and evaluation
  confirmed `globalThis.__globeTiming` is undefined; runtime log registry showed
  startup logs only, no warnings/errors.
- Typecheck, Biome, deprecated API check passed. The parallel Jest invocation
  was terminated with SIGTERM; the serial rerun passed all 52 suites / 482 tests.

The final full-detail redraw remains the largest unresolved cost. Avoid moving
it wholesale to the UI thread; that could block the card and sheet animations.
