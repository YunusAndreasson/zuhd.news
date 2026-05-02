import type { Category } from '@shared/types';
import { Dimensions, StyleSheet, type TextStyle } from 'react-native';
import { Easing } from 'react-native-reanimated';
import { ANDROID_TEXT_BASE } from './platform';

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

/** Resolved base font size for a given size preference — useful for size-picker previews. */
export const baseFontSize = (size: FontSize): number => fs(17, FONT_SIZE_SCALE[size]);

// ---------------------------------------------------------------------------
// Primitives — theme-invariant raw values
// ---------------------------------------------------------------------------

/** Pure black. Theme-invariant — used for darkening overlays and high-contrast
 * chrome that must remain pure black in both appearance modes. */
export const BLACK = '#000000';

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

export const DARK_COLORS = {
  bg: '#0F0F11',
  text: '#e8e8e8',
  textSecondary: '#999',
  accent: '#b3b3b3',
  rule: '#2e2e2e',
  textEmphasis: '#FAFAFA',
  dome: '#c9a84c', // Dome of the Rock gold — the only color in the app
  sheetBg: '#161619',
  // 0.88 (was 0.7) keeps `labelSm` text WCAG AA across the brightest
  // composites on the globe — over a `colors.dome` hotspot glow, pillBg(0.7)
  // dropped to ~3.6:1 against `textSecondary`. Higher alpha trades a hint
  // of globe peek-through for invariant legibility on `BottomActionBar` /
  // `BriefingBar`; static callsites (sheets, blocks) shift imperceptibly.
  pillBg: 'rgba(50,50,50,0.88)',
  atmosphere: '#334455',
  shadow: 'rgba(0,0,0,0.6)',
  toastBg: 'rgba(48,48,48,0.92)',
  // Tone family — sage / rose / slate. Lifted one luminance step from the
  // original muted set (#6b8f71 / #8f6b6b / #6b7f8f) so BLACK reads cleanly
  // on tone-pill backgrounds in CompareBlock at 13pt: rose climbs from
  // 4.48 → 6.09 contrast (was failing AA), the others sit at 7+. Still
  // muted — saturation is unchanged, only luminance.
  toneFavorable: '#82a98a',
  toneUnfavorable: '#a98080',
  toneNeutral: '#8298a9',
  // Disaster-alert tints — three-tier severity ladder, all in the warm
  // family so the gradient reads as one warning vocabulary (low amber →
  // medium bronze → high rose). `alertLow` replaced an earlier muted-sage
  // mapped to GDACS's "Green" tier, which read as "OK / good news" even
  // though every tier is a warning. Ochre is desaturated and darker than
  // `colors.dome` (#c9a84c) so the dome remains the *only* gold in the
  // app per foundation.md. `alertOrange` keeps its bronze-copper. Red
  // alerts reuse `toneUnfavorable` so the palette stays singular.
  alertLow: '#a88840',
  alertOrange: '#b07a4c',
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
  pillBg: 'rgba(220,216,210,0.88)',
  atmosphere: '#8899aa',
  shadow: 'rgba(0,0,0,0.15)',
  toastBg: 'rgba(240,237,230,0.95)',
  toneFavorable: '#82a98a',
  toneUnfavorable: '#a98080',
  toneNeutral: '#8298a9',
  alertLow: '#786222',
  alertOrange: '#945a2a',
} as const satisfies Record<string, string>;

export type ColorPalette = { [K in keyof typeof DARK_COLORS]: string };

/** bg at a given alpha — pass the resolved bg RGB tuple */
export const makeBgAlpha = (bgRgb: [number, number, number]) => (a: number) =>
  `rgba(${bgRgb[0]},${bgRgb[1]},${bgRgb[2]},${a})`;

/** Convert a 3- or 6-digit hex color to an rgba string at a given alpha.
 *  Use when a palette color needs an inline transparency override (e.g. a
 *  progress-track tint) — preferred over hex+alpha-byte concatenation
 *  (`${color}26`) which is fragile and bypasses `OPACITY` tokens. */
