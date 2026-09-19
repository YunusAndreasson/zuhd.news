import { LAYOUT, SPACING } from '../constants/theme';

/**
 * How tall the story card is at rest and open, and what that leaves the earth.
 *
 * The sheet used to rest at a fixed 38% of the window. A fraction knows
 * nothing about type: on a small phone it cut the card's lead in half, and on
 * a tall one it spent a third of the screen on white space under a two-line
 * headline. So both heights are computed from what the card has to show, at
 * the reader's own type size, and the globe takes what is left.
 *
 * **At rest the card is a kicker, a two-line title and the hook** — the first
 * sentence, 43–91 characters, so three lines at most. It carried the hook and
 * the why-it-matters sentence until 2026-09-19, which was half of every
 * article: the reader read each story to get past it, and forty of them felt
 * like an obligation rather than a choice.
 *
 * Three guarantees, in the order they give way:
 *
 *   1. **The globe keeps at least `PEEK_BAND_FRACTION` of the window** at rest.
 *      Past that the card stops growing and its hook continues under the dock,
 *      where opening the card reveals it — never an ellipsis.
 *   2. **The card always shows kicker, title and one line of hook**, even if
 *      that squeezes the globe below the fraction above.
 *   3. **The globe never gets less than `BAND_MIN` points.** On a phone where
 *      even (2) does not fit, the card yields.
 *
 * **Open, the card is one height for every story: today's typical long one.**
 * `StoryMeasure` renders the day's cards off screen and `openStoryHeight`
 * takes the height three in four of them fit inside whole; until they are
 * measured, `STORY_LINES` estimates the longest story that could arrive —
 * four sentences are at most ~420 characters, and the type scale tracks the
 * window's width, so a line holds about 43 characters on every phone. The
 * sheet used to stop at each story's own height, and reading meant watching
 * the text, the globe and the controls jump by three or four lines on every
 * swipe. Sized for the worst case it left four or five blank lines under a
 * typical story; sized for today's tallest, a single long card with a market
 * line held every other story two to four lines short. The tallest quarter
 * scroll their last line or two instead.
 *
 * Both are computed once per window, font preference and system font scale —
 * never per card.
 */

/** How much of the band between the chrome and the sheet the disc fills. */
const GLOBE_FILL = 0.46;
/** Lines of hook the resting card is sized to show. */
const HOOK_LINES = 3;
/** Title lines the card is sized for. Titles never clamp; a third line pushes
 *  the hook down under the dock instead. */
const TITLE_LINES = 2;
/** Body lines the open card is sized for: the whole story at ~43 characters a
 *  line, and the paragraph break between the hook and the rest. */
const STORY_LINES = 11;
/** The globe's share of the window at rest, before the card yields. */
const PEEK_BAND_FRACTION = 0.34;
/** The globe's share of the window while a story is open. */
const STORY_BAND_FRACTION = 0.2;
/** The smallest globe band in any state, in points. */
export const BAND_MIN = 140;

/** A row of 48pt touch targets: the gauges and Settings above the earth, and
 *  the story track and its buttons in the dock. */
export const CONTROL_ROW = 48;

/** The open card's row of words — sources, save, share — at its end. */
export const ACTIONS_ROW = CONTROL_ROW - SPACING.sm;

/** The share of today's cards the open sheet fits whole; the rest scroll. */
const STORY_FIT_SHARE = 0.75;

/**
 * The card height the open sheet is sized for: the smallest that fits
 * `STORY_FIT_SHARE` of today's cards whole (nearest rank). Undefined until
 * there is a card to measure.
 */
export function openStoryHeight(heights: readonly number[]): number | undefined {
  if (heights.length === 0) return undefined;
  const sorted = [...heights].sort((a, b) => a - b);
  const rank = Math.max(0, Math.ceil(STORY_FIT_SHARE * sorted.length) - 1);
  return Math.ceil(sorted[rank] ?? 0);
}

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
  /** The safe-area inset under the dock. */
  bottomInset: number;
  /** `useWindowDimensions().fontScale`. */
  fontScale: number;
  lines: DeckLines;
  /** `VARIANT_CAP` for the same four variants. */
  caps: DeckLines;
  /** The card height the open sheet is sized for, from today's cards as
   *  rendered (`openStoryHeight`). Until they are measured, the type estimate
   *  for the longest possible story stands in. */
  storyContent?: number;
}

