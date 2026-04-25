import type { BlockTone } from '@shared/types';
import { Canvas, Rect } from '@shopify/react-native-skia';
import { type HierarchyRectangularNode, hierarchy, treemap } from 'd3-hierarchy';
import { memo, useEffect, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { ANIMATION, EASING, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../primitives';
import { SourceCaption } from './SourceCaption';
import { type BlockVariant, blockContainerStyle } from './shared';

const INITIAL_WIDTH_ESTIMATE = Dimensions.get('window').width - SPACING.screenPadding * 2;
const CHART_HEIGHT = 220;
const CELL_PADDING = 2;
const LABEL_INSET = 4;
// Below this cell area in pixels², don't render a label — it would clip and
// look like a stylesheet bug. Reader still sees the rectangle's relative
// size; the legend list below covers names for tiny cells.
const MIN_CELL_AREA_FOR_LABEL = 1800;

type Colors = ReturnType<typeof useTheme>['colors'];

interface TreemapItem {
  label: string;
  value: number;
  tone?: BlockTone;
}

interface TreemapBlockProps {
  items: TreemapItem[];
  label?: string;
  variant?: BlockVariant;
  sourceLabel?: string;
}

function toneColor(tone: BlockTone | undefined, colors: Colors): string {
  // For typed tones, use the tone palette; for untyped, fall back to the
  // emphasis color and let the per-cell opacity carry the value hierarchy
  // (the largest cell is the most opaque).
  switch (tone) {
    case 'favorable':
      return colors.toneFavorable;
    case 'unfavorable':
      return colors.toneUnfavorable;
    case 'neutral':
      return colors.toneNeutral;
    default:
      return colors.textEmphasis;
  }
}

export const TreemapBlock = memo(function TreemapBlock({
  items,
  label,
  variant = 'article',
  sourceLabel,
}: TreemapBlockProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(INITIAL_WIDTH_ESTIMATE);

  const layout = useMemo(() => {
    if (width <= 0 || items.length === 0) return null;
    const positives = items.filter((it) => Number.isFinite(it.value) && it.value > 0);
    if (positives.length === 0) return null;
    try {
      const root = hierarchy<{ children?: TreemapItem[] } & TreemapItem>({
        label: '',
        value: 0,
        children: positives,
      } as never)
        .sum((d) => (d as TreemapItem).value)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
      treemap<{ children?: TreemapItem[] } & TreemapItem>()
        .size([width, CHART_HEIGHT])
        .padding(CELL_PADDING)(root);
      // After treemap() runs, every node carries x0/x1/y0/y1 — the rectangular
      // variant. The hierarchy type doesn't widen automatically so we cast.
      const leaves = root.leaves() as unknown as HierarchyRectangularNode<TreemapItem>[];
      return leaves.map((leaf) => {
        const item = leaf.data;
        return {
          item,
          x0: leaf.x0,
          x1: leaf.x1,
          y0: leaf.y0,
          y1: leaf.y1,
        };
      });
    } catch {
      return null;
    }
  }, [items, width]);

  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withTiming(1, { duration: ANIMATION.slow, easing: EASING.out });
  }, [reduceMotion, progress]);

  if (!layout) {
    return (
      <View style={blockContainerStyle[variant]}>
        {label ? (
          <Text variant="labelXs" style={styles.label}>
            {label}
          </Text>
        ) : null}
        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={[styles.canvasWrap, { height: CHART_HEIGHT }]}
        />
      </View>
    );
  }

  const maxValue = Math.max(...layout.map((c) => c.item.value));

  return (
    <View style={blockContainerStyle[variant]}>
      {label ? (
        <Text variant="labelXs" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.canvasWrap, { height: CHART_HEIGHT }]}
      >
        {width > 0 ? (
          <>
            <Canvas style={{ width, height: CHART_HEIGHT }}>
              {layout.map((c, i) => {
                const intensity = Math.max(0.4, c.item.value / maxValue);
                return (
                  <Rect
                    key={`cell-${i}`}
                    x={c.x0}
                    y={c.y0}
                    width={Math.max(1, c.x1 - c.x0)}
                    height={Math.max(1, c.y1 - c.y0)}
                    color={toneColor(c.item.tone, colors)}
                    opacity={c.item.tone ? 0.85 : 0.18 + 0.6 * intensity}
                  />
                );
              })}
            </Canvas>
            {layout.map((c, i) => {
              const w = c.x1 - c.x0;
              const h = c.y1 - c.y0;
              if (w * h < MIN_CELL_AREA_FOR_LABEL) return null;
              return (
                <View
                  key={`label-${i}`}
                  pointerEvents="none"
                  style={[
                    styles.cellLabel,
                    {
                      left: c.x0 + LABEL_INSET,
                      top: c.y0 + LABEL_INSET,
                      width: Math.max(0, w - LABEL_INSET * 2),
                      maxHeight: Math.max(0, h - LABEL_INSET * 2),
                    },
                  ]}
                >
                  <Text variant="labelXs" tone="emphasis" numberOfLines={2}>
                    {c.item.label}
                  </Text>
                  <Text variant="labelXs" tone="emphasis">
                    {Number.isInteger(c.item.value)
                      ? c.item.value.toLocaleString()
                      : c.item.value.toFixed(1)}
                  </Text>
                </View>
              );
            })}
          </>
        ) : null}
      </View>

      {/* Detail list — every item rendered as a swatch + label + value row,
          sorted by value desc. Closes the loop on small cells whose in-canvas
          labels were suppressed: the reader can still decode "what's that
          tiny grey rectangle?" without leaving the brief. */}
      {(() => {
        const totalValue = layout.reduce((sum, c) => sum + c.item.value, 0);
        const sorted = [...layout].sort((a, b) => b.item.value - a.item.value);
        return (
          <View style={styles.detailList}>
            {sorted.map((c, i) => {
              const intensity = Math.max(0.4, c.item.value / maxValue);
              const swatchOpacity = c.item.tone ? 0.85 : 0.18 + 0.6 * intensity;
              const pct = totalValue > 0 ? (c.item.value / totalValue) * 100 : 0;
              return (
                <View key={`detail-${i}`} style={styles.detailRow}>
                  <View
                    style={[
                      styles.detailSwatch,
                      {
                        backgroundColor: toneColor(c.item.tone, colors),
                        opacity: swatchOpacity,
                      },
                    ]}
                  />
                  <Text
                    variant="labelXs"
                    tone="secondary"
                    style={styles.detailLabel}
                    numberOfLines={1}
                  >
                    {c.item.label}
                  </Text>
                  <Text variant="labelXs" tone="emphasis" style={styles.detailValue}>
                    {Number.isInteger(c.item.value)
                      ? c.item.value.toLocaleString()
                      : c.item.value.toFixed(1)}
                  </Text>
                  <Text variant="labelXs" tone="secondary" style={styles.detailPct}>
                    {`${pct.toFixed(0)}%`}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })()}

      {sourceLabel ? <SourceCaption label={sourceLabel} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    marginBottom: SPACING.xs,
  },
  canvasWrap: {
    position: 'relative',
    width: '100%',
  },
  cellLabel: {
    position: 'absolute',
  },
  detailList: {
    marginTop: SPACING.sm,
    gap: SPACING.xxs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  detailSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  detailLabel: {
    flex: 1,
  },
  detailValue: {
    minWidth: 48,
    textAlign: 'right',
  },
  detailPct: {
    minWidth: 36,
    textAlign: 'right',
  },
});
