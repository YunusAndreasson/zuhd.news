# Fix verification — 22 September 2026

The findings in README.md describe the original failures. This follow-up records the fixes and subsequent checks.

## Changes

- Delayed story flights run on the UI thread and are invalidated by newer gestures. An interaction epoch rejects taps delivered late to JavaScript and stale UI requests. Scrub activation claims the camera immediately.
- Projection follows current story metadata even when drag/pinch owns the camera. Selection and settling changes bypass the projection throttle.
- Visible market labels participate in hit testing using their actual packed bounds. Suppressed labels have no extra hit region, and overlapping targets still use the chooser.
- Feed reconciliation preserves the selected slug and remaps flight/deck indices without resetting a held camera or zoom.

## Runtime evidence

Android 15/API 35 emulator, development build, Metro 8081. Live feed contained 46 stories. No iOS or physical-device validation was available.

- **Feed reorder: passed.** Selected Mumbai at index 7, panned to latitude 19.08 / longitude 55.82419560452147, then promoted a later Alibaba story through a controlled query-cache update. Mumbai moved to index 8; selected slug, camera coordinates, camera ownership (1), and zoom values remained identical. Original feed and update timestamp were restored; deep equality confirmed restoration.
- **Scrub/pinch/background/resume: passed.** Replayed `map-scrub-pinch-resume-20260922`. Selected London at index 43 while the camera remained near Brasília (-16.29665700337787, -47.89177073064553), zoom held at 12.815228847609037. Projected country was United Kingdom and the offscreen London pin was absent, with no stale Brasília pin. All five executable flow steps passed.
- **Visible market label: passed.** Discovered the live packed Nikkei label bounds and tapped their centre. The Tokyo Stock Exchange / Nikkei 225 detail sheet opened. See `market-label-fixed.png`. Device testing also exposed an extra header offset in gesture-to-canvas conversion; taps now use window coordinates minus the canvas origin.
- **Delayed marker flight: passed.** The recorded marker tap selected Alibaba/Hangzhou at index 15. A drag beginning 156ms after the tap retained the camera at (39.9, 111.61800710718425), owner 1, clip 24 and zoom override 0, instead of the old erroneous landing at (30.27, 120.15). The projected story label was Hangzhou, matching selection. The flow now waits 100ms between actions and uses a 700ms drag: the original 200ms drag sometimes produced no movement on this emulator and was not counted as a successful drag verification.
- **Final pinch/resume replay: passed.** After fixing pinch coordinate conversion using the actual detector-to-window touch offset, London remained selected at index 43, country United Kingdom, with no offscreen pin. Camera stayed at (-9.82889602905876, -47.893742387661064), owner 1, clip 10.650296983844376. All five executable steps passed.
- **Sheet reversal: passed.** Replayed expansion, immediate downward reversal, and horizontal deck swipe from the first collapsed story; the final assertion confirmed Story 2 of 46. An earlier run began with a market modal still open and was discarded as an invalid prerequisite.

The label test also exposed an overlap at the Alibaba read marker and KOSPI label edge. Label hits now rank by distance to the visible label centre rather than an unconditional zero, so both the label and the precise story dot remain selectable. A focused regression covers that overlap.

## Automated checks

Complete verification after the gesture-coordinate fixes passed: **69 suites / 638 tests**, TypeScript, Biome (327 files), and the deprecated API check. After the final label-overlap adjustment, TypeScript and Biome passed again, along with both market suites (**10 tests**, including the added overlap regression). `git diff --check` passed. These are correctness checks on a development emulator, not production frame-rate measurements.
