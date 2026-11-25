import paper from './paper-colors.json';

/** Ground, inks and space shared by the app and the embedded widget renderer. */
export const DARK_PAPER = paper.dark;
export const LIGHT_PAPER = paper.light;

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  smPlus: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  screenPadding: 18,
  /** The reading column's inset: the story card, the dock, the gauges and
   *  the cards. A few pixels wider a column than `screenPadding`, which the
   *  platform sheets keep. */
  articlePadding: 14,
} as const;
