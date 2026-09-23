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
 * the writer's hard ceiling is 560 visible characters (`scripts/write-prompt.md`
 * §format), and the type scale tracks the window's width, so a line holds about
 * 43 characters on every phone. The sheet used to stop at each story's own
 * height, and reading meant watching the text, the globe and the controls jump
 * by three or four lines on every swipe. Sized for the worst case it left four or five blank lines under a
 * typical story; sized for today's tallest, a single long card with a market
 * line held every other story two to four lines short.
 *
 * Since 2026-09-20 the cap binds on a real phone and most open stories scroll:
 * the writer's budget rose to 480/560 characters and every block draws its own
 * paragraph again, which is about 5 lines past `storyCap` on a 393×852 window.
 * That is a chosen trade, not a regression — the globe, dock and controls all
 * sit outside the scrolling area, so only the prose moves.
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
/** Body lines the open card is sized for, at ~43 characters a line.
 *
 *  Keyed to the writer's hard ceiling, not to its target: this number is the
 *  worst case that can arrive before `StoryMeasure` has measured anything, and
 *  a card that overshoots it on the first frame is a card whose globe band
 *  jumps once it is measured.
 *
 *  **Counted per block, not over the whole body**, because every block is its
 *  own paragraph and each one's last line is part-empty. At the writer's word
 *  ceilings (10/16/22/20/18, `scripts/write-prompt.md` §rhythm) a maxed story
 *  is roughly 64/102/141/128/115 characters, which is 2+3+4+3+3 = 15 lines —
 *  where the same 560 characters set as one paragraph would take 14. That one
 *  line is what paragraph separation costs in *text*; `STORY_GAPS` is what it
 *  costs in *space*. */
const STORY_LINES = 15;
/** Blocks the open card is sized for: the four required, plus the optional
 *  counterpoint-or-quote. */
const STORY_BLOCKS = 5;
/** The gap under every block, as a fraction of a body line.
 *
 *  `mdStyles.sentence` (`lib/markdown.tsx`) sets `marginBottom: sizeBase × 0.5`
 *  and its line is `sizeBase × leadingBody`, so the gap is `0.5 / leadingBody`
 *  of a line and scales with the reader's type without either file knowing the
 *  other's numbers. `__tests__/deck-layout.test.ts` pins them together — change
 *  the margin there and this estimate is wrong everywhere until it is updated. */
const BLOCK_GAP_RATIO = 0.5 / 1.45;
/** The globe's share of the window at rest, before the card yields. */
const PEEK_BAND_FRACTION = 0.34;
/** The globe's share of the window while a story is open. */
const STORY_BAND_FRACTION = 0.2;
/** The smallest globe band in any state, in points. */
export const BAND_MIN = 140;

/** A row of 48pt touch targets: the gauges and the menu above the earth, and
 *  the story track in the dock. */
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

  // The whole story — its lines and the gaps between its blocks — then the odds
  // or thread line and the pinned row of words above the dock. Measured where
  // it can be; this arm is only the first frame's stand-in.
  const story =
    input.storyContent !== undefined
      ? HANDLE + input.storyContent + dock
      : above +
        STORY_LINES * body +
        Math.round((STORY_BLOCKS - 1) * BLOCK_GAP_RATIO * body) +
        SPACING.md +
        lineHeight(input, 'caption') +
        SPACING.sm +
        ACTIONS_ROW +
        dock;
  const storyCap = storyCapOf(input);
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

/** The open sheet's ceiling: the window less the bar and the globe's floor. */
function storyCapOf(input: DeckLayoutInput): number {
  const { height, chromeHeight } = input;
  return height - chromeHeight - Math.max(BAND_MIN, Math.round(STORY_BAND_FRACTION * height));
}

/** Characters a body line is assumed to hold when bounding a story from
 *  below: more than the ~43 one really holds, so lines are undercounted. */
const CHARS_PER_LINE_BOUND = 50;

/**
 * Whether measuring today's cards (`StoryMeasure`) could change the open
 * sheet's height at all.
 *
 * Measuring lays out every card in the river off screen — ~44 of them, 742ms
 * of a 1,365ms arrival commit in a dev build on the emulator (2026-09-23) —
 * and it ran at every launch and every new build. On a phone its answer was
 * nearly always thrown away: since 2026-09-20 a typical story is several
 * lines past `storyCap`, so `full` is the cap whatever the measurement says.
 * So bound each card's height from *below*, from its characters — one title
 * line, lines counted at `CHARS_PER_LINE_BOUND`, link syntax stripped — and
 * measure only when the bound for the card at `STORY_FIT_SHARE` could still
 * land under the cap: a tablet, small type, a day of short stories.
 */
export function openHeightNeedsMeasuring(
  input: DeckLayoutInput,
  stories: readonly (readonly string[])[],
): boolean {
  if (stories.length === 0) return false;
  const body = lineHeight(input, 'body');
  const perLine = CHARS_PER_LINE_BOUND / Math.min(input.fontScale, input.caps.body);
  const least =
    HANDLE +
    lineHeight(input, 'labelXs') +
    SPACING.xs +
    lineHeight(input, 'title') +
    SPACING.sm +
    // Always in a measurement: until `sources · save · share` mounts (when JS
    // is next idle), the card holds an empty box of this same height.
    ACTIONS_ROW +
    CONTROL_ROW +
    input.bottomInset;
  const bounds = stories.map((sentences) => {
    let lines = 0;
    for (const sentence of sentences) {
      // `[China](country:CN)` prints as `China`.
      const shown = sentence.replace(/\]\([^)]*\)/g, '').replace(/[[\]*_]/g, '');
      lines += Math.max(1, Math.ceil(shown.length / perLine));
    }
    const gaps = Math.round(Math.max(0, sentences.length - 1) * BLOCK_GAP_RATIO * body);
    return least + lines * body + gaps;
  });
  const sorted = [...bounds].sort((a, b) => a - b);
  const rank = Math.max(0, Math.ceil(STORY_FIT_SHARE * sorted.length) - 1);
  return (sorted[rank] ?? 0) < storyCapOf(input);
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