export interface DeckLayout {
  width: number;
  /** The bar's height — the top of the globe's band, at rest and open. */
  header: number;
  /** The dock pinned under the sheet: its row and the safe-area inset. */
  dock: number;
  /** Sheet height at rest, dock included. */
  peek: number;
  /** Sheet height with a story open, dock included — the same for every story. */
  full: number;
  /** The globe at rest. */
  band: number;
  radius: number;
  centerY: number;
  /** The globe while a story is open. */
  storyBand: number;
  storyRadius: number;
  storyCenterY: number;
}

function lineHeight(input: DeckLayoutInput, key: keyof DeckLines): number {
  return Math.round(input.lines[key] * Math.min(input.fontScale, input.caps[key]));
}

export function computeDeckLayout(input: DeckLayoutInput): DeckLayout {
  const { width, height, chromeHeight: topChrome, bottomInset } = input;

  const dock = CONTROL_ROW + bottomInset;
  const above =
    HANDLE +
    lineHeight(input, 'labelXs') +
    SPACING.xs +
    TITLE_LINES * lineHeight(input, 'title') +
    SPACING.sm;
  const body = lineHeight(input, 'body');

  const content = above + HOOK_LINES * body + SPACING.md + dock;
  const floor = above + body + dock;
  const bandCap = height - topChrome - Math.round(PEEK_BAND_FRACTION * height);
  const absoluteCap = height - topChrome - BAND_MIN;

  const peek = Math.round(Math.min(Math.max(Math.min(content, bandCap), floor), absoluteCap));
  const band = height - topChrome - peek;

  // The whole story, a paragraph break, the odds or thread line, and the
  // pinned row of words above the dock — measured where it can be.
  const story =
    input.storyContent !== undefined
      ? HANDLE + input.storyContent + dock
      : above +
        STORY_LINES * body +
        SPACING.md +
        lineHeight(input, 'caption') +
        SPACING.sm +
        ACTIONS_ROW +
        dock;
  const storyCap =
    height - topChrome - Math.max(BAND_MIN, Math.round(STORY_BAND_FRACTION * height));
  const full = Math.round(Math.max(peek, Math.min(story, storyCap)));
  const storyBand = height - topChrome - full;

  return {
    width,
    header: topChrome,
    dock,
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
 * The transform that draws the resting disc in the band an open story leaves.
 *
 * The band is what is left under the bar above `layout.full`; the disc fills
 * `GLOBE_FILL` of it, never larger than at rest, because a scaled-up canvas is
 * a blurred one. `full` is the same for every story, so the band is too: the
 * earth does not swell and shrink as the reader moves from a short story to a
 * long one.
 *
 * The canvas is the whole window and scales about its own centre, so a point
 * at `centerY` lands at `height/2 + scale·(centerY − height/2)`; the
 * translation moves that onto the band's centre. A transform, never a
 * reprojection: it runs on the UI thread, tracking the sheet at 60fps.
 */
export function grownGlobeTransform(
  layout: DeckLayout,
  height: number,
): { scale: number; translateY: number } {
  'worklet';
  const band = Math.max(BAND_MIN, height - layout.header - layout.full);
  const radius = GLOBE_FILL * Math.min(layout.width, band);
  const scale = layout.radius > 0 ? Math.min(1, radius / layout.radius) : 1;
  const mid = height / 2;
  const centerY = layout.header + band / 2;
  return { scale, translateY: centerY - mid - scale * (layout.centerY - mid) };
}

/**
 * How far from the resting globe's centre the canvas has to be drawn for an
 * open story's globe to still reach every edge of the screen.
 *
 * The grown transform shrinks the canvas's drawing toward the band above the
 * sheet. Ground the projection never drew — past the screen, because nothing
 * there was visible at rest — would then open up as dark bands down both sides
 * of a zoomed globe. So the projection is carried out to where the screen's
 * corners land under that shrink, and never less than the resting screen's
 * own corners.
 */
export function grownReach(layout: DeckLayout, height: number): number {
  const cx = layout.width / 2;
  const mid = height / 2;
  let reach = 0;
  const corners = (scale: number, translateY: number) => {
    for (const px of [0, layout.width]) {
      for (const py of [0, height]) {
        const x = cx + (px - cx) / scale;
        const y = mid + (py - mid - translateY) / scale;
        reach = Math.max(reach, Math.hypot(x - cx, y - layout.centerY));
      }
    }
  };
  corners(1, 0);
  const grown = grownGlobeTransform(layout, height);
  corners(grown.scale, grown.translateY);
  return Math.ceil(reach);
}
