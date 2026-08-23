import type { BlockTone } from '@shared/types';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import {
  type SharedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ANIMATION, type ColorPalette, EASING, RADIUS, SPACING } from '../../constants/theme';

/** Where a block is being rendered. `article` variant is the full-bleed
 *  article-page look; `context` is the embedded-in-timeline look (smaller
 *  visual weight, no self-animation). Lives here — not in index.tsx — so
 *  individual block components can import without creating a require cycle
 *  with the barrel that also imports them. */
export type BlockVariant = 'article' | 'context';

/** Shared outer-container spacing for every non-prose block. Keeps margin
 *  rhythm consistent between ActorsBlock, CompareBlock, LocationsBlock,
 *  QuoteBlock and TrendBlock without per-component style duplication. */
export const blockContainerStyle = StyleSheet.create({
  article: { marginBottom: SPACING.md },
  context: { marginVertical: SPACING.sm },
});

/** Styles shared across chart blocks so the same visual role resolves to the
 *  same token everywhere (the swatch radius and label gap had drifted between
 *  literal `2`/`RADIUS.handle` and `xs`/`sm`/`xxs` across blocks). */
export const blockSharedStyles = StyleSheet.create({
  /** Gap below a block's `labelSm` header. One value so adjacent blocks in an
   *  article share the same label-to-body rhythm. */
  label: { marginBottom: SPACING.xs },
  /** Positioning context for an absolutely-laid-out chart overlay (axis
   *  labels, scrub readouts) on top of a Skia canvas. Height is applied
   *  inline per block. */
  chartWrap: { position: 'relative', width: '100%' },
  /** 10×10 legend / detail swatch. `RADIUS.handle` (not a literal `2`) so the
   *  rounding tracks the token if it ever changes. */
  swatch: { width: 10, height: 10, borderRadius: RADIUS.handle },
});

/**
 * Currency symbols that go in *front* of the number.
 *
 * The rule this file used to apply was "a one-character unit hugs the number",
 * which is right for `%` and wrong for every currency — it printed an Ethereum
 * axis as `2515.0$` on a card whose own reading said `$2,418`, so the same
 * number carried two different grammars a hundred points apart. Length is not
 * the question; which side the symbol belongs on is.
 */
const PREFIX_UNITS = new Set(['$', '€', '£', '¥', '₹']);

/** Format a block metric value: thousands-grouped, at most one decimal, with
 *  the unit on the side its grammar wants — currency symbols in front
 *  ("$1,234"), `%` hugging behind ("5.2%"), everything else spaced after
 *  ("95 km/h", "4,599.4 $/oz"). `TrendBlock` is the only caller left — the
 *  rank and treemap blocks this was also written for went with the rest of
 *  `ArticleBlock` — but it stays here rather than moving into that file so a
 *  second chart block cannot invent a second number grammar.
 *
 *  Grouping is applied to fractions too. `toFixed(1)` was used for those and
 *  it drops the separators, so one chart could show `78317.8` above `62,802`
 *  — same axis, same series, two different ways of writing a number.
 *
 *  `decimals` fixes the precision instead of capping it, and a chart should
 *  always pass one — see `axisDecimals`. Left off, the value keeps its own
 *  precision up to a tenth, which is what put `$2,515` directly above
 *  `$1,844.6` on the Ethereum axis: both labels obeyed the cap, and the pair
 *  still disagreed about how a price is written. */
export function formatBlockNumber(n: number, unit?: string, decimals?: 0 | 1 | 2): string {
  const s = n.toLocaleString(
    undefined,
    decimals === undefined
      ? { maximumFractionDigits: 1 }
      : { minimumFractionDigits: decimals, maximumFractionDigits: decimals },
  );
  if (!unit) return s;
  if (PREFIX_UNITS.has(unit)) return `${unit}${s}`;
  if (unit === '%') return `${s}${unit}`;
  // The space is the only place this label may break. A chart axis is narrow
  // enough that "4,599.4 $/oz" wraps, and left to itself the layout broke it
  // at the slash — "4,599.4 $/" over "oz", which reads as a number whose unit
  // is "dollars per". Word joiners make the unit one atom, so the break falls
  // between the number and its unit, which is the only division that means
  // anything. They are zero-width and screen readers ignore them, so the
  // scrub tooltip and the accessibility label are unaffected.
  return `${s} ${unit.replace(/\//g, '\u2060/\u2060')}`;
}

/**
 * How many decimals one chart writes all of its numbers to.
 *
 * Chosen once, from the axis endpoints, and then used by the two axis labels,
 * the scrub readout and the accessibility range — so a chart cannot say
 * `$2,515` at the top, `$1,844.6` at the bottom and `$2,418.37` under a
 * finger. Precision is a property of the series, not of each value's
 * happening to be round.
 *
 * The rules, in the order they fire:
 *
 *   whole endpoints stay whole — a contract priced 39 to 75 gains nothing
 *     from `39.0`, and most probability series are integers already;
 *   a tenth of a dollar on a five-figure price is noise the reader will never
 *     repeat, and it is the same judgement `formatReading` makes about the
 *     card's own headline — the axis had been contradicting it by two decimal
 *     places two centimetres away (`$77,074` under `$78,317.8`);
 *   otherwise the span decides, because that is what the axis is *for*: a
 *     rand moving 16.04 → 16.80 in a month is a whole story told inside one
 *     digit, and rounding it away leaves two labels reading `16` and `17`.
 *
 * This does **not** always land on `formatReading`'s answer for the same card,
 * and it should not. On the live payload the two agree on five cards of eight
 * and part company on three — VIX (`16` over `14.3`–`22.2`), the ruble, the
 * rand — all of them in the band between ten and a thousand with a span of
 * only a few units. That is the difference between the two jobs, not a gap
 * between them: a reading is a *level*, rounded to the digits a reader could
 * repeat out loud, while an axis is a *range* and has to stay legible as one.
 * Force the rand's axis onto its headline's precision and both labels read
 * `16`/`17` for a month that is the card's entire subject. The scrub readout
 * follows the axis for the same reason — it is reading a point off that
 * range, not restating the headline.
 */
export function axisDecimals(min: number, max: number): 0 | 1 | 2 {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  if (Number.isInteger(min) && Number.isInteger(max)) return 0;
  if (Math.max(Math.abs(min), Math.abs(max)) >= 1000) return 0;
  const span = Math.abs(max - min);
  if (span >= 10) return 0;
  return span >= 1 ? 1 : 2;
}

/** Background fill for a typed block tone. Untyped tones fall back to a
 *  mid-luminance grey (`textSecondary`) so per-cell opacity carries the value
 *  hierarchy instead. Returns the *background* palette — distinct from
 *  `toneColor` in theme.ts, which returns the higher-contrast text palette. */
export function blockToneBg(tone: BlockTone | undefined, colors: ColorPalette): string {
  switch (tone) {
    case 'favorable':
      return colors.toneFavorable;
    case 'unfavorable':
      return colors.toneUnfavorable;
    case 'neutral':
      return colors.toneNeutral;
    default:
      return colors.textSecondary;
  }
}

/** Mount-time draw progress for a chart block: a `0 → 1` shared value that
 *  drives Skia path `end` reveals. Resolves instantly to `1` under reduced
 *  motion / battery saver (via `useReducedMotion`). Returned value is inert
 *  unless wired to an animated prop — blocks that don't reveal a path simply
 *  don't call this. */
export function useChartDrawProgress(duration: number = ANIMATION.slow): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withTiming(1, { duration, easing: EASING.out });
  }, [reduceMotion, progress, duration]);
  return progress;
}
