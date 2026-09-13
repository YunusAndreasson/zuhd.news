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
 * Grown, the card is the whole story and the bar's gauges step aside. The
 * sheet stops at the story's own height, capped so the globe always keeps a
 * band of `STORY_BAND_FRACTION` of the window (at least `BAND_MIN`); a short
 * story leaves the earth more room rather than a third of the screen blank
 * under its last line. The globe is drawn there by scaling the resting disc,
 * never by reprojecting it — so unlike the resting height, this one is free to
 * follow each card.
 */

/** How much of the band between the chrome and the sheet the disc fills. */
const GLOBE_FILL = 0.46;
/** Lines of lead the resting card is sized to show. */
const LEAD_LINES = 5;
/** Title lines the resting card is sized for. Titles never clamp; a third line
 *  pushes the lead down under the fold instead. */
const TITLE_LINES = 2;
/** The globe's share of the window at rest, before the card yields. */
const PEEK_BAND_FRACTION = 0.34;
/** The globe's share of the window while a story is grown. */
const STORY_BAND_FRACTION = 0.2;
/** The smallest globe band in any state, in points. */
export const BAND_MIN = 140;

/** Handle row: padding above, the indicator, padding below. */
const HANDLE = SPACING.sm + LAYOUT.handleHeight + SPACING.xs;

/** Line heights as `makeTextVariants` resolves them, before the system scale. */
interface DeckLines {
  caption: number;
  labelXs: number;
  title: number;
  body: number;
}

export interface DeckLayoutInput {
  width: number;
  height: number;
  /** The bar above the earth (`MapHeader`), measured. */
  chromeHeight: number;
  /** Safe-area inset plus anything floating over the bottom (the briefing bar). */
  bottomInset: number;
  /** `useWindowDimensions().fontScale`. */
  fontScale: number;
  lines: DeckLines;
  /** `VARIANT_CAP` for the same four variants. */
  caps: DeckLines;
}

export interface DeckLayout {
  width: number;
  /** The bar's height — the top of the globe's band, at rest and grown. */
  header: number;
  /** Sheet height at rest. */
  peek: number;
  /** The tallest the sheet grows; a shorter story stops lower. */
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
  const { width, height, chromeHeight: topChrome, bottomInset } = input;

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
  const full = Math.max(peek, height - topChrome - storyBand);

  return {
    width,
    header: topChrome,
    peek,
    full,
    band,
    radius: Math.round(GLOBE_FILL * Math.min(width, band)),
    centerY: Math.round(topChrome + band / 2),
    storyBand,
    storyRadius: Math.round(GLOBE_FILL * Math.min(width, storyBand)),
    storyCenterY: Math.round(topChrome + storyBand / 2),
  };
}

/**
 * The transform that draws the resting disc in the band a grown sheet leaves.
 *
 * `sheetHeight` is where the grown sheet actually stopped — `layout.full` for
 * the longest stories, less for a short one. The band is what is left under
 * the bar; the disc fills `GLOBE_FILL` of it, never larger than at rest,
 * because a scaled-up canvas is a blurred one.
 *
 * The canvas is the whole window and scales about its own centre, so a point
 * at `centerY` lands at `height/2 + scale·(centerY − height/2)`; the
 * translation moves that onto the band's centre. A transform, never a
 * reprojection: it runs on the UI thread, tracking the sheet at 60fps.
 */
export function grownGlobeTransform(
  layout: DeckLayout,
  height: number,
  sheetHeight: number = layout.full,
): { scale: number; translateY: number } {
  'worklet';
  const band = Math.max(BAND_MIN, height - layout.header - sheetHeight);
  const radius = Math.round(GLOBE_FILL * Math.min(layout.width, band));
  const scale = layout.radius > 0 ? Math.min(1, radius / layout.radius) : 1;
  const mid = height / 2;
  const centerY = layout.header + band / 2;
  return { scale, translateY: centerY - mid - scale * (layout.centerY - mid) };
}