export function withAlpha(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  const expand = (s: string) => (s.length === 1 ? s + s : s);
  const r = parseInt(expand(m.length === 3 ? (m[0] ?? '0') : m.slice(0, 2)), 16);
  const g = parseInt(expand(m.length === 3 ? (m[1] ?? '0') : m.slice(2, 4)), 16);
  const b = parseInt(expand(m.length === 3 ? (m[2] ?? '0') : m.slice(4, 6)), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const BG_RGB: Record<'dark' | 'light', [number, number, number]> = {
  dark: [15, 15, 17],
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
    /** Editorial H1 tracking — slight negative letterspacing tightens bold
     *  large text so headlines read with publication weight rather than
     *  feeling airy. Subtle: -0.3 at 28pt is ≈1% kern. */
    trackingHeading: -0.3,
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
  screenPadding: 18,
  /** Tighter horizontal padding for the article reader and the section
   *  header above it. Widens the text column a few pixels relative to
   *  `screenPadding`; `CategoryBar` mirrors this so its tabs align with
   *  the article body. */
  articlePadding: 14,
} as const;

/** Named `gap` tiers for Stack. Derived from SPACING but intent-named so layout
 *  code doesn't leak raw spacing values. */
export const GAP = {
  none: 0,
  tight: SPACING.xs,
  row: SPACING.sm,
  item: SPACING.md,
  group: SPACING.lg,
  section: SPACING.xl,
} as const;
export type GapToken = keyof typeof GAP;

/** Standard hitSlop object for Pressable/IconButton — expands tap target
 *  equally on all sides by LAYOUT.hitSlop. */
export const HIT_SLOP = {
  top: 12,
  bottom: 12,
  left: 12,
  right: 12,
} as const;

/** Smaller hitSlop for inline tappable `<Text>` runs within paragraph
 *  prose (country tags, entity mentions). Vertical slop is restrained so
 *  the tap target doesn't intrude into adjacent lines and steal taps
 *  meant for a neighbour; horizontal slop is looser since inline runs are
 *  already separated by spaces. */
export const INLINE_HIT_SLOP = {
  top: 6,
  bottom: 6,
  left: 8,
  right: 8,
} as const;

/** Title fontSize scale factor by character count. Long titles shrink to stay
 *  on two lines without truncation. Encapsulates the previously ad-hoc logic
 *  from ArticleRow so it can be reused wherever titles render. */
export function titleFontScale(length: number): number {
  return length > 70 ? 0.92 : length > 50 ? 0.96 : 1;
}

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

/** Border-radius scale. Semantic names — the app uses few enough radii that
 *  intent is clearer than numeric tiers. */
export const RADIUS = {
  handle: 2,
  pill: 4,
  floating: 14,
} as const;

/** Icon pixel sizes. Three tiers — anything else is a mistake.
 *  `lg` is reserved for primary-action icons in mini-players and similar
 *  surfaces where the play/pause icon needs to read as the focal action. */
export const ICON = {
  sm: 14,
  md: 20,
  lg: 26,
} as const;

/** Flag-emoji pixel sizes. Emoji glyphs don't map to `<Text variant>` sizing
 *  (they're pictograms, not type), so they get their own two-tier scale:
 *  `chip` for inline chips/rows, `display` for sheet-header badges. */
export const FLAG = {
  chip: 16,
  row: 18,
  display: 32,
} as const;

/** Non-radius, non-icon layout primitives. */
export const LAYOUT = {
  progressBarHeight: 2,
  sheetMaxFraction: 0.7,
  handleWidth: 36,
  handleHeight: 4,
  inputHeight: 40,
  hitSlop: 12,
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
  /** Playback-tracking / long continuous tweens (e.g. progress fills). */
  long: 1000,
  spring: { damping: 12, stiffness: 150 },
  /** Snappier spring for gesture starts (scrub tooltips, pull handles). */
  springSoft: { damping: 20, stiffness: 300 },
  staggerStep: 40,
  staggerCap: 8,
} as const;

/** Reusable Reanimated easing curves. Compose with ANIMATION durations in withTiming. */
export const EASING = {
  in: Easing.in(Easing.ease),
  out: Easing.out(Easing.ease),
  inOut: Easing.inOut(Easing.ease),
} as const;

/**
 * Opacity scale. Grouped by intent:
 *   - Interactive state (disabled / pressed / hover)
 *   - Chrome (backdrop)
 *   - Decorative layers (glow, heatmap, subtle tint)
 * Prefer named tokens over inline decimals so visual hierarchy stays auditable.
 */
export const OPACITY = {
  // Interactive states
  disabled: 0.5,
  pressed: 0.7,
  hover: 0.85,
  // Chrome
  backdrop: 0.3,
  // Decorative / chrome layers
  barely: 0.03,
  faint: 0.08,
  soft: 0.15,
  muted: 0.28,
  half: 0.45,
  strong: 0.7,
  dominant: 0.9,
} as const;

/** Interactive transform scale — applied on Pressable press via PRESSED_STYLE. */
export const PRESS_SCALE = 0.97;

export function staggerDelay(index: number): number {
  return Math.min(index, ANIMATION.staggerCap) * ANIMATION.staggerStep;
}

/** Shared pressed-state style for Pressable components */
export const PRESSED_STYLE = {
  opacity: OPACITY.pressed,
  transform: [{ scale: PRESS_SCALE }],
} as const;

/** Complete typography variant set consumed by `<Text variant>`. Each variant
 *  bundles fontFamily, fontSize, lineHeight, letterSpacing, color, and
 *  fontVariant — call sites should never assemble these by hand. */
export function makeTextVariants(colors: ColorPalette, font: FontSet, typography: Typography) {
  return {
    /** Hero headline — ArticlePage title */
    display: {
      ...font.bold,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeH1,
      lineHeight: typography.sizeH1 * typography.leadingHeading,
      letterSpacing: typography.trackingHeading,
      fontVariant: ['oldstyle-nums'] as TextStyle['fontVariant'],
      color: colors.text,
    } as TextStyle,
    /** Row titles, block titles — ArticleRow, sheet pages. Same negative
     *  tracking as `display`: the rationale on `trackingHeading` (bold
     *  large text feels airy at default kerning) applies to semibold 21pt
     *  the same way it applies to bold 28pt. */
    title: {
      ...font.semiBold,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeLg,
      lineHeight: typography.sizeLg * typography.leadingHeading,
      letterSpacing: typography.trackingHeading,
      fontVariant: ['oldstyle-nums'] as TextStyle['fontVariant'],
      color: colors.text,
    } as TextStyle,
    /** Editorial lead — subtitle under a display title, About-page opener. */
    lead: {
      ...font.regular,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeLg,
      lineHeight: typography.sizeLg * typography.leadingHeading,
      fontVariant: ['oldstyle-nums'] as TextStyle['fontVariant'],
      color: colors.accent,
    } as TextStyle,
    /** Paragraph text with oldstyle nums */
    body: {
      ...font.regular,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      fontVariant: ['oldstyle-nums'] as TextStyle['fontVariant'],
      color: colors.text,
    } as TextStyle,
    /** Emphasised body — pull quotes, lead sentences */
    bodyEmphasis: {
      ...font.semiBold,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      fontVariant: ['oldstyle-nums'] as TextStyle['fontVariant'],
      color: colors.textEmphasis,
    } as TextStyle,
    /** Italic body — editorial quotes, emphasis */
    bodyItalic: {
      ...font.italic,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      fontVariant: ['oldstyle-nums'] as TextStyle['fontVariant'],
      color: colors.text,
    } as TextStyle,
    /** Secondary body — captions, metadata sentences */
    caption: {
      ...font.regular,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeSm,
      lineHeight: typography.sizeSm * typography.leadingBody,
      color: colors.textSecondary,
    } as TextStyle,
    /** Semibold caption — toast text, pill labels, chrome copy at caption size */
    captionEmphasis: {
      ...font.semiBold,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeSm,
      lineHeight: typography.sizeSm * typography.leadingBody,
      color: colors.text,
    } as TextStyle,
    /** Small-caps label — base tier (17pt). Sheet titles, category labels. */
    label: {
      ...font.smallCaps,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      letterSpacing: typography.trackingCaps,
      color: colors.textSecondary,
    } as TextStyle,
    /** Small-caps label — section tier (13pt). */
    labelSm: {
      ...font.smallCaps,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeSm,
      lineHeight: typography.sizeSm * typography.leadingBody,
      letterSpacing: typography.trackingCaps,
      color: colors.textSecondary,
    } as TextStyle,
    /** Small-caps label — metadata tier (11pt). */
    labelXs: {
      ...font.smallCaps,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeXs,
      lineHeight: typography.sizeXs * typography.leadingBody,
      letterSpacing: typography.trackingCaps,
      color: colors.textSecondary,
    } as TextStyle,
    /** Tabular numerals — time readouts, counts, any fixed-width layout */
    tabular: {
      ...font.regular,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeXs,
      lineHeight: typography.sizeXs * typography.leadingBody,
      fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
      color: colors.text,
    } as TextStyle,
    /** Semibold tabular — scrub tooltips, emphasised readouts */
    tabularEmphasis: {
      ...font.semiBold,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeXs,
      lineHeight: typography.sizeXs * typography.leadingBody,
      fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
      color: colors.textEmphasis,
    } as TextStyle,
    /** Italic section heading — source coverage framing */
    sectionHeading: {
      ...font.italic,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeSm,
      lineHeight: typography.sizeSm * typography.leadingBody,
      color: colors.accent,
    } as TextStyle,
    /** App wordmark — header chrome */
    wordmark: {
      ...font.bold,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeWordmark,
      letterSpacing: typography.trackingWordmark,
      color: colors.text,
    } as TextStyle,
  };
}

export type TextVariants = ReturnType<typeof makeTextVariants>;
export type TextVariant = keyof TextVariants;

/** Dynamic-type ceiling per variant. Picked so extreme accessibility sizes
 *  don't overflow the layouts each variant is used in. */
export const VARIANT_CAP: Record<TextVariant, number> = {
  display: MAX_FONT_SCALE.heading,
  title: MAX_FONT_SCALE.heading,
  lead: MAX_FONT_SCALE.heading,
  body: MAX_FONT_SCALE.body,
  bodyEmphasis: MAX_FONT_SCALE.body,
  bodyItalic: MAX_FONT_SCALE.body,
  caption: MAX_FONT_SCALE.body,
  captionEmphasis: MAX_FONT_SCALE.chrome,
  label: MAX_FONT_SCALE.label,
  labelSm: MAX_FONT_SCALE.label,
  labelXs: MAX_FONT_SCALE.label,
  tabular: MAX_FONT_SCALE.tabular,
  tabularEmphasis: MAX_FONT_SCALE.tabular,
  sectionHeading: MAX_FONT_SCALE.body,
  wordmark: MAX_FONT_SCALE.chrome,
};

/** Tone override — maps a semantic tone name to a palette color. */
export type TextTone =
  | 'default'
  | 'secondary'
  | 'accent'
  | 'emphasis'
  | 'dome'
  | 'favorable'
  | 'unfavorable'
  | 'neutral';

export function toneColor(tone: TextTone, colors: ColorPalette): string | undefined {
  switch (tone) {
    case 'default':
      return colors.text;
    case 'secondary':
      return colors.textSecondary;
    case 'accent':
      return colors.accent;
    case 'emphasis':
      return colors.textEmphasis;
    case 'dome':
      return colors.dome;
    case 'favorable':
      return colors.toneFavorable;
    case 'unfavorable':
      return colors.toneUnfavorable;
    case 'neutral':
      return colors.toneNeutral;
  }
}

/** Build shared bottom-sheet styles from resolved theme values */
export function makeSheetStyles(colors: ColorPalette) {
  return StyleSheet.create({
    bg: { backgroundColor: colors.sheetBg },
    content: { padding: SPACING.screenPadding },
  });
}

export const API_BASE = 'https://zuhd-news.pages.dev';
