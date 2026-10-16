import type { FontSource } from 'expo-font';

/**
 * Nothing loads at launch on Android: the expo-font plugin embeds every
 * Source Sans 3 face (`app.json`), and Android finds a face by its file's
 * name, which is the name `FONT_SOURCE` uses. One face per name keeps every
 * weight exact; a single family chosen by `fontWeight` would draw SemiBold as
 * Regular below Android 9. iOS loads its faces at launch (`fonts.ios.ts`).
 */
export const RUNTIME_FONTS: Record<string, FontSource> = {};
