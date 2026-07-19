import type { CompareRow } from '@shared/types';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { BLACK, RADIUS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ccToFlag } from '../../lib/article-utils';
import { staggerFadeIn } from '../../lib/stagger';
import { Text } from '../primitives';
import { SourceCaption } from './SourceCaption';
import { type BlockVariant, blockContainerStyle, blockSharedStyles, blockToneBg } from './shared';

type Colors = ReturnType<typeof useTheme>['colors'];

function resolvePillColors(tone: CompareRow['tone'], colors: Colors): { bg: string; fg: string } {
  // Typed tones reuse the shared block-tone background (on a BLACK glyph for
  // contrast); untyped pills fall back to the neutral pill surface.
  if (tone === 'favorable' || tone === 'unfavorable' || tone === 'neutral') {
    return { bg: blockToneBg(tone, colors), fg: BLACK };
  }
  return { bg: colors.pillBg, fg: colors.textEmphasis };
}

interface CompareBlockProps {
  rows: CompareRow[];
  label?: string;
  variant?: BlockVariant;
  sourceLabel?: string;
}

export const CompareBlock = memo(function CompareBlock({
  rows,
  label,
  variant = 'article',
  sourceLabel,
}: CompareBlockProps) {
  const { colors, font } = useTheme();
  const rowPaddingV = variant === 'context' ? SPACING.xs : SPACING.sm;
  const reduceMotion = useReducedMotion();

  // Derive a single legend from the first row that carries labeled segments.
  // All rows in a segmented compare share the same segment categories (e.g.
  // "oil / tax / other" across every country); when a row's segments don't
  // carry labels, the legend simply isn't rendered.
  const legendSource = rows.find(
    (r) => r.segments && r.segments.length > 1 && r.segments.some((s) => s.label),
  );
  const segmentLegend = legendSource?.segments
    ? legendSource.segments
        .filter((s): s is typeof s & { label: string } => !!s.label)
        .map((s) => ({ label: s.label, color: resolvePillColors(s.tone, colors).bg }))
    : null;

  return (
    <View style={blockContainerStyle[variant]}>
      {label ? (
        <Text variant="labelSm" style={blockSharedStyles.label}>
          {label}
        </Text>
      ) : null}
      {segmentLegend && segmentLegend.length > 0 ? (
        <View style={styles.legendRow}>
          {segmentLegend.map((l, i) => (
            <View key={`legend-${l.label}-${i}`} style={styles.legendItem}>
              <View style={[blockSharedStyles.swatch, { backgroundColor: l.color }]} />
              <Text variant="labelXs" tone="secondary" numberOfLines={1}>
                {l.label.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {rows.map((row, i) => {
        const flag = row.cc ? ccToFlag(row.cc) : null;
        const pill = resolvePillColors(row.tone, colors);
        const ruled = i < rows.length - 1;
        const segments = row.segments && row.segments.length > 1 ? row.segments : null;

        // Segmented rows stack vertically: name + value on a header line, the
        // bar full-width below. Plain (single-pill) rows stay on one line —
        // the pill is small enough that the country name has the room.
        if (segments) {
          return (
            <Animated.View
              key={`${row.label}-${i}`}
              entering={reduceMotion ? undefined : staggerFadeIn(i)}
              style={[
                styles.segmentedRow,
                { paddingVertical: rowPaddingV },
                ruled && {
                  borderBottomColor: colors.rule,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={styles.segmentedHeader}>
                <Text variant="body" numberOfLines={1} style={styles.segmentedLabel}>
                  {flag ? `${flag}  ` : ''}
                  {row.label}
                </Text>
                <Text variant="labelXs" tone="emphasis" style={styles.segmentedValue}>
                  {row.value}
                </Text>
              </View>
              <View style={styles.segmentsBar}>
                {segments.map((s, sIdx) => {
                  const seg = resolvePillColors(s.tone, colors);
                  return (
                    <View
                      key={`${row.label}-seg-${sIdx}`}
                      style={[
                        styles.segmentCell,
                        { flexGrow: Math.max(0, s.value), backgroundColor: seg.bg },
                      ]}
                    />
                  );
                })}
              </View>
            </Animated.View>
          );
        }

        return (
          <Animated.View
            key={`${row.label}-${i}`}
            entering={reduceMotion ? undefined : staggerFadeIn(i)}
            style={[
              styles.row,
              { paddingVertical: rowPaddingV },
              ruled && {
                borderBottomColor: colors.rule,
                borderBottomWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <Text variant="body" numberOfLines={1} style={styles.label}>
              {flag ? `${flag}  ` : ''}
              {row.label}
            </Text>
            <View style={[styles.pill, { backgroundColor: pill.bg }]}>
              {/* Pill value reads as mixed glyphs (numerals, %, operators) —
                  semiBold family preserves the original look rather than
                  forcing small-caps SC metrics onto the letters. */}
              <Text variant="labelSm" style={[{ color: pill.fg }, font.semiBold]}>
                {row.value}
              </Text>
            </View>
          </Animated.View>
        );
      })}
      {sourceLabel ? <SourceCaption label={sourceLabel} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  label: {
    flex: 1,
  },
  pill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xxs,
    borderRadius: RADIUS.pill,
  },
  segmentedRow: {
    // Vertical layout — name + value on top, full-width bar beneath. Lets
    // any country name fit without truncation while giving the bar the
    // entire row width to communicate composition.
  },
  segmentedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: SPACING.sm,
    marginBottom: SPACING.xxs,
  },
  segmentedLabel: {
    flex: 1,
  },
  segmentedValue: {
    // Right-aligned by being the second flex sibling without flex:1.
  },
  segmentsBar: {
    flexDirection: 'row',
    width: '100%',
    height: 10,
    borderRadius: RADIUS.pill,
    overflow: 'hidden',
  },
  segmentCell: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: SPACING.md,
    rowGap: SPACING.xxs,
    marginBottom: SPACING.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xxs,
  },
});
