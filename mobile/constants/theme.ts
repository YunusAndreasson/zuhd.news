import { Dimensions, type TextStyle } from 'react-native';
import type { Category } from '../types';

// Scale fonts relative to iPhone SE/8 width (375pt).
// Clamp so text never shrinks below 90% or grows above 110%.
const BASE_WIDTH = 375;
const scale = Math.min(1.1, Math.max(0.9, Dimensions.get('window').width / BASE_WIDTH));
const fs = (size: number) => Math.round(size * scale);

export const COLORS = {
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
  toneFavorable: '#6b8f71', // muted sage
  toneUnfavorable: '#8f6b6b', // muted rose
  toneNeutral: '#6b7f8f', // muted slate
} as const;

/** bg (#141414 = rgb(20,20,20)) at a given alpha — keeps gradient stops in sync with bg */
export const bgAlpha = (a: number) => `rgba(20,20,20,${a})`;

export const FONT = {
  regular: 'SourceSans3-Regular',
  semiBold: 'SourceSans3-SemiBold',
  bold: 'SourceSans3-Bold',
  smallCaps: 'SourceSans3SC-SemiBold',
} as const;

export const TYPOGRAPHY = {
  sizeBase: fs(17),
  sizeSm: fs(13),
  sizeXs: fs(11),
  sizeH1: fs(28),
  sizeWordmark: fs(14),

  leadingBody: 1.55,
  leadingHeading: 1.2,
  trackingCaps: 1.2,
  trackingWordmark: -0.3,
} as const;

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

/** Reusable text style bases — spread into StyleSheet.create or use directly */
export const TEXT_STYLES = {
  smallCaps: {
    fontFamily: FONT.smallCaps,
    fontSize: TYPOGRAPHY.sizeSm,
    letterSpacing: TYPOGRAPHY.trackingCaps,
    color: COLORS.accent,
  } as TextStyle,
  smallCapsXs: {
    fontFamily: FONT.smallCaps,
    fontSize: TYPOGRAPHY.sizeXs,
    letterSpacing: TYPOGRAPHY.trackingCaps,
    color: COLORS.accent,
  } as TextStyle,
  textShadow: {
    textShadowColor: COLORS.shadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  } as TextStyle,
  body: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeBase,
    lineHeight: TYPOGRAPHY.sizeBase * TYPOGRAPHY.leadingBody,
    color: COLORS.text,
  } as TextStyle,
};

export const API_BASE = 'https://zuhd-news.pages.dev';
