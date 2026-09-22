# Expo UI Android sheet Back handling

`@expo+ui+57.0.19.patch` adds an optional `onBackPress` to community bottom
sheets. The Android adapter forwards it to the dialog's Android Back dispatcher
and key listener, disabling default back dismissal only while a callback is supplied.
Scrim and downward-swipe dismissal remain unchanged. With no callback, native
Back behavior is unchanged; iOS does not use the callback.

Country rankings use this to return to the country overview before dismissing
the sheet. React Native's activity-level BackHandler cannot intercept the
dialog's Back events.

`npm install` applies the patch through postinstall with `--error-on-fail`.
The Android autolinking `buildFromSource: ["expo-ui"]` setting in package.json
is required: otherwise Expo uses the prebuilt AAR and ignores the Kotlin patch.
Revisit the patch when upgrading Expo UI. This changes Kotlin code: a native
Android rebuild is required; a JavaScript-only update cannot supply the fix.
