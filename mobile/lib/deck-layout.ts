import { LAYOUT, SPACING } from '../constants/theme';

/**
 * How tall the story card is at rest, and what that leaves the earth.
 *
 * The sheet used to rest at a fixed 38% of the window. A fraction knows
 * nothing about type: on a small phone it cut the card's lead in half, and on
 * a tall one it spent a third of the screen on white space under a two-line
 * headline. So the resting height is computed from what the card has to show
 * — the masthead line, the kicker, a two-line title and five lines of lead —
 * at the reader's own type size, and the globe takes what is left.
 *
 * Three guarantees, in the order they give way:
 *
 *   1. **The globe keeps at least `PEEK_BAND_FRACTION` of the window** at rest.
 *      Past that the card stops growing and its lead continues under the fold,
 *      where growing the card reveals it — never an ellipsis.
 *   2. **The card always shows kicker, title and one line of lead**, even if
 *      that squeezes the globe below the fraction above.
 *   3. **The globe never gets less than `BAND_MIN` points.** On a phone where
 *      even (2) does not fit, the card yields.
 *
 * It is computed once per window, font preference and system font scale —
 * never per card. A sheet whose height followed each story would move the
 * globe's centre on every swipe, and every move is a reprojection.
 *
 * Grown, the card is the whole story and the strip steps out of the way; the
 * globe keeps a band of `STORY_BAND_FRACTION` of the window (at least
 * `BAND_MIN`), drawn by scaling the resting disc rather than reprojecting it.
 */

/** How much of the band between the chrome and the sheet the disc fills. */
export const GLOBE_FILL = 0.46;
/** Lines of lead the resting card is sized to show. */
export const LEAD_LINES = 5;
/** Title lines the resting card is sized for. Titles never clamp; a third line
 *  pushes the lead down under the fold instead. */
export const TITLE_LINES = 2;
/** The globe's share of the window at rest, before the card yields. */
export const PEEK_BAND_FRACTION = 0.34;
/** The globe's share of the window while a story is grown. */
export const STORY_BAND_FRACTION = 0.2;
/** The smallest globe band in any state, in points. */
export const BAND_MIN = 140;

/** Handle row: padding above, the indicator, padding below. */
const HANDLE = SPACING.sm + LAYOUT.handleHeight + SPACING.xs;

/** Line heights as `makeTextVariants` resolves them, before the system scale. */
export interface DeckLines {
  caption: number;
  labelXs: number;
  title: number;
  body: number;
}

export interface DeckLayoutInput {
  width: number;
  height: number;
  /** MapHeader, measured — the chrome that stays when a story grows. */
  headerHeight: number;
  /** IndicatorStrip, measured — the chrome that recedes when it does. */
  stripHeight: number;
  /** Safe-area inset plus anything floating over the bottom (the briefing bar). */
  bottomInset: number;
  /** `useWindowDimensions().fontScale`. */
  fontScale: number;
  lines: DeckLines;
  /** `VARIANT_CAP` for the same four variants. */
  caps: DeckLines;
}

export interface DeckLayout {
  /** Sheet height at rest. */
  peek: number;
  /** Sheet height with a story grown. */
  full: number;
  /** The globe at rest. */
  band: number;
  radius: number;
  centerY: number;
  /** The globe while a story is grown. */
  storyBand: number;
  storyRadius: number;
  storyCenterY: number;
}

function lineHeight(input: DeckLayoutInput, key: keyof DeckLines): number {
  return Math.round(input.lines[key] * Math.min(input.fontScale, input.caps[key]));
}

export function computeDeckLayout(input: DeckLayoutInput): DeckLayout {
  const { width, height, headerHeight, stripHeight, bottomInset } = input;
  const topChrome = headerHeight + stripHeight;

  const above =
    HANDLE +
    lineHeight(input, 'caption') +
    SPACING.sm +
    lineHeight(input, 'labelXs') +
    SPACING.xs +
    TITLE_LINES * lineHeight(input, 'title') +
    SPACING.sm;
  const body = lineHeight(input, 'body');

  const content = above + LEAD_LINES * body + SPACING.md + bottomInset;
  const floor = above + body + bottomInset;
  const bandCap = height - topChrome - Math.round(PEEK_BAND_FRACTION * height);
  const absoluteCap = height - topChrome - BAND_MIN;

  const peek = Math.round(Math.min(Math.max(Math.min(content, bandCap), floor), absoluteCap));
  const band = height - topChrome - peek;

  const storyBand = Math.max(BAND_MIN, Math.round(STORY_BAND_FRACTION * height));
  const full = Math.max(peek, height - headerHeight - storyBand);

  return {
    peek,
    full,
    band,
    radius: Math.round(GLOBE_FILL * Math.min(width, band)),
    centerY: Math.round(topChrome + band / 2),
    storyBand,
    storyRadius: Math.round(GLOBE_FILL * Math.min(width, storyBand)),
    storyCenterY: Math.round(headerHeight + storyBand / 2),
  };
}

/**
 * The transform that draws the resting disc as the grown one.
 *
 * The canvas is the whole window and scales about its own centre, so a point
 * at `centerY` lands at `height/2 + scale·(centerY − height/2)`; the
 * translation moves that onto `storyCenterY`. A transform, never a
 * reprojection: it tracks the sheet under a finger at 60fps.
 */
export function grownGlobeTransform(
  layout: DeckLayout,
  height: number,
): { scale: number; translateY: number } {
  const scale = layout.radius > 0 ? layout.storyRadius / layout.radius : 1;
  const mid = height / 2;
  return { scale, translateY: layout.storyCenterY - mid - scale * (layout.centerY - mid) };
}
