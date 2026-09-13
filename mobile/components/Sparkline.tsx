import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { toneColor } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { Valence } from '../lib/valence';

/**
 * A reading's recent shape, as one line with no axis.
 *
 * It exists for rows of readings (the gauges above the globe and the
 * instruments list), where a number and a caret say how much and which way but
 * not *how*. A 5% fall that happened on one day and one that bled out over the
 * week are different stories. The web's money rail draws the same thing beside
 * every row.
 *
 * **Coloured by the chip beside it, never by itself.** Its colour is the move's
 * valence (`lib/valence.ts`), so the line and the caret cannot disagree about
 * whether the move was bad. A rise in something whose rise hurts is rose in
 * both.
 *
 * **Static.** The path is built once per data change and no shared value
 * touches it. A row of ten gauges drawing themselves in would be the strip
 * performing, and on a cold launch it would compete with the globe's first
 * frames.
 *
 * Decorative to a screen reader: the row it sits in already speaks the move.
 */
export const Sparkline = memo(function Sparkline({
  points,
  tone,
  width,
  height,
  strokeWidth = 1.25,
}: {
  points: readonly number[];
  tone: Valence;
  width: number;
  height: number;
  strokeWidth?: number;
}) {
  const { colors } = useTheme();
  const path = useMemo(() => {
    if (points.length < 2 || width <= 0 || height <= 0) return null;
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const v of points) {
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo)) return null;
    // A flat week is a line through the middle, not one pinned to an edge.
    const span = hi - lo;
    const inset = strokeWidth;
    const usable = height - inset * 2;
    const step = (width - inset * 2) / (points.length - 1);
    let d = '';
    for (let i = 0; i < points.length; i++) {
      const v = points[i] as number;
      const t = span > 0 ? (v - lo) / span : 0.5;
      const x = inset + i * step;
      const y = inset + (1 - t) * usable;
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return Skia.Path.MakeFromSVGString(d);
  }, [points, width, height, strokeWidth]);

  if (!path) return null;
  return (
    <Canvas
      style={{ width, height }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        path={path}
        style="stroke"
        strokeWidth={strokeWidth}
        strokeJoin="round"
        strokeCap="round"
        color={toneColor(tone, colors)}
      />
    </Canvas>
  );
});
