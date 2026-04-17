import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  ANIMATION,
  BLACK,
  MAX_FONT_SCALE,
  RADIUS,
  SPACING,
  staggerDelay,
} from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ccToFlag } from '../../lib/article-utils';
import type { CompareRow } from '../../types';
import { type BlockVariant, blockContainerStyle } from './index';
import { SourceCaption } from './SourceCaption';

type Colors = ReturnType<typeof useTheme>['colors'];

function resolvePillColors(tone: CompareRow['tone'], colors: Colors): { bg: string; fg: string } {
  switch (tone) {
    case 'favorable':
      return { bg: colors.toneFavorable, fg: BLACK };
    case 'unfavorable':
      return { bg: colors.toneUnfavorable, fg: BLACK };
    case 'neutral':
      return { bg: colors.toneNeutral, fg: BLACK };
    default:
      return { bg: colors.pillBg, fg: colors.textEmphasis };
  }
}

interface CompareBlockProps {
  rows: CompareRow[];
  variant?: BlockVariant;
  sourceLabel?: string;
}

export const CompareBlock = memo(function CompareBlock({
  rows,
  variant = 'article',
  sourceLabel,
}: CompareBlockProps) {
  const { colors, font, typography } = useTheme();
  const rowPaddingV = variant === 'context' ? SPACING.xs : SPACING.sm;

  // Max weight across rows — only used when at least one row supplies it. Rows
  // without weight still render normally; with weights, each row grows a fill
  // proportional to its weight / max, turning compare into a light bar chart.
  const maxWeight = rows.reduce((m, r) => Math.max(m, r.weight ?? 0), 0);
  const showBars = maxWeight > 0;

  return (
    <View style={blockContainerStyle[variant]}>
      {rows.map((row, i) => {
        const flag = row.cc ? ccToFlag(row.cc) : null;
        const pill = resolvePillColors(row.tone, colors);
        const ruled = i < rows.length - 1;
        const barPct =
          showBars && row.weight != null ? Math.max(0, Math.min(1, row.weight / maxWeight)) : 0;
        return (
          <Animated.View
            key={`${row.label}-${i}`}
            entering={FadeIn.duration(ANIMATION.normal).delay(staggerDelay(i))}
            style={[
              styles.row,
              { paddingVertical: rowPaddingV },
              ruled && {
                borderBottomColor: colors.rule,
                borderBottomWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            {barPct > 0 ? (
              <View
                pointerEvents="none"
                style={[
                  styles.weightBar,
                  { backgroundColor: colors.accent, width: `${barPct * 100}%` },
                ]}
              />
            ) : null}
            <Text
              style={[
                styles.label,
                {
                  ...font.regular,
                  fontSize: typography.sizeBase,
                  color: colors.text,
                },
              ]}
              maxFontSizeMultiplier={MAX_FONT_SCALE.body}
              numberOfLines={1}
            >
              {flag ? `${flag}  ` : ''}
              {row.label}
            </Text>
            <View style={[styles.pill, { backgroundColor: pill.bg }]}>
              <Text
                style={{
                  ...font.semiBold,
                  fontSize: typography.sizeXs,
                  letterSpacing: typography.trackingCaps,
                  color: pill.fg,
                }}
                maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
              >
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
    position: 'relative',
    overflow: 'hidden',
  },
  // Left-anchored fill behind the row content. Subtle — signals magnitude
  // without shouting. Label + pill stack on top.
  weightBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    opacity: 0.18,
    borderRadius: 2,
  },
  label: {
    flex: 1,
  },
  pill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xxs,
    borderRadius: RADIUS.pill,
  },
});
