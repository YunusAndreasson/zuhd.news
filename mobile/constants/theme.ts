import type { Category } from '@shared/types';
import {
  Dimensions,
  type TextProps as RNTextProps,
  StyleSheet,
  type TextStyle,
} from 'react-native';
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

/** Pure white. Theme-invariant — used for additive highlight overlays where
 *  the visual phenomenon (sun glint, snow, specular lift) must read as
 *  brighter-than-ambient in both modes, and the bg-inverting `text`/`bg`
 *  tokens have the wrong polarity. Used sparingly: ice fills already inline
 *  this, and the day-side ocean specular gradient on the globe needs it. */
export const WHITE = '#ffffff';

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

export const DARK_COLORS = {
  bg: '#0F0F11',
  text: '#e8e8e8',
  textSecondary: '#999',
  // `accent` is a soft text tier that sits between `text` and
  // `textSecondary` in luminance — used by the `lead` and `sectionHeading`
  // variants and as a structural fill in SVG blocks. Naming note: this is
  // NOT the brand accent. The brand accent is `dome` (Dome of the Rock
  // gold). The name is retained for legacy reasons; new code can read it
  // as "soft text / second voice".
  accent: '#b3b3b3',
  rule: '#2e2e2e',
  textEmphasis: '#FAFAFA',
  dome: '#c9a84c', // Dome of the Rock gold — the only chromatic accent in the app
  sheetBg: '#161619',
  // 0.88 alpha keeps `labelSm` text WCAG AA across the brightest composites
  // on the globe (over a `colors.dome` hotspot glow). The base luminance
  // also matters: the previous rgb(50,50,50) at α=0.88 composited to ~46
  // over bg=15 — a ~3× relative lift that read as iOS-chrome elevation
  // and broke parity with the light-mode pill (which sits barely below bg).
  // Dropping the base to 30 gives a calmer ~2× lift, and counter-intuitively
  // *raises* contrast vs `textSecondary` because the chip is darker. Don't
  // drop alpha below 0.88 — over the dome hotspot the contrast still bottoms
  // out at ~AA-large only.
  pillBg: 'rgba(30,30,32,0.88)',
  atmosphere: '#334455',
  // Editorial-map water tone — pre-composed `atmosphere` at 0.28 alpha
  // over `bg`. Used by LocationsBlock as an explicit ocean fill so water
  // reads as a distinct surface (deep slate-blue) rather than the absence
  // of land. Pre-composed so lakes (which draw on top of land) can use
  // the same opaque hex as the ocean Rect — alpha tricks would diverge.
  water: '#191e24',
  toastBg: 'rgba(48,48,48,0.92)',
  // Tone family — sage / rose / slate. Lifted one luminance step from the
  // original muted set (#6b8f71 / #8f6b6b / #6b7f8f) so BLACK reads cleanly
  // on tone-pill backgrounds in CompareBlock at 13pt: rose climbs from
  // 4.48 → 6.09 contrast (was failing AA), the others sit at 7+. Still
  // muted — saturation is unchanged, only luminance.
  //
  // ⚠️ Use these as BACKGROUND fills only (with BLACK foreground text).
  // For foreground TEXT colored by sentiment, use the `*Text` siblings
  // below — they're tuned for AA contrast against `bg`, not against BLACK.
  toneFavorable: '#82a98a',
  toneUnfavorable: '#a98080',
  toneNeutral: '#8298a9',
  // Tone-family text variants. Used when a sentiment hue must be applied
  // to *foreground* text (sources sentiment label, country-card headline,
  // chokepoint weather alert). In dark mode the bg-variant already has
  // ample contrast on `bg` (~7.5:1), so the text-variants intentionally
  // mirror the bg values — keeps a single visual identity. In light mode
  // the values diverge (see LIGHT_COLORS) to clear AA body on cream.
  toneFavorableText: '#82a98a',
  toneUnfavorableText: '#a98080',
  toneNeutralText: '#8298a9',
  // The app's second chromatic break, and the only one besides `dome`.
  //
  // It exists for exactly one thing: a card reporting that a named body has
  // published a named document finding genocide. Nothing else may use it —
  // not severity, not a red alert level, not a falling number. The rule that
  // makes a single accent work is that the accent means one thing, and the
  // moment this red is spent on a market move it stops meaning this.
  determination: '#f5372b',
} as const satisfies Record<string, string>;

