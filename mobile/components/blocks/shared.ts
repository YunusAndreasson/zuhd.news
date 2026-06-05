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

/** Format a block metric value: thousands-grouped integers, one decimal for
 *  fractions, with a unit suffix that hugs single-char/`%` units and spaces
 *  multi-char ones ("1,234", "5.2%", "95 km/h"). Shared by TrendBlock,
 *  RankBlock and TreemapBlock so the number grammar reads identically. */
export function formatBlockNumber(n: number, unit?: string): string {
  const s = Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
  return unit ? `${s}${unit.length === 1 || unit === '%' ? '' : ' '}${unit}` : s;
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
