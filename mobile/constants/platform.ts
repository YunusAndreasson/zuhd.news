import { Platform, type TextStyle } from 'react-native';

/** Single source of truth for platform divergence. Prefer these over inline
 *  `Platform.OS === 'android'` checks at module scope — keeps cross-file
 *  differences grep-able in one spot. */

export const IS_ANDROID = Platform.OS === 'android';
export const IS_IOS = Platform.OS === 'ios';

/** Android adds extra vertical padding around text; disabling it matches the
 *  baseline metrics iOS already uses, so typography stays consistent across
 *  platforms. Apply on any `TextStyle` that ships across both. */
export const ANDROID_TEXT_BASE: TextStyle = IS_ANDROID
  ? { includeFontPadding: false, textAlignVertical: 'center' }
  : {};
