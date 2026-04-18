import { StyleSheet, View } from 'react-native';
import { SOURCES } from '../constants/sources';
import { BLACK, EDITORIAL, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { ccToFlag } from '../lib/article-utils';
import type { ArticleSource } from '../types';
import { Box, Icon, Pressable, Text } from './primitives';

type Tone = 'favorable' | 'unfavorable' | 'neutral' | null;

function computeTone(sentiment: number | null | undefined): Tone {
  if (sentiment == null) return null;
  if (sentiment > EDITORIAL.sentimentPositive) return 'favorable';
  if (sentiment < EDITORIAL.sentimentNegative) return 'unfavorable';
  return 'neutral';
}

// Directional labels. "Leans" sidesteps the "favorable to whom?" ambiguity
// and signals this is about framing, not a verdict.
const TONE_LABELS: Record<string, string> = {
  favorable: 'leans favorable',
  unfavorable: 'leans critical',
  neutral: 'neutral',
};

interface SourceRowProps {
  source: ArticleSource;
  isExpanded: boolean;
  isLast?: boolean;
  onPress: () => void;
}

export function SourceRow({ source, isExpanded, isLast, onPress }: SourceRowProps) {
  const { colors } = useTheme();
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
      haptic="tick"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={source.name}
      accessibilityState={{ expanded: isExpanded }}
    >
      <Box paddingY="md" rule={isLast ? undefined : 'bottom'}>
        <View style={styles.header}>
          <Text variant="bodyEmphasis" numberOfLines={1} style={styles.name}>
            {flag ? `${flag} ` : ''}
            {source.name}
          </Text>
          <View style={styles.right}>
            <View style={[styles.tonePill, { backgroundColor: toneBg }]}>
              <Text variant="labelXs" style={{ color: BLACK }}>
                {toneWord}
              </Text>
            </View>
            <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size="sm" tone="accent" />
          </View>
        </View>
        {isExpanded && info && (
          <>
            <Text selectable variant="labelXs" style={styles.typeLine}>
              {info.type} · {info.location}
            </Text>
            <Text selectable variant="body" tone="accent">
              {info.description}
            </Text>
          </>
        )}
      </Box>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  name: {
    flex: 1,
  },
  tonePill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xxs,
    borderRadius: RADIUS.pill,
  },
  typeLine: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
});
