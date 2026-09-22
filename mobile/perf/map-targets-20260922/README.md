# Map target coverage and remaining UX findings

22 September 2026. Continued the original map stress-test goal after the camera,
highlight, label and feed-reorder fixes. Android 15/API 35 development emulator,
411 × 914 logical viewport, default text size, 46-story live feed. No application
source was changed in this additional investigation.

## Confirmed findings

1. **Long source names squeeze the report link almost out of existence.**
   From the Riyadh view, tap the Gaza marker, then choose Gaza in the mixed
   Suez/conflict/genocide chooser. The source occupies width 0.912 of the screen;
   “Open the finding” has width **0.001**, approximately 0.4 logical points, at
   x=0.956. Its text is clipped too. `SheetSourceFooter` uses an unwrapped row
   without reserving space for the link. Preserve a usable link target and let
   the source wrap, or put the link on its own row.
   Evidence: [clipped-source-link.png](clipped-source-link.png), native element
   bounds, `components/SheetContent.tsx` lines 157–183 and `sourceLine` style.

2. **Conflict choices can be indistinguishable.**
   The same chooser contains two identical “1 killed · Armed clash, kinetic
   event · Israel” buttons. They have different event IDs, but the choice gives
   neither date nor locality. Opening one shows Az-Zawayda village and a date
   about a month old—information available to distinguish the rows.
   Add locality/date to conflict chooser subtitles, with a further fallback
   when those also match. Evidence: [duplicate-conflict-rows.png](duplicate-conflict-rows.png)
   and `components/DisambiguationSheet.tsx` conflict row construction.

3. **A placeholder is presented as meaningful flood severity.**
   Tap the Uganda flood marker near the Congo conflict marker and choose
   “Flood in Uganda”. The hero reads **“Magnitude 0”**. The shared parser
   explicitly documents that flood records publish this placeholder, then
   falls back to displaying it unchanged. Prefer the alert level or an explicit
   unavailable-severity state; do not turn missing information into a zero.
   Evidence: [flood-placeholder.png](flood-placeholder.png), `shared/gdacs.ts`
   `parseSeverityHero` flood fallback.

4. **Android back bypasses the country sheet's internal back navigation.**
   Flood → Open Uganda → refugees-hosted ranking displays an in-sheet Back
   control. Hardware Back closes the whole country sheet instead of returning
   to the country overview. This is a navigation-consistency issue rather than
   a crash or input lock. Consider consuming Back for the ranking first.

## Coverage audit

| Interaction family | Evidence and outcome |
| --- | --- |
| Drag and pinch | Replayed `map-stress-20260922` on final source: all 6 executable steps passed; header remained reachable. |
| Story/read markers, delayed actions | Previous final-source verification selected Alibaba, interrupted its delayed flight with a drag, and preserved the explored camera; see linked fix report. |
| Story swipes, scrubbing, sheet reversal | Previous final-source interruption/resume and reversal flows passed. Additional scrub-to-last and repeated beyond-end swipes reached the caught-up card at index/progress 46, without overrunning it; first-story reverse swipe stayed at 0. |
| Markets and labels | Direct labels, circles, crowded market chooser and detail navigation covered in preceding reports; label overlap regression added and verified. |
| Shipping straits | Direct Hormuz marker opened Strait of Hormuz metrics; Android Back returned to map. Mixed Bab el-Mandeb and Suez chooser entries were visible. |
| Disasters | Uganda flood selected through a two-item chooser; disaster sheet and Open Uganda navigation worked. Severity presentation issue above. |
| Conflict | Gaza mixed chooser → conflict detail worked and displayed source, locality and date. Duplicate chooser labels above. |
| Genocide overlay | Gaza chooser → detail worked, including body and country action. Source-link layout issue above. |
| Food insecurity | Holl-Holl Camp marker → mixed chooser → IPC phase 4 / Emergency / population detail worked; Djibouti and IPC link controls were visible. |
| Thermal anomalies | Live FIRMS snapshot contained zero events. Temporarily inserted a clearly named `QA thermal fixture` into the local query cache, discovered its projected marker, and tapped it. Sheet showed 120 MW, 3 detections, high confidence, day pass and FIRMS link. Restored original data and update timestamp; deep equality passed and final thermal count was 0. No server data changed. |
| Country land fallback | Discovered Belarus land hit → Belarus sheet worked. |
| Makkah | Discovered a Makkah hit away from the overlapping story catch area → Saudi Arabia sheet worked. Story precedence at overlapping marker centre matches the existing policy. |
| Country cards and rankings | Saudi Arabia card 2 changed from complexity to economic momentum; Uganda refugees-hosted ranking opened. Back inconsistency above. |
| Hotspots | Bab el-Mandeb mixed chooser → Yemen hotspot produced the actionable story-title toast. A later tap after the toast expired hit the underlying story; not counted as successful toast navigation. |
| Empty map | A discovered null hit produced no modal or story change. |
| Dismissal and recovery | Hardware Back returned from all tested modal families. App remained responsive throughout. |
| Larger text / clustered targets / resume | Earlier investigation covers 150% text, six-market chooser and resume; system font was restored to 1.0. |

Final console registry for this pass had zero captured entries. This establishes
no captured JS errors during this connection, not an all-session native crash
audit. No crash or persistent gesture lock was observed.

Prior evidence:
- [Initial interaction/profiling report](../map-stress-20260922.md)
- [Interruption and larger-text investigation](../map-hunches-20260922/README.md)
- [Four-fix verification](../map-hunches-20260922/fix-verification.md)

This is representative coverage of map interaction families, not every live
marker or every timing combination. iOS, physical hardware, release-build FPS,
long offline intervals and a full screen-reader audit remain outside the
available device verification. The four findings were subsequently fixed; see
[fix verification](fix-verification.md) for changes, checks and remaining limits.
