# News sheet motion — Argent, 2026-09-14

The vertical news sheet now uses a critically damped, overshoot-clamped spring
for releases, programmatic moves, and changes in story height. Its old spring
could rebound beyond a stop while the globe/banner progress was clamped there,
then visibly reverse as the sheet came back. Gesture activation now cancels the
previous animation and captures both the sheet position and finger translation,
so catching a moving sheet does not reuse its touch-down position or activation
slop. Animated globe radius no longer rounds to whole points between story heights.

All continuous motion remains on the UI thread, using the existing sheet
translation, Skia drawing transform, and banner opacity. No new per-frame React
updates, globe projections, dependencies, or persistent instrumentation were added.

## Measurement

Argent React/Hermes and native Perfetto profiling ran on the Android API 35
`pixel` emulator (`emulator-5556`), development build, Metro 8082. The original
MapSheet was restored for the baseline, then the fix was restored and explicitly
reloaded. Both final captures used **10-Year Yield Hits 5%**, with expanded and
collapsed offsets of 55.333 and 249.333 points. Globe-radius rounding had already
been removed in both of these captures; this comparison isolates the sheet fix.

The saved flow `.argent/flows/perf-news-sheet-slow.yaml` performs two expand/collapse
cycles with one-second swipes and three-second waits. Temporary `useFrameCallback`
instrumentation captured UI timestamps and sheet offsets. It was removed, and
Argent evaluation confirmed `globalThis.__sheetPerf` is absent in the final bundle.

| Metric | Original sheet | Fixed sheet |
| --- | ---: | ---: |
| Maximum overshoot past expanded stop | 22.99 pt | 0 pt |
| Final offset | 252.996 pt | 249.333 pt |
| Native jank events reported | 84 | 40 |
| React commits | 7 | 15 |
| React commits at least 16 ms | 6 | 4 |

The raw timestamp/offset samples and profiler reports are alongside this file.
Overscroll beyond the **collapsed** stop while the finger pulls is intentional
pull-to-refresh resistance, so maximum raw offset is not a rebound metric.

Treat the jank reduction as directional, not a production speed estimate. Native
CPU hotspots were dominated by emulator GPU transport/kernel work; frame delivery
was highly irregular. React commit count increased while the number of slow
commits decreased, so this is not a claim of fewer React renders. Combined profiling
found no matching React commit windows for the native jank. Real-device frame-rate
and latency improvements remain unverified. An earlier disconnected capture,
short swipes that did not reliably complete both detents under emulator load,
and a replay before an explicit bundle reload are excluded from these numbers.

Native trace filenames: `native-profiler-20260914-173104.pftrace` (baseline) and
`native-profiler-20260914-173315.pftrace` (fixed), under `/tmp/argent-profiler-cwd`.

## Verification

- `npm run verify`: typecheck, Biome, deprecated API check, 50 Jest suites / 473 tests passed.
- Added a regression check for continuous sub-point globe scaling; existing
  globe centre, radius limit, and full-canvas coverage checks still pass.
- Final bundle: expansion shrinks the globe and hides the gauges; collapse
  restores both. An immediate upward/downward reversal returns to peek.
- Argent runtime log registry: no warnings or errors during final checks.

Spring semantics were checked against the installed Reanimated source and its
[official withSpring documentation](https://docs.swmansion.com/react-native-reanimated/docs/animations/withSpring/).
