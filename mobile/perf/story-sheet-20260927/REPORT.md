# Story sheet investigation — 2026-09-27

Status: gesture fixes verified; overall phone animation performance remains unverified.

## Retained changes

- MapSheet discards only the gesture claim slop, preserving movement when a busy frame delivers activation late. Regression test covers a large coalesced vertical drag that previously snapped back.
- StoryDeck resets scrolled content using the sheet's UI-thread progress. It no longer launches a separate native animated scroll while the closing spring runs. Tests cover closing, reversal, and content already at the top.

## Native verification

Android API 35 x86_64 emulator (`emulator-5554`, zuhd-qa), Hermes/new architecture, native `debugOptimized` APK built with `:app:assembleDebugOptimized -PreactNativeArchitectures=x86_64`; Metro supplies the local JavaScript. No physical phone or iOS target was connected.

The large-text Nigeria article was scrolled until its headline left the viewport, closed with Android Back, and reopened by its headline. Closing restored the headline together with sheet movement; reopening began at the top. The repaired `story-sheet-scrolled-close-20260927` flow replayed successfully, with both endpoint accessibility trees checked. The previous recording included a timing misfire in Settings; the repaired flow starts directly from the expanded article and includes waits before endpoint checks.

Recording: `../../.argent/recordings/screen-recording-emulator-5554-1790514841102.mp4`. A 30fps recording demonstrates scroll coordination, not 60/120fps smoothness.

## Rejected experiments

The adjacent baseline/bounds/settlement profiler reports document investigation, not the final implementation. Deferring React detent commits, translating the globe touch boundary instead of laying it out, and hardware rasterization were removed because measurements did not establish a consistent benefit. No native fast-path flag was enabled.

Three open/close cycles on the optimized build, without profilers:

| Experiment | Frames | Janky | Median | p95 |
| --- | ---: | ---: | ---: | ---: |
| Original baseline | 137 | 39.42% | 46ms | 125ms |
| Deferred commits + boundary candidate | 124 | 61.29% | 53ms | 125ms |
| Candidate + hardware texture | 120 | 72.50% | 65ms | 133ms |

These small emulator samples are noisy and unsuitable for claims about phone FPS. Native profiling found substantial emulator graphics transport cost. The final retained gesture fixes are not represented by the speculative candidate rows above.

## Checks and remaining work

Typecheck, Biome and deprecated API scan passed. Full Jest run passed 817/818 tests; the remaining subprocess test hit sandbox `spawnSync EPERM` and passed when rerun outside the sandbox. Total: 818 tests passing across those runs. `git diff --check` passed.

Next required evidence: reproduce and profile opening and closing on the affected phone/platform with an optimized build. Compare identical interactions before and after, including taps, interrupted/fast drags and scrolled content. Overall smoothness is not declared fixed and the goal stays active. No release, deployment or OTA update was performed.
