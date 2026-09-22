# Map interaction stress check — 2026-09-22

## Environment and scope

Argent on the `zuhd-qa` Android emulator (`emulator-5554`, Android 15/API 35,
411 × 914 logical screen), Expo development client, Hermes, RN 0.86.3,
Metro 8081. Default text size and dark theme. The live feed had 42 stories.
Used the Argent optimization, React profiler, device interaction and flow skills.

This is a development-emulator interaction check, not a production frame-rate
benchmark. iOS, physical hardware, large text and light theme were not checked.
Existing and concurrently edited map work was preserved.

## Fixes from this check

- `hooks/useCameraFlight.ts`: a story swipe could claim the camera during an
  active flight when latitude/longitude were already close to the front story.
  That proximity did not imply matching zoom: a return from a held whole-earth
  view could abruptly drop the zoom override. Keep the current flight/zoom
  ownership until landing, or let the next completed swipe retarget it.
  Two regression cases failed before the fix and passed afterward; the complete
  camera-flight suite passed (14 tests).
- `components/MarketBrowserSheet.tsx`: independent instrument updates invalidated
  exchange-card construction, including formatted histories. Memoize exchange
  rows against exchanges/filter independently of the instrument feed.
  This removes unnecessary work; the warmed profile does not establish a
  measurable user-visible speedup.

## Device verification

Four replayable fragments are saved under `.argent/flows/`:

| Flow | Coverage | Result |
| --- | --- | --- |
| `map-stress-20260922` | Map drag, zoom out, zoom in, header remains available | Passed before/after profiling |
| `map-story-stress-20260922` | Next story then previous, story position assertions | Passed, including final replay after interruptions |
| `map-markets-stress-20260922` | Open markets from menu, rising/falling/other-data filters, dismiss | Passed |
| `map-interruptions-20260922` | Zoom out then eight alternating story swipes with no added delay | Passed; first-story position restored |

Fragments declare their starting screen and default-text prerequisites. Raw
canvas/deck gestures intentionally use the discovered region; the interruption
sequence deliberately avoids idle waits between gestures. Automated assertions
check end states, not every animation frame.

Also manually verified readable market filters and signs, story expansion,
collapse by tapping the exposed map, and a direct KOSPI globe-marker tap opening
the Korea Exchange detail/chart. Marker coordinates came from the live projected
frame and were checked against its hit-test result, not inferred from pixels.
Closing the detail sheet restored the map; subsequent story navigation passed.
No app crash or persistent interaction lock was observed during these checks.

The Expo development Tools bubble initially intercepted a header tap. Moving
that development overlay restored access; this was not treated as an app defect.

## Performance evidence

| Capture | Duration | React observations | Sampled CPU |
| --- | --- | --- | --- |
| Initial walkthrough, `105309` | 44.532 s | 24 commits, 11 ≥16 ms; repeated MarketBrowserSheet instrument-prop renders | Includes startup/tooling contention; unsuitable as a speedup baseline |
| Warm pre-fix replay, `105452` | 9.342 s | 1 commit below 16 ms | 9,341.6 ms coverage; 7,600.5 ms idle, approximately 1,741.1 ms active |
| Warm post-memoization replay, `105549` | 8.808 s | No captured commits | 8,807.3 ms coverage; 7,174.5 ms idle, approximately 1,632.8 ms active |

Both warmed runs were approximately 18.5% active sampled CPU. Different capture
lengths and absent post-fix commit data preclude an FPS or percentage-speedup
claim. Projection/resampling and globe-frame recording remained CPU contributors.
Android native profiling is not supported by the available Argent native skill.

A temporary frame diagnostic found no mid-gesture rest-tier oscillation in the
sampled drag/zoom replay; it was removed. The final console registry was empty,
but warned that an earlier debugger teardown deleted three entries. Therefore
this run does not establish a clean uninterrupted console-log history.

## Validation

TypeScript, Biome (324 files), and deprecated dependency API checks passed.
The initial full verification hit a sandbox `spawnSync node EPERM` in the API
checker test; that test passed outside the sandbox. The final full-suite run
outside the sandbox passed all 67 suites and 620 tests in 61.105 seconds.
