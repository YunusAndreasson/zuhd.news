module.exports = function (api) {
  // Safe to cache unconditionally: this config no longer branches on
  // process.env. (It used to, while calling api.cache(true) — which freezes
  // the first-seen value for the life of the Babel instance and would not
  // re-evaluate when the env changed.)
  api.cache(true);

  // React Compiler is switched on by `app.json` -> `experiments.reactCompiler`,
  // which is the ONLY switch: Expo CLI turns it into Metro's
  // `customTransformOptions.reactCompiler`, which becomes the Babel caller flag
  // `supportsReactCompiler`, which babel-preset-expo requires before it adds
  // the plugin (babel-preset-expo/build/configs/expo.js:135,
  // @expo/metro-config/build/babel-transformer.js:84).
  //
  // This file previously passed `'react-compiler': false` unless EAS_BUILD or
  // EXPO_DEV_CLIENT was set, to dodge a React Compiler crash in Expo Go
  // (wrapNativeSuper / Reflect.construct). Two problems with that:
  //   1. Nothing ever sets EXPO_DEV_CLIENT — not Expo CLI, not babel-preset-expo,
  //      not scripts/dev-android.sh — so the "dev build" half never fired and
  //      local bundles were left uncompiled while EAS builds were compiled.
  //      Dev/prod divergence is precisely how a compiler-only bug reaches
  //      production first.
  //   2. This app cannot run in Expo Go at all — @shopify/react-native-skia is
  //      not in the Expo Go runtime, and the project is prebuilt (android/).
  //      The guard protected an impossible case.
  // Single switch now lives in app.json. To opt a file out of the compiler,
  // add a 'use no memo' directive at the top of it.
  return {
    presets: ['babel-preset-expo'],
  };
};
