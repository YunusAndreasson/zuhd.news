# Android QA — 2026-09-27

Status: fixes verified; push registration/delivery blocked by missing Firebase Android configuration.

## Setup

Native Android debug APK built and installed on `zuhd-qa` (Android 15/API 35, x86_64). Metro8081, Hermes debugger, Argent native accessibility discovery and native logcat used. Device interactions used Argent; unsupported Android settings and diagnostic reads used adb. Tested normal and large app text, system font scales1.0/1.8/2.0, light/dark appearance, airplane mode, background/foreground and cold process launches. Screenshots and replay fragments are stored alongside this report and in `.argent/flows`.

The emulator's GPU reported a compatibility warning at boot. This pass establishes functional behavior, not physical-device performance or iOS parity. The app was tested as a development build.

## Fixed

1. **Saved story deletion had no Undo in the saved list.** Added an accessible in-page Undo for multiple deletions. Restoration preserves order/timestamp and does not overwrite a story saved again. Reader Undo uses the same restore operation. Verified remove-last/empty/Undo and persistence; added store regression tests.
2. **Android font-setting activity recreation reverted app preferences.** Theme initialization reused launch-time preferences. It now retains edited preferences across provider remounts. Verified actual font-scale recreation and cold restart; regression test covers appearance, size, font and haptics.
3. **Chart range labels clipped seven-figure values.** Added room and constrained number/unit layout. Verified MERVAL min/max in large text; before/after screenshots included.
4. **Briefing automatically replayed after completion.** ExoPlayer kept playback intent when the app rewound it. Pause before rewind. Verified seek-near-end, completion, idle UI, native playback state and fresh play at0:00; added regression test.
5. **New menu pages inherited the parent page's scroll offset.** Keyed ordinary scroll pages by destination. Verified scrolled menu -> rankings starts atPopulation.
6. **Country ranks wrapped into multiple lines at large system font sizes.** Applied the existing tabular scaling cap and single-line layout. Verified India's #11 density rank.
7. **Long sheet titles covered Back.** Reserved space on both sides and bounded heading wrapping. Verified a long earthquake title and Back interaction.
8. **Back lost list position and market filters.** Retain the originating virtualized list behind its detail page, excluded from accessibility/touch and with its measured viewport preserved. Deep disaster-list labels and exact normalized frames matched before/after; falling-market filter and rows survived detail/Back.
9. **Denying notification permission forced users into Android Settings.** Keep the switch off, explain the denial inline, and offer a separate settings action. Verified denial, explicit action, OS grant, return and successful enable. Restored notifications off afterward.

## Exercised flows

- Search with keyboard open, results and story selection; long article scrolling; source expansion and external browser dispatch/return; save and saved-story recovery.
- Market filters and detail charts; country population ranking -> country -> density ranking (selected country highlighted) -> Back;100-row disaster list, repeated scrolling and earthquake details.
- Briefing start, pause, seek, hide, background playback, foreground synchronization, saved-position cold resume, end-of-recording and restart.
- Offline cached reading and story navigation; failed pull refresh retains content; reconnection and successful refresh without restart.
- Valid story and missing-story custom links; missing link surfaces an unavailable message and dismisses an open menu.
-20 rapid deck swipes per round trip, repeated twice. An observed midpoint reached story10 and the final position returned to story1. Rapid gestures may coalesce; this is not a claim that every input advanced exactly one story.
- Globe zoom out to sphere, pan across hemisphere, zoom back in; selected story and reading sheet remain intact.
- Large text/light mode, default text/dark mode, preference recreation and persistence, notification permission denial/recovery, tips reset feedback.

## Outstanding and limits

- **Android push registration fails:** native log reports `Default FirebaseApp is not initialized`. No `android.googleServicesFile` is configured and no app `google-services.json` was found. The Play submission service account is a different credential and cannot substitute for Firebase app configuration. User has been asked for the existing Firebase configuration/project. Push delivery cannot be claimed working.
- Direct globe-marker selection was not added to this pass: the Skia canvas has no individual native accessibility targets. Screenshot-derived tap coordinates were not used. Pan/zoom and story-driven map focus were verified.
- Opening an original source reached Chrome's first-run screen; browser dispatch and return were verified, not completion of that website's onboarding.
- Native log includes Argent watchdog disconnect crashes (automation service, not app), a dev-client background-task warning, and the Firebase failure. A text-rendering error introduced during the notification-action edit was corrected (`MenuRow` uses `leave`, not `external`). No app native crash/ANR was observed in the tested flows.

## Validation and handoff

See `/tmp/zuhd-qa-final-verify.log` for the final complete verification run. Earlier current-code run passed809 tests across87 suites after rerunning its sandbox-blocked subprocess check outside the sandbox. Final run status is appended below once complete.

No commits, release builds, OTA updates or deployments were made. Existing package manifest/lockfile dependency edits predate this QA and were preserved. Emulator font scale restored to1.0; app default text, Source Sans, dark appearance, notifications off; OS notification permission restored to granted; airplane mode off. Normal keyboard and hidden Expo Tools overlay remain useful QA setup changes.

Final verification completed successfully: `npm run verify` exited0; typecheck, Biome362 files, API checker, and all87 suites/809 tests passed in one unrestricted run. `git diff --check` passed.

Handoff blocker rechecked: no Firebase Android config file exists and `android.googleServicesFile` remains unset. Argent services for emulator-5554 were stopped. Metro was left running. Goal is blocked pending the existing Firebase app configuration/project; it is not marked complete.

## Notification article routing follow-up

Found two code paths consistent with opening the wrong story: notification intents were ignored when the slug was absent from the local feed/bookmarks, and a delayed long-return refresh could override the notification selection with the front story. The opener now resolves the exact slug through the story endpoint, rejects mismatched payloads, retains opened articles across feed replacement, and gives explicit navigation priority over resume landing. Older asynchronous opens cannot override newer taps. Deep links and related-story cards share the resolver.

Regression tests cover absent-feed resolution, mismatched payloads, out-of-order responses, failure reporting, notification deduplication, and cold/long-return landing priority. Native Android local notification delivery was observed, but Argent exposed no notification-shade elements, so the tap itself was not verified. No physical-phone push validation or deployment was performed.
