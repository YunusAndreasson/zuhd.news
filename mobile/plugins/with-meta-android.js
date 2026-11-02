const {
  withAndroidPermissions,
  withFacebookAppIdString,
  withFacebookManifest,
} = require('react-native-fbsdk-next/plugin/build/withFacebookAndroid');

/**
 * The Meta SDK's Android half of its config plugin, without the iOS half: the
 * package stays out of the iOS build (`expo.autolinking.ios.exclude` in
 * package.json), so its Info.plist keys and ad network identifiers would claim
 * something the binary does not do.
 *
 * No `scheme`: that is Facebook Login's browser return, and without it the
 * plugin adds neither of the SDK's two activities.
 */
module.exports = function withMetaAndroid(config, props) {
  config = withFacebookAppIdString(config, props);
  config = withFacebookManifest(config, props);
  return withAndroidPermissions(config, props);
};
