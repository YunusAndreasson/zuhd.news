# Map redraw investigation — 2026-09-14

Used Argent React/Hermes and Android Perfetto profiling together on emulator-5556, Metro 8082, React Native 0.86.3 development build. React Compiler was detected in both accepted captures. Existing project Biome lint passed; no memoization changes were made.

## Findings and change

Text width measurements already have a font/string cache. Temporary wall-clock instrumentation around label picture recording measured a median of 0.54 ms across 18 frames in the accepted baseline. One 35.6 ms outlier inflated the total to 46.2 ms. Recording all three pictures totaled 242.7 ms. These timings exclude geographic projection and GPU rasterization, and do not establish that all text rendering is cheap.

Hermes samples instead showed geographic rotation, resampling and path construction as major costs. Added a per-globe three-entry LRU cache for immutable land, ice, border and lake paths at exact settled projection coordinates. The key includes geography tier, longitude, latitude, scale, view angle and projection center. Moving frames bypass the cache. Country highlights, markers, text packing and time-dependent daylight still update normally. New destinations still pay the initial geometry cost.

## Comparison

Both accepted runs replayed `perf-map-text`: Pakistan → Sweden → North Korea → Sweden → Pakistan. Country transitions were verified from temporary recorded frame metadata. Each run recorded 18 map frames. All instrumentation was removed after measurement.

| Metric | Baseline | Cache |
|---|---:|---:|
| React capture duration | 27.48 s | 28.03 s |
| Sampled non-idle coverage | 15.27 s | 12.93 s |
| React commits / hot commits | 12 / 9 | 16 / 12 |
| Native jank entries | 357 | 331 |
| High-severity native jank entries | 1 | 5 |
| Exact settled cache hits | none | 2 of 4 |

Cache hits avoided two complete static geometry rebuilds. Lookup plus path retrieval was below 0.02 ms for each hit; the two fresh cache misses spent 2.16 s and 2.38 s building static paths under instrumentation. These are inflated development/emulator wall times, not representative device CPU costs. The two fresh misses and two returns involve different countries, so their times are not a matched speed ratio.

The targeted repeated-work reduction is deterministic (50% fewer settled static geometry builds on this route). Sampled non-idle coverage fell about 15%, below the initial 20% overall target. React commit count increased and native results were mixed; do not claim a proven overall FPS or jank improvement from this single pair. Perfetto is dominated by emulator GPU transport/kernel frames. Retained the bounded cache for its exact reuse benefit; real-device profiling is needed for end-to-end impact.

## Replay limitations

The original 1500 ms momentum-free swipe flow timed out on native accessibility discovery and later did not reliably commit article changes. Those exploratory captures were rejected as comparisons. A 700 ms normal swipe with 5 s gaps completed the intended route. Continuous animation prevented reliable native idle discovery, so the accepted flow omits native await steps; verify destinations separately. Source timing instrumentation was temporary and is not a shipped feature.

`baseline.json` and `after.json` retain starts/stops, action timestamps, timing samples, React/native analyses, combined reports and CPU query results. These files also name the raw profiler artifact paths on this machine.

## Final checks

Typecheck and targeted Biome passed. All 52 Jest suites / 482 tests passed. Replayed all four swipes after removing instrumentation; no runtime warnings or errors in Argent log registry. Runtime confirmed both temporary probe globals are undefined. Changes are not committed or published OTA.
