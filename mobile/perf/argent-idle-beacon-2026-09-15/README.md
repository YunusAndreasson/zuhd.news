# Active-story beacon pulse rendered forever — 2026-09-15

Decision: bound the active-story dot's "breathe" animation to 3 cycles (6 reps
of one 900ms leg) instead of `withRepeat(..., -1, true)`. It still identifies
a newly active story; it no longer keeps the app rendering for as long as any
story is on screen — which is always.

## Context

This globe beacon (`components/globe/MiniGlobe.tsx`, `activePulse`) was added
2026-09-14 (commit `64595d1d`, "Improve globe beacon and stabilize news
controls"), after the perf investigations recorded elsewhere in `perf/`. It
was never profiled for the "renders at rest" regression class `mobile/CLAUDE.md`
already documents under "Perf reminders" ("At rest the app renders zero
frames, and two shapes break that silently" — this is a third shape, not yet
in that list).

The pulse itself was already careful in one respect: it drives a plain native
`Animated.View` via `useAnimatedStyle` (`beaconStyle`), not a value read inside
the Skia canvas recorder — the comment beside it says "No pulse value enters
the Canvas," specifically to avoid re-triggering a full `SkPicture` replay
every frame. That part of the design holds. The bug is orthogonal: regardless
of how cheap each frame is, `withRepeat(..., -1, true)` never stops, so the
app never reaches "zero frames rendered" no matter how long it sits untouched.

## Measurement

`dumpsys gfxinfo news.zuhd.app reset`, Android API 35 `zuhd-qa` emulator
(`emulator-5554`), development build, Metro 8081, React Compiler enabled. App
fully untouched (no gestures) for the measurement window; a story was on
screen throughout, as it always is.

| | Before | After |
| --- | ---: | ---: |
| Idle window | 10s | 8s |
| Total frames rendered | 144 | 0 |
| Janky frames | 144 (100.00%) | 0 (0.00%) |
| 50th percentile frame time | 113ms | — |
| 90th / 95th percentile | 200ms / 250ms | — |

Argent's dual React/native profiler also captured the saved
`.argent/flows/globe-fling-pinch-bench.yaml` flow (two flings, pinch in, pinch
out — ~13.5s including settle waits) before and after, on the same emulator.
Neither run touched anything React-side (0 `fiber_renders_captured` both
times — the globe's moving layers draw without React, as documented), so this
is a native-only comparison, and the two capture durations are not identical
(17.8s vs 12.4s React-session wall clock, reported by the profiler itself
alongside each native trace) — treat the *shape* of the jank timeline as the
finding, not a precise ms-for-ms ratio.

| Native Perfetto (Android) | Before | After |
| --- | ---: | ---: |
| UI hangs (jank events) | 121 | 25 |
| High-severity (🔴) hangs | 4 (545/626/1061/662ms) | 0 |
| `goldfish_pipe_read_write` CPU samples (Main+Render thread) | 493 | 198 |
| Jank timeline shape | continuous, ~every 60–90ms, from t=0.06s to the end of the trace, regardless of gesture activity | absent for the first ~3s (before the first gesture starts), then tracks the actual fling/pinch windows |

`goldfish_pipe_read_write` and `internal_get_user_pages_fast` are QEMU
GPU-transport/kernel frames (per the existing note in every prior report in
this directory) — not app code, and not representative of a physical device.
They're included here only because their sample count dropping alongside the
jank count is consistent with "fewer frames submitted," not proof of it on
its own.

Full raw reports: `native-baseline-fling-pinch.md`, `native-after-fling-pinch.md`.

## Fix

`components/globe/MiniGlobe.tsx`: `withRepeat(withTiming(...), -1, true)` →
`withRepeat(withTiming(...), ACTIVE_PULSE_REPS, true)` with
`ACTIVE_PULSE_REPS = 6` (3 full up/down cycles, ~5.4s), plus a comment at the
`activePulse` declaration recording why this must stay bounded. Nothing else
about the pulse changed — same easing, same duration per leg, same trigger
(a newly active story slug), same Reduce Motion gate.

## Verification

- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 52 suites / 482 tests passed, unchanged.
- Reload + `debugger-log-registry`: no warnings/errors.
- Manual: swiped to a new story, confirmed the dot still visibly breathes on
  the change (screenshot showed the glow mid-pulse near the new story's mark)
  and settles back to its resting size after a few seconds.
- Not committed or published OTA.
