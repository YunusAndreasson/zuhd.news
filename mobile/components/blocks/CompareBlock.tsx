import type { CompareRow } from '@shared/types';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ANIMATION, BLACK, RADIUS, SPACING, staggerDelay } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ccToFlag } from '../../lib/article-utils';
import { Text } from '../primitives';
import { SourceCaption } from './SourceCaption';
import { type BlockVariant, blockContainerStyle } from './shared';

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

  return (
    <View style={blockContainerStyle[variant]}>
      {label ? (
        <Text variant="labelXs" style={styles.blockLabel}>
          {label}
        </Text>
      ) : null}
      {rows.map((row, i) => {
        const flag = row.cc ? ccToFlag(row.cc) : null;
        const pill = resolvePillColors(row.tone, colors);
        const ruled = i < rows.length - 1;
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
            <Text variant="body" numberOfLines={1} style={styles.label}>
              {flag ? `${flag}  ` : ''}
              {row.label}
            </Text>
            <View style={[styles.pill, { backgroundColor: pill.bg }]}>
              {/* Pill value reads as mixed glyphs (numerals, %, operators) —
                  semiBold family preserves the original look rather than
                  forcing small-caps SC metrics onto the letters. */}
              <Text variant="labelXs" style={[{ color: pill.fg }, font.semiBold]}>
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
  blockLabel: {
    marginBottom: SPACING.xs,
  },
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
});
