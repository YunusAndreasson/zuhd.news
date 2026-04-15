module.exports = function (api) {
  api.cache(true);

  // React Compiler crashes in Expo Go (wrapNativeSuper / Reflect.construct conflict).
  // Enable only in dev builds and EAS production builds.
  const isExpoGo = !process.env.EAS_BUILD && !process.env.EXPO_DEV_CLIENT;

  return {
    presets: [
      [
        'babel-preset-expo',
        { 'react-compiler': isExpoGo ? false : {} },
      ],
    ],
  };
};
