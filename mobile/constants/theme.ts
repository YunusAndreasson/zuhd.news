import type { Category } from '../types';

export const COLORS = {
  bg: '#141414',
  text: '#e8e8e8',
  textSecondary: '#a3a3a3',
  accent: '#999',
  rule: '#2a2a2a',
  white: '#ffffff',
} as const;

export const FONT = {
  regular: 'SourceSans3-Regular',
  semiBold: 'SourceSans3-SemiBold',
  bold: 'SourceSans3-Bold',
} as const;

export const TYPOGRAPHY = {
  sizeBase: 18,
  sizeSm: 14,
  sizeXs: 12,
  sizeH1: 30,
  sizeWordmark: 14,
  sizeTab: 11,
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
  peekHeight: 200,
  briefingButtonBottom: 24,
  briefingButtonRight: 20,
} as const;

export const CATEGORIES: Category[] = ['politics', 'economy', 'science', 'tech'];

export const API_BASE = 'https://zuhd-news.pages.dev';
