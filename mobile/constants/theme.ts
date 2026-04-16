import { Dimensions, Platform, StyleSheet, type TextStyle } from 'react-native';
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
  toneFavorable: '#6b8f71', // muted sage
  toneUnfavorable: '#8f6b6b', // muted rose
  toneNeutral: '#6b7f8f', // muted slate
} as const satisfies Record<string, string>;

export const LIGHT_COLORS = {
  bg: '#f5f2ed',
  text: '#2a2a2a',
  textSecondary: '#666666',
  accent: '#5a5a5a',
  rule: '#d8d4ce',
  textEmphasis: '#1a1a1a',
  dome: '#c9a84c',
  sheetBg: '#eae6e0',
  black: '#000000',
  atmosphere: '#8899aa',
  shadow: 'rgba(0,0,0,0.15)',
  toastBg: 'rgba(240,237,230,0.95)',
  toneFavorable: '#6b8f71',
  toneUnfavorable: '#8f6b6b',
  toneNeutral: '#6b7f8f',
} as const satisfies Record<string, string>;

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

/** Style subset produced by each font-set entry (fontFamily + optional fontWeight). */
export type FontEntry = {
  fontFamily: string | undefined;
  fontWeight?: TextStyle['fontWeight'];
};

export type FontSet = {
  regular: FontEntry;
  semiBold: FontEntry;
  bold: FontEntry;
  italic: FontEntry;
  boldItalic: FontEntry;
  smallCaps: FontEntry;
};

export const FONT_SOURCE: FontSet = {
  regular: { fontFamily: 'SourceSans3-Regular' },
  semiBold: { fontFamily: 'SourceSans3-SemiBold' },
  bold: { fontFamily: 'SourceSans3-Bold' },
  italic: { fontFamily: 'SourceSans3-Italic' },
  boldItalic: { fontFamily: 'SourceSans3-BoldItalic' },
  smallCaps: { fontFamily: 'SourceSans3SC-SemiBold' },
};

export const FONT_SYSTEM: FontSet = {
  regular: { fontFamily: undefined, fontWeight: '400' },
  semiBold: { fontFamily: undefined, fontWeight: '600' },
  bold: { fontFamily: undefined, fontWeight: '700' },
  italic: { fontFamily: undefined, fontWeight: '400' },
  boldItalic: { fontFamily: undefined, fontWeight: '700' },
  smallCaps: { fontFamily: undefined, fontWeight: '600' },
};

// ---------------------------------------------------------------------------
// Typography (can be rebuilt with a size scale)
// ---------------------------------------------------------------------------

export function makeTypography(sizeScale: number = 1) {
  return {
    sizeBase: fs(17, sizeScale),
    sizeLg: fs(21, sizeScale),
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
  xxs: 2,
  xs: 4,
  sm: 8,
  smPlus: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  screenPadding: 20,
} as const;

/** maxFontSizeMultiplier caps — prevent layout breakage at extreme Dynamic Type */
export const MAX_FONT_SCALE = {
  /** Headings — already large; excessive scaling overflows snap viewport */
  heading: 1.3,
  /** Body text — most important to scale for accessibility */
  body: 1.5,
  /** Small-caps labels and metadata */
  label: 1.4,
  /** Tabular / timer text — fixed-width layouts break at large scales */
  tabular: 1.0,
  /** UI chrome — pills, buttons, wordmark */
  chrome: 1.3,
} as const;

export const LAYOUT = {
  progressBarHeight: 2,
  sheetMaxFraction: 0.7,
  backdropOpacity: 0.3,
  iconSm: 14,
  iconMd: 20,
  timelineDot: 5,
  timelineLineWidth: 1,
  pillPaddingV: 2,
  pillRadius: 3,
  handleWidth: 36,
  handleHeight: 4,
  handleRadius: 2,
  inputHeight: 40,
  floatingRadius: 14,
  logoRadius: 8,
  activeIndicatorHeight: 1.5,
  activeIndicatorRadius: 1,
  floatingShadow: {
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  floatingPill: {
    paddingVertical: 8, // SPACING.sm
    paddingHorizontal: 16, // SPACING.md
    borderRadius: 14, // floatingRadius
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
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

/** How long the app must be backgrounded before a foreground resume triggers a refresh */
export const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

export const ANIMATION = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: { damping: 12, stiffness: 150 },
} as const;

/** Shared pressed-state style for Pressable components */
export const PRESSED_STYLE = { opacity: 0.7 } as const;

/** Android-specific base: remove extra padding above/below text for consistent rhythm */
const androidTextBase: TextStyle =
  Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' } : {};

/** Build reusable text style bases from resolved theme values */
export function makeTextStyles(colors: ColorPalette, font: FontSet, typography: Typography) {
  return {
    /** Sheet titles — largest small-caps tier (17pt) */
    sheetTitle: {
      ...font.smallCaps,
      ...androidTextBase,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      letterSpacing: typography.trackingCaps,
      color: colors.textSecondary,
    } as TextStyle,
    /** Section labels — mid small-caps tier (13pt) */
    smallCaps: {
      ...font.smallCaps,
      ...androidTextBase,
      fontSize: typography.sizeSm,
      lineHeight: typography.sizeSm * typography.leadingBody,
      letterSpacing: typography.trackingCaps,
      color: colors.textSecondary,
    } as TextStyle,
    /** Metadata — smallest small-caps tier (11pt) */
    smallCapsXs: {
      ...font.smallCaps,
      ...androidTextBase,
      fontSize: typography.sizeXs,
      lineHeight: typography.sizeXs * typography.leadingBody,
      letterSpacing: typography.trackingCaps,
      color: colors.textSecondary,
    } as TextStyle,
    textShadow: {
      textShadowColor: colors.shadow,
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    } as TextStyle,
    body: {
      ...font.regular,
      ...androidTextBase,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      fontVariant: ['oldstyle-nums'] as TextStyle['fontVariant'],
      color: colors.text,
    } as TextStyle,
    /** Category/section labels — largest small-caps tier (17pt) */
    smallCapsBase: {
      ...font.smallCaps,
      ...androidTextBase,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      letterSpacing: typography.trackingCaps,
      color: colors.textSecondary,
    } as TextStyle,
    /** Italic section headings — e.g. source coverage framing */
    sectionHeading: {
      ...font.italic,
      ...androidTextBase,
      fontSize: typography.sizeSm,
      lineHeight: typography.sizeSm * typography.leadingBody,
      color: colors.accent,
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
