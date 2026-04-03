import { Dimensions, StyleSheet, type TextStyle } from 'react-native';
import type { Category } from '../types';

// ---------------------------------------------------------------------------
// Preference types
// ---------------------------------------------------------------------------

export type FontSize = 'small' | 'default' | 'large';
export type FontFamily = 'source' | 'system';
export type AppearanceMode = 'dark' | 'system' | 'light';

export interface Preferences {
  fontSize: FontSize;
  fontFamily: FontFamily;
  appearance: AppearanceMode;
  haptics: boolean;
  notifications: boolean;
}

export const DEFAULT_PREFS: Preferences = {
  fontSize: 'default',
  fontFamily: 'source',
  appearance: 'dark',
  haptics: true,
  notifications: false,
};

// ---------------------------------------------------------------------------
// Font-size scaling
// ---------------------------------------------------------------------------

// Scale fonts relative to iPhone SE/8 width (375pt).
// Clamp so text never shrinks below 90% or grows above 110%.
const BASE_WIDTH = 375;
const scale = Math.min(1.1, Math.max(0.9, Dimensions.get('window').width / BASE_WIDTH));
const fs = (size: number, sizeScale = 1) => Math.round(size * scale * sizeScale);

export const FONT_SIZE_SCALE: Record<FontSize, number> = {
  small: 0.88,
  default: 1.0,
  large: 1.15,
};

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

export const DARK_COLORS = {
  bg: '#141414',
  text: '#e8e8e8',
  textSecondary: '#999',
  accent: '#b3b3b3',
  rule: '#2e2e2e',
  textEmphasis: '#ffffff',
  dome: '#c9a84c', // Dome of the Rock gold — the only color in the app
  sheetBg: '#1c1c1c',
  black: '#000000',
  atmosphere: '#334455',
  shadow: 'rgba(0,0,0,0.6)',
  toastBg: 'rgba(48,48,48,0.92)',
  toastBorder: 'rgba(255,255,255,0.08)',
  toneFavorable: '#6b8f71', // muted sage
  toneUnfavorable: '#8f6b6b', // muted rose
  toneNeutral: '#6b7f8f', // muted slate
} as const;

export const LIGHT_COLORS = {
  bg: '#f5f2ed',
  text: '#2a2a2a',
  textSecondary: '#7a7a7a',
  accent: '#5a5a5a',
  rule: '#d8d4ce',
  textEmphasis: '#1a1a1a',
  dome: '#c9a84c',
  sheetBg: '#eae6e0',
  black: '#000000',
  atmosphere: '#8899aa',
  shadow: 'rgba(0,0,0,0.15)',
  toastBg: 'rgba(240,237,230,0.95)',
  toastBorder: 'rgba(0,0,0,0.06)',
  toneFavorable: '#6b8f71',
  toneUnfavorable: '#8f6b6b',
  toneNeutral: '#6b7f8f',
} as const;

export type ColorPalette = { [K in keyof typeof DARK_COLORS]: string };

/** bg at a given alpha — pass the resolved bg RGB tuple */
export const makeBgAlpha = (bgRgb: [number, number, number]) => (a: number) =>
  `rgba(${bgRgb[0]},${bgRgb[1]},${bgRgb[2]},${a})`;

export const BG_RGB: Record<'dark' | 'light', [number, number, number]> = {
  dark: [20, 20, 20],
  light: [245, 242, 237],
};

// ---------------------------------------------------------------------------
// Font families
// ---------------------------------------------------------------------------

export const FONT_SOURCE = {
  regular: 'SourceSans3-Regular',
  semiBold: 'SourceSans3-SemiBold',
  bold: 'SourceSans3-Bold',
  smallCaps: 'SourceSans3SC-SemiBold',
} as const;

export const FONT_SYSTEM = {
  regular: undefined as string | undefined,
  semiBold: undefined as string | undefined,
  bold: undefined as string | undefined,
  smallCaps: undefined as string | undefined,
} as const;

export type FontSet = { regular: string | undefined; semiBold: string | undefined; bold: string | undefined; smallCaps: string | undefined };

// ---------------------------------------------------------------------------
// Typography (can be rebuilt with a size scale)
// ---------------------------------------------------------------------------

export function makeTypography(sizeScale = 1) {
  return {
    sizeBase: fs(17, sizeScale),
    sizeSm: fs(13, sizeScale),
    sizeXs: fs(11, sizeScale),
    sizeH1: fs(28, sizeScale),
    sizeWordmark: fs(14, sizeScale),

    leadingBody: 1.55,
    leadingHeading: 1.2,
    trackingCaps: 1.2,
    trackingWordmark: -0.3,
  } as const;
}

export type Typography = ReturnType<typeof makeTypography>;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  screenPadding: 20,
} as const;

export const LAYOUT = {
  progressBarHeight: 2,
  sheetMaxFraction: 0.7,
  backdropOpacity: 0.3,
  iconSm: 14,
  timelineDot: 5,
  timelineLineWidth: 1,
  pillPaddingV: 2,
  pillRadius: 3,
} as const;

/** Editorial thresholds — not layout, but shared across components */
export const EDITORIAL = {
  /** Sentiment score above this is "favorable" */
  sentimentPositive: 0.2,
  /** Sentiment score below negative of this is "unfavorable" */
  sentimentNegative: -0.2,
  /** Source divergence threshold for "differently" note */
  divergenceModerate: 0.2,
  /** Source divergence threshold for "very differently" note */
  divergenceHigh: 0.35,
  /** Average words per minute for read-time estimates */
  readingWpm: 238,
} as const;

export const CATEGORIES: Category[] = ['politics', 'economy', 'science', 'tech'];

/** Shared pressed-state style for Pressable components */
export const PRESSED_STYLE = { opacity: 0.5 } as const;

/** Build reusable text style bases from resolved theme values */
export function makeTextStyles(colors: ColorPalette, font: FontSet, typography: Typography) {
  return {
    smallCaps: {
      fontFamily: font.smallCaps,
      fontSize: typography.sizeSm,
      letterSpacing: typography.trackingCaps,
      color: colors.accent,
    } as TextStyle,
    smallCapsXs: {
      fontFamily: font.smallCaps,
      fontSize: typography.sizeXs,
      letterSpacing: typography.trackingCaps,
      color: colors.accent,
    } as TextStyle,
    textShadow: {
      textShadowColor: colors.shadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    } as TextStyle,
    body: {
      fontFamily: font.regular,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      color: colors.text,
    } as TextStyle,
  };
}

export type TextStyles = ReturnType<typeof makeTextStyles>;

/** Build shared bottom-sheet styles from resolved theme values */
export function makeSheetStyles(colors: ColorPalette) {
  return StyleSheet.create({
    bg: { backgroundColor: colors.sheetBg },
    content: { padding: SPACING.screenPadding },
  });
}

export const API_BASE = 'https://zuhd-news.pages.dev';
