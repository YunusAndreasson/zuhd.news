import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SOURCES } from '../constants/sources';
import { EDITORIAL, LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { ccToFlag } from '../lib/article-utils';
import type { ArticleSource } from '../types';

type Tone = 'favorable' | 'unfavorable' | 'neutral' | null;

function computeTone(sentiment: number | null | undefined): Tone {
  if (sentiment == null) return null;
  if (sentiment > EDITORIAL.sentimentPositive) return 'favorable';
  if (sentiment < EDITORIAL.sentimentNegative) return 'unfavorable';
  return 'neutral';
}

const TONE_LABELS: Record<string, string> = {
  favorable: 'favorably',
  unfavorable: 'critically',
  neutral: 'neutral',
};

interface SourceRowProps {
  source: ArticleSource;
  isExpanded: boolean;
  isLast?: boolean;
  onPress: () => void;
}

export function SourceRow({ source, isExpanded, isLast, onPress }: SourceRowProps) {
  const { colors, font, typography, textStyles } = useTheme();
  const info = SOURCES[source.name];
  const cc = source.country?.toUpperCase();
  const flag = cc ? ccToFlag(cc) : null;
  const tone = computeTone(source.sentiment);
  const toneWord = tone ? TONE_LABELS[tone] : 'unknown';
  const toneBg =
    tone === 'favorable'
      ? colors.toneFavorable
      : tone === 'unfavorable'
        ? colors.toneUnfavorable
        : tone === 'neutral'
          ? colors.toneNeutral
          : colors.textSecondary;

  return (
    <Pressable
      style={[
        styles.sourceRow,
        !isLast && { borderBottomColor: colors.rule, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={source.name}
      accessibilityState={{ expanded: isExpanded }}
    >
      <View style={styles.sourceRowHeader}>
        <Text
          style={[
            styles.sourceName,
            { ...font.semiBold, fontSize: typography.sizeBase, color: colors.text },
          ]}
          numberOfLines={1}
        >
          {flag ? `${flag} ` : ''}
          {source.name}
        </Text>
        <View style={styles.sourceRowRight}>
          <View style={[styles.tonePill, { backgroundColor: toneBg }]}>
            <Text
              style={[
                styles.tonePillText,
                {
                  ...font.semiBold,
                  fontSize: typography.sizeXs,
                  color: colors.black,
                  letterSpacing: typography.trackingCaps,
                },
              ]}
            >
              {toneWord}
            </Text>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={LAYOUT.iconSm}
            color={colors.accent}
          />
        </View>
      </View>
      {isExpanded && info && (
        <>
          <Text selectable style={[styles.sourceType, textStyles.smallCapsXs]}>
            {info.type} · {info.location}
          </Text>
          <Text selectable style={[styles.bodyText, textStyles.body, { color: colors.accent }]}>
            {info.description}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sourceRow: {
    paddingVertical: SPACING.md,
  },
  sourceRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sourceRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  sourceName: {
    flex: 1,
  },
  tonePill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: LAYOUT.pillPaddingV,
    borderRadius: LAYOUT.pillRadius,
  },
  tonePillText: {},
  sourceType: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  bodyText: {},
});
