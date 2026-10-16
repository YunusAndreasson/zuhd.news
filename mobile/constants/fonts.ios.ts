import type { FontSource } from 'expo-font';

/**
 * Source Sans 3 on iOS, registered at launch under one name per face: the
 * names `FONT_SOURCE` uses. iOS re-resolves a named face within its family by
 * weight, and the small-caps file declares the same family and weight as
 * SemiBold, so a native embed could draw either for both. expo-font's runtime
 * name holds each to its own file. Android embeds the files (`fonts.ts`).
 */
export const RUNTIME_FONTS: Record<string, FontSource> = {
  'SourceSans3-Regular': require('../assets/fonts/SourceSans3-Regular.ttf'),
  'SourceSans3-SemiBold': require('../assets/fonts/SourceSans3-SemiBold.ttf'),
  'SourceSans3-Bold': require('../assets/fonts/SourceSans3-Bold.ttf'),
  'SourceSans3-Italic': require('../assets/fonts/SourceSans3-Italic.ttf'),
  'SourceSans3-BoldItalic': require('../assets/fonts/SourceSans3-BoldItalic.ttf'),
  'SourceSans3SC-SemiBold': require('../assets/fonts/SourceSans3SC-SemiBold.ttf'),
};
