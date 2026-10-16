# Patches

`npm install` applies these through postinstall with `--error-on-fail`. Each
changes native code: a native rebuild is required; a JavaScript-only update
cannot supply it. When the package moves, rebuild the patch against the new
version or drop it once upstream carries the fix.

## `@expo+ui+58.0.20.patch`: Android Back inside a bottom sheet

Adds an optional `onBackPress` to community bottom sheets. The Android adapter
forwards it to the dialog's Android Back dispatcher and key listener, disabling
default back dismissal only while a callback is supplied. Scrim and
downward-swipe dismissal remain unchanged. With no callback, native Back
behavior is unchanged; iOS does not use the callback.

Country rankings and the menu use this to step back a page before dismissing
the sheet. React Native's activity-level BackHandler cannot intercept the
dialog's Back events, and upstream's `shouldDismissOnBackPress: false` swallows
Back without telling JavaScript (expo/expo#50555 asks for the callback).

Metro bundles the package's compiled `build/` files, so the patch changes
`build/community/bottom-sheet/BottomSheet.android.js` beside the `src/` and
`.d.ts` files. The Android autolinking `buildFromSource: ["expo-ui"]` setting
in package.json is required: otherwise Expo uses the prebuilt AAR and ignores
the Kotlin patch.

## `react-native-reanimated+4.7.1.patch`: unparseable animation scale

Backports software-mansion/react-native-reanimated#10824. `getIsReducedMotion`
read the system transition animation scale as a string and parsed it with
`toFloat()`, which throws on a value such as `1,0` or one written in
Arabic-Indic digits: Android crashed at launch. `Settings.Global.getFloat`
falls back to `1` instead. Drop once a Reanimated release includes #10824.

## `@shopify+react-native-skia+2.14.0.patch`: Metal device over-release

Backports wcandillon/react-native-skia#4131 (issue #4130). `MetalContext`
handed the backend context the system Metal device with `reset`, which adopts
a reference it never got; each thread-local context destroyed released the
shared device once more, until iOS crashed inside Metal. `retain` balances it.
Drop once a Skia 2.x release includes #4131.
