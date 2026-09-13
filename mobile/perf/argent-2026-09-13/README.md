# Argent performance optimization — 2026-09-13

Eight independent effects in `MiniGlobe` each performed a full projection when
their inputs changed. A startup commit could update fonts, geometry and several
cached data layers together, repeating the same expensive projection. These now
share one effect with the union of their dependencies. Initial layout, camera
motion, zoom finalization, theme-only drawing and resume invalidation remain intact.

## Measurement

Argent on the running `zuhd-qa` Android API 35 x86_64 emulator, Hermes, React Native
0.86.3, Expo development build, React Compiler enabled. Temporary instrumentation
timed `callReproject` including picture recording and counted calls; it has been
removed from the final source. The four adjacent JSON files are the raw samples.

| Cached startup comparison | Before calls | After calls | Before projection time | After projection time |
| --- | ---: | ---: | ---: | ---: |
| 1 | 18 | 6 | 2,751 ms | 1,510 ms |
| 2 (baseline restored, then fix reapplied) | 17 | 5 | 3,314 ms | 1,388 ms |

This is 67–71% fewer projections and 45–58% less accumulated projection time.
It is **not** a measurement of total launch time or production-device speed.
Both comparisons reloaded the same cached feed at Cape Town, default 90-degree
globe angle, dark appearance and large text. Asynchronous refreshes were not
mocked, which explains the one-call variation. The repeated elimination of seven
mount-effect projections is independent of that variation. Target: reduce redundant
startup projections by at least 30%, without changing projection output.

Reusable Argent flows: `.argent/flows/perf-globe-startup.yaml` (reload and wait for
the story button) and `.argent/flows/perf-globe-drag.yaml` (three one-second drags).
The startup flow checks readiness; reproducing timing numbers requires adding a
temporary timer around `callReproject` again. Final reload confirmed the temporary
`globalThis.__globePerf` recorder is absent.

## Interaction profiling and limitations

Argent React CPU sampling identified geographic projection/Skia work; native
Perfetto identified substantial emulator GPU transport overhead. Before/after
drag traces reported 25/23 jank events, which is not a meaningful improvement.
The follow-up drag capture had zero React commits, so no React-render speedup is
claimed. Combined analysis could not correlate that capture without commit data.
Gesture annotation wall-clock offsets exceeded the reported React sample duration;
do not use them for precise temporal correlation. Native traces remain under
`/tmp/argent-profiler-cwd/native-profiler-20260913-191523.pftrace` and
`native-profiler-20260913-191823.pftrace`; React sessions are `20260913-191552` and
`20260913-191830` in the same directory.

## Verification

- `npm run verify`: typecheck, Biome, deprecated API check, 47 Jest suites / 453 tests passed.
- Device checks: startup, three-direction globe drag, story index, search and
  selecting a result, expanded story and sources, saved stories, settings, map
  key, about, privacy, contact, Hormuz details, light/dark appearance and text
  sizing. Original dark/large preferences restored.
- Argent log registry showed no JavaScript warnings or errors during checks.
- Before optimization, an initial debugger reconnect encountered a native Fabric
  `MountingCoordinator::pullTransaction` SIGSEGV. Relaunch recovered; it was not
  attributed to this change, and later reloads/checks completed successfully.

## Review findings not changed

The performance lint sweep covered 153 source files: 309 initial warnings, 302
after consolidation (seven hook-dependency warnings removed, no new warnings).
Most warnings were reference
allocations already eligible for React Compiler; no blanket memoization was added.
Semantic review covered lists, animations, memoization, async work, cleanup,
state and context. Follow-up candidates include story-index/bookmark virtualization,
zoom-finalizer timer cleanup and response-body cancellation. They were not established
as the dominant measured bottleneck in this run and were not bundled into this fix.
