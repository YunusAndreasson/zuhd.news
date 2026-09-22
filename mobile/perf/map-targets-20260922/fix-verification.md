# Four UX fixes verified

22 September 2026. Android 15/API 35 emulator, 411 × 914 logical viewport,
default text size. The live feed changed from 46 to 45 stories during the work.

| Finding | Change and verification |
| --- | --- |
| Source link squeezed away | Source text wraps while the report link reserves its width and a 44-point minimum height. Gaza's link now measures approximately 60 × 44 points (normalized frame 0.810, 0.860, 0.146, 0.048), versus the original 0.4-point width. Tapping it opens Chrome; Chrome's first-run screen prevents checking the destination content. [Screenshot](fixed-source-link.png). |
| Identical conflict choices | Chooser subtitles include date and locality, then actors and numbered-report fallback for remaining duplicates. The Gaza chooser now distinguishes Az-Zawayda village from Gaza town. [Screenshot](fixed-conflict-rows.png). Regression tests cover both locality and fallback cases. |
| Flood placeholder | Uganda flood now displays “Green alert” and “Flood severity unavailable”; its country alert chip uses the same flood formatting. Native discovery confirmed both hero strings after the final native build. Tests preserve real flood prose and earthquake magnitude zero. |
| Android Back closes rankings | The native dialog routes Back to the country overview while a ranking is active. Verified ranking → hardware Back → overview twice, including an uninterrupted seven-step recorded replay. A subsequent hardware Back closes the overview to the map. [Overview after Back](fixed-ranking-back.png). |

The native change is persisted in `patches/@expo+ui+57.0.19.patch`, applied
with `patch-package --error-on-fail` at install. Android autolinking must compile
`expo-ui` from source, because its prebuilt AAR does not contain the patch.
A new native Android build is required; an OTA-only update is insufficient.

Verification:

- 69 Jest suites, **643 tests passed**.
- TypeScript, Biome (327 files), deprecated-API checker, and `git diff --check` passed.
- Final Android build compiled `expo-ui` from source: **BUILD SUCCESSFUL**, 571 tasks.
- Patch generation and application succeeded.
- Final debugger connection captured zero JS log entries.

Replay the regression with:

```sh
argent flow run country-back-fixed-20260922 --device emulator-5554 --platform android
```

Prerequisite: Uganda country overview open at its initial scroll position with
the refugees-hosted metric visible. The flow opens that ranking and returns to
the overview; all targets are semantic selectors, with no coordinate exceptions.

The first native build used Expo's prebuilt UI library and did not fix Back.
The source build then exposed an unavailable Compose helper; the final patch
uses the existing dialog Back dispatcher and key listener instead. A subsequent
development-launcher start failed with “App react context shouldn't be created
before”; reopening the development URL recovered it before verification.

iOS, physical hardware, predictive edge-Back gestures, and larger text were not
retested in this fix pass. The hardware Back result is specific to the Android
emulator. No production release was made.