export const LIGHT_COLORS = {
  bg: '#f5f2ed',
  text: '#2a2a2a',
  textSecondary: '#666666',
  // See DARK_COLORS.accent for the naming note (this is *not* the brand
  // accent — `dome` is). Light-mode value sits between `text` and
  // `textSecondary` in luminance the same way as dark.
  accent: '#5a5a5a',
  rule: '#d8d4ce',
  textEmphasis: '#1a1a1a',
  // Dome darkens significantly on cream — the dark-mode #c9a84c gold sits
  // at ~2:1 against `bg`, invisible as foreground text. Shifting to a
  // deeper bronze-gold (~5:1 on bg) preserves the warm signature while
  // clearing AA for the top-rank rows in CountrySheet/CountryRankingView
  // that color text via `tone="dome"`. The single-gold rule from
  // foundation.md is honored — both modes still use one gold, hue-aligned.
  dome: '#7a5e1a',
  sheetBg: '#eae6e0',
  pillBg: 'rgba(220,216,210,0.88)',
  atmosphere: '#8899aa',
  // See DARK_COLORS.water for the rationale. Pre-composed `atmosphere`
  // at 0.28 alpha over `bg` — sits a touch cooler/darker than cream so
  // land (gray) reads as the warmer surface.
  water: '#d6d9da',
  toastBg: 'rgba(240,237,230,0.95)',
  // Background tones — paired with BLACK foreground in CompareBlock pills,
  // used as decorative fills in TimelineBlock/TreemapBlock. Mid-luminance
  // is mandatory for the BLACK-on-tone contrast (L≈0.25–0.35 gives BLACK
  // 5.5–8:1). Standalone fills on cream sit at ~2.1–3.1:1, which is
  // acceptable for non-essential decorative UI.
  //
  // ⚠️ Do NOT use these as foreground TEXT on cream — contrast is ~3.4:1
  // (AA-large only, fails AA body). Use the `*Text` siblings below.
  toneFavorable: '#82a98a',
  toneUnfavorable: '#a98080',
  toneNeutral: '#8298a9',
  // Foreground-text tone variants. Hue-aligned with the bg-tones above
  // but luminance-deepened to clear WCAG AA body (≥ 4.5:1) on cream `bg`.
  // Used by `tone="favorable|unfavorable|neutral"` on `<Text>` and by
  // sites that color body/caption text by sentiment (SourceRow,
  // ChokepointSheet weather, DisambiguationSheet rows, etc.).
  toneFavorableText: '#3f6b48',
  toneUnfavorableText: '#884d51',
  toneNeutralText: '#475f70',
  // See DARK_COLORS.determination. Deepened on cream for the same reason
  // `dome` is: the dark-mode red sits near 3:1 against #f5f2ed and fails AA
  // as body text. #c62518 clears 5:1 while staying the same hue.
  determination: '#c62518',
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

/** Style subset produced by each font-set entry. Source Sans encodes weight,
 *  italic and small-caps in the font file itself; the system fallback has to
 *  express them as style props instead, hence the optional fields. */
type FontEntry = {
  fontFamily: string | undefined;
  fontWeight?: TextStyle['fontWeight'];
  fontStyle?: TextStyle['fontStyle'];
  fontVariant?: TextStyle['fontVariant'];
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
  italic: { fontFamily: undefined, fontWeight: '400', fontStyle: 'italic' },
  boldItalic: { fontFamily: undefined, fontWeight: '700', fontStyle: 'italic' },
  smallCaps: { fontFamily: undefined, fontWeight: '600', fontVariant: ['small-caps'] },
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
    /** Tight single-line leading for small-caps labels/captions that must not
     *  eat vertical space between adjacent rows. Replaces the ad-hoc `× 1.1`
     *  multipliers that had drifted across SourceCaption and LocationsBlock —
     *  one auditable value so the label-to-neighbour rhythm stays consistent. */
    leadingTight: 1.1,
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
   *  `screenPadding`; `SectionBar` mirrors this so its labels align with
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
 *  (they're pictograms, not type), so they get their own scale: `chip` for
 *  inline chips/rows, `inline` for sheet-header titles where the flag sits
 *  beside (not above) the country name, `display` for stacked sheet-header
 *  badges where the flag is its own row. */
export const FLAG = {
  chip: 16,
  row: 18,
  inline: 22,
  display: 32,
} as const;

/** Non-radius, non-icon layout primitives. */
export const LAYOUT = {
  progressBarHeight: 2,
  /** Ceiling for a sheet, as a fraction of window height. Every sheet is
   *  content-sized now (see `useSheetSnaps`), so this is the only thing
   *  bounding a long one — it is the height the old fixed `'85%'` snap used
   *  to give search, saved and the country rankings, and short pages never
   *  reach it because they hug their content. `SheetLayout` applies it. */
  sheetMaxFraction: 0.85,
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

/**
 * The horizontal axis.
 *
 * Four sections, cut by the question a reader arrives with rather than by
 * what kind of instrument the answer happens to be. The stories first, then:
 * what things cost, what your money is worth, and what is not yet a fact.
 * Subject navigation, entirely by swipe.
 *
 * It was six, split by asset class, and the split was the problem. `markets`
 * held food, energy, rates, shipping, Wikipedia curiosity and a calendar —
 * eight cards and three of them not markets by any reading — while `crypto`,
 * `metals` and `currencies` held two or three each and were all facets of one
 * question. Asset class is how a data provider files a series; it is not how
 * anybody wakes up wondering about one.
 *
 * Every section here holds readings that move daily — which is the test a news
 * app has to apply to itself. A section of standing conditions (famine,
 * conflict, hazards, genocide determinations) was cut on exactly that test:
 * the median famine analysis was seven months old and one determination was
 * eight years old. Those cards survive, gated on their own data being new, and
 * lead `prices` on the rare day one of them is (see `lib/cards/conditions.ts`).
 *
 * Four labels fit a phone at default type — roughly 216pt of small caps
 * against a 360pt screen, where six measured past 440 and forced the rail to
 * scroll. `SectionBar` keeps its scroll view for large Dynamic Type and draws
 * a rule after `news`, which is a river where the other three are card decks.
 * Swipe is still the navigation; the rail is where you are.
 *
 * The four categories used to live on this axis too. They are a vertical
 * ordering inside `news` now — see `lib/news-order.ts` for why lanes were the
 * wrong shape once the axis was needed for something else.
 */
export const SECTIONS = ['news', 'prices', 'money', 'outlook'] as const;
export type Section = (typeof SECTIONS)[number];

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
 *   - Decorative layers (glow, heatmap, subtle tint)
 * Prefer named tokens over inline decimals so visual hierarchy stays auditable.
 *
 * There is no `backdrop` step any more. It set the sheet scrim's opacity, and
 * sheets are platform sheets now — the scrim is drawn by SwiftUI / Material3
 * and takes no value from here.
 */
export const OPACITY = {
  // Interactive states
  disabled: 0.5,
  pressed: 0.7,
  hover: 0.85,
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
    /** Paragraph text with oldstyle nums.
     *  letterSpacing: Source Sans 3 Regular is on the thin side; SF compensates
     *  for halation on dark backgrounds via per-size optical tracking, custom
     *  fonts don't. +0.1 opens the prose enough to remove the smear without
     *  changing rhythm. Applied to all three body variants so emphasis and
     *  italic stay metrically consistent with regular. */
    body: {
      ...font.regular,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      letterSpacing: 0.1,
      fontVariant: ['oldstyle-nums'] as TextStyle['fontVariant'],
      color: colors.text,
    } as TextStyle,
    /** Emphasised body — pull quotes, lead sentences */
    bodyEmphasis: {
      ...font.semiBold,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      letterSpacing: 0.1,
      fontVariant: ['oldstyle-nums'] as TextStyle['fontVariant'],
      color: colors.textEmphasis,
    } as TextStyle,
    /** Italic body — editorial quotes, emphasis */
    bodyItalic: {
      ...font.italic,
      ...ANDROID_TEXT_BASE,
      fontSize: typography.sizeBase,
      lineHeight: typography.sizeBase * typography.leadingBody,
      letterSpacing: 0.1,
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

/** Line-breaking and Dynamic Type behavior per typographic role. Variants
 *  (styles) say how text *looks*; these props say how it *breaks* and
 *  *scales* — RN exposes them as props, not styles, so they ride alongside
 *  the variant rather than inside it.
 *
 *  - Prose hyphenates on Android (`'normal'` = conservative dictionary
 *    hyphenation, API 23+) and uses Apple's `'standard'` strategy on iOS 14+
 *    — both tame the gappy right rag a 17pt column produces at phone widths.
 *    RN defaults both to off/none.
 *  - Headlines use Android's `'balanced'` breaker and iOS `'push-out'` so a
 *    two-line title splits evenly instead of stranding a one-word widow.
 *  - `dynamicTypeRamp` (iOS) maps each role onto the platform Dynamic Type
 *    curve it corresponds to, so accessibility scaling follows Apple's
 *    per-role ramp (titles grow less than body) rather than one linear
 *    multiplier. `VARIANT_CAP` still clamps the extremes.
 *
 *  Platform-suffixed props are ignored on the other platform — safe to set
 *  unconditionally. `wordmark` is deliberately absent: fixed chrome, never
 *  wraps, never scales past its cap. */
export const PROSE_BREAK_PROPS = {
  android_hyphenationFrequency: 'normal',
  lineBreakStrategyIOS: 'standard',
} as const satisfies Partial<RNTextProps>;

const HEADING_BREAK_PROPS = {
  textBreakStrategy: 'balanced',
  lineBreakStrategyIOS: 'push-out',
} as const satisfies Partial<RNTextProps>;

export const VARIANT_TEXT_PROPS: Partial<Record<TextVariant, Partial<RNTextProps>>> = {
  display: { ...HEADING_BREAK_PROPS, dynamicTypeRamp: 'largeTitle' },
  title: { ...HEADING_BREAK_PROPS, dynamicTypeRamp: 'title2' },
  lead: { ...PROSE_BREAK_PROPS, dynamicTypeRamp: 'title3' },
  body: { ...PROSE_BREAK_PROPS, dynamicTypeRamp: 'body' },
  bodyEmphasis: { ...PROSE_BREAK_PROPS, dynamicTypeRamp: 'body' },
  bodyItalic: { ...PROSE_BREAK_PROPS, dynamicTypeRamp: 'body' },
  caption: { ...PROSE_BREAK_PROPS, dynamicTypeRamp: 'footnote' },
  captionEmphasis: { dynamicTypeRamp: 'footnote' },
  label: { dynamicTypeRamp: 'callout' },
  labelSm: { dynamicTypeRamp: 'footnote' },
  labelXs: { dynamicTypeRamp: 'caption1' },
  tabular: { dynamicTypeRamp: 'caption1' },
  tabularEmphasis: { dynamicTypeRamp: 'caption1' },
  sectionHeading: { dynamicTypeRamp: 'footnote' },
};

/** Tone override — maps a semantic tone name to a palette color. The
 *  sentiment tones (`favorable`, `unfavorable`, `neutral`) resolve to the
 *  `*Text` palette variants tuned for foreground contrast on `bg` — the
 *  bg-tones (`colors.toneFavorable` etc.) are background-only and won't
 *  pass AA body in light mode as foreground text. */
export type TextTone =
  | 'default'
  | 'secondary'
  | 'accent'
  | 'emphasis'
  | 'dome'
  | 'favorable'
  | 'unfavorable'
  | 'neutral'
  /** Reserved for a genocide determination and nothing else — see the
   *  `determination` entry in the palettes. */
  | 'determination'
  /** Text sitting on an inverted (colors.text-filled) surface — resolves to
   *  `colors.bg`. Used by high-visibility chrome like the onboarding hint
   *  pill; still monochrome, so "color carries meaning" holds. */
  | 'inverse';

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
      return colors.toneFavorableText;
    case 'unfavorable':
      return colors.toneUnfavorableText;
    case 'neutral':
      return colors.toneNeutralText;
    case 'determination':
      return colors.determination;
    case 'inverse':
      return colors.bg;
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
