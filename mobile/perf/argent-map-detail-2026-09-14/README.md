# Map detail switching experiment — 2026-09-14

Decision: reject retaining the existing detailed geometry on every moving frame. Restored MiniGlobe.tsx byte-for-byte to its pre-experiment state, preserving the earlier settled geometry cache and native pulsing beacon. No OTA published.

## Method

Argent React/Hermes and Android Perfetto captures on emulator-5556, Metro 8082, RN 0.86.3 development build, React Compiler enabled. Replayed the saved `perf-map-text` flow: Pakistan → Sweden → North Korea → Sweden → Pakistan, four 700 ms swipes with 5 s spacing. Warmed the route before measurement. Captured temporary per-projection wall time, detail tier, settled state, country and scale. These measurements include projection and picture recording, exclude GPU presentation, and are not FPS measurements.

Variants:

- Current: motion topology during movement, scale-selected topology and lakes when settled.
- Consistent all: scale-selected topology throughout, lake fills throughout.
- Consistent coasts: scale-selected topology throughout, original settled-only lakes.

The camera scale stayed below 500 throughout this route, so the consistent variants used the same overview topology throughout; scale-threshold switching did not confound this test. A first consistent-all warm-up lost its debugger response and was discarded. Restarting the app required reopening its development-client URL and waiting for startup. The accepted consistent-all run and repeated baseline ran in that same process with the route warmed. The coasts variant followed a source refresh and another warm-up.

## Results

| Metric | Current, initial | Consistent all | Current, repeated | Consistent coasts |
|---|---:|---:|---:|---:|
| Moving map updates | 12 | 4 | 13 | 4 |
| Median moving update wall time | 244.7 ms | 3023.3 ms | 284.0 ms | 2986.0 ms |
| Total moving update wall time | 7.32 s | 12.08 s | 6.94 s | 15.57 s |
| Longest moving update | 3523.0 ms | 3584.3 ms | 1555.7 ms | 7218.0 ms |
| Settled destinations captured | 4 | 4 | 4 | 3 |
| React capture duration | 41.47 s | 34.91 s | 32.03 s | 38.77 s |
| React commits / hot commits | 16 / 10 | 17 / 9 | 18 / 11 | 18 / 11 |
| Native jank entries / high severity | 220 / 9 | 428 / 1 | 322 / 3 | 327 / 1 |

The accepted consistent-all run completed the same four destinations but produced only one intermediate projection per swipe. Its median moving update cost was 10.6× the repeated baseline and total moving work was 74% higher despite drawing fewer updates. Both baseline captures showed substantially more intermediate map updates.

The coasts-only warm-up completed all destinations, but its profiled run missed the return-to-Sweden settled frame: a 7.2 s moving update extended beyond the next gesture. Treat that run as a responsiveness failure, not a matched-route speed comparison. Deferring lakes alone did not make retaining overview topology viable.

Hermes CPU drill-down for the coasts run showed geographic rotation, point processing, ring processing and path moveTo/lineTo among the hotspots. Fine geometry has a real projection cost beyond React rendering. The motion topology also removes tiny polygons, while overview retains them, so this experiment changes both vertex simplification and polygon workload.

## Limits and next direction

These inflated wall times come from a development emulator under profiling. Perfetto is dominated by emulator GPU transport (`goldfish_pipe_read_write`), capture lengths differ, and native severity counts are mixed. Do not infer physical-device FPS or a precise native-jank percentage change. No video-based perceptual smoothness score was collected; the continuity evidence is the recorded projection sequence and loss of intermediate updates.

Removing motion-detail switching eliminates that specific coastline detail swap, but the tested implementation replaces it with longer stalls. A follow-up should reduce the geographic projection workload or test a bounded, intermediate topology before considering a stable detail level. Simply keeping the full resting geometry is rejected.

JSON files retain raw tool responses, action timestamps, projection samples, React/native analysis and combined reports. Temporary instrumentation and the runtime experiment switch were removed after testing.

## Final verification

Typecheck and targeted Biome passed. Replayed all four swipes after restoring the original source; final component discovery confirmed Story 1 of 43 and the screenshot showed the expected Pakistan map without an error overlay. Runtime confirmed the experiment global is undefined. The log registry was empty but explicitly reported a prior teardown, so it is not evidence that the entire session was warning-free.
