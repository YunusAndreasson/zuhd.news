import type { BlockTone } from '@shared/types';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import {
  cancelAnimation,
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
 *  — same axis, same series, two different ways of writing a number. */
export function formatBlockNumber(n: number, unit?: string): string {
  const s = n.toLocaleString(undefined, { maximumFractionDigits: 1 });
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
    if (reduceMotion) {
      cancelAnimation(progress);
      progress.value = 1;
      return;
    }
    progress.value = withTiming(1, { duration, easing: EASING.out });
    return () => cancelAnimation(progress);
  }, [reduceMotion, progress, duration]);
  return progress;
}
