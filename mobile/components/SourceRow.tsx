import type { ArticleSource } from '@shared/types';
import { StyleSheet, View } from 'react-native';
import { SOURCES } from '../constants/sources';
import { EDITORIAL, SPACING, type TextTone } from '../constants/theme';
import { ccToFlag } from '../lib/article-utils';
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

const TONE_TEXT: Record<string, TextTone> = {
  favorable: 'favorable',
  unfavorable: 'unfavorable',
  neutral: 'neutral',
};

interface SourceRowProps {
  source: ArticleSource;
  isExpanded: boolean;
  isLast?: boolean;
  onPress: () => void;
}

export function SourceRow({ source, isExpanded, isLast, onPress }: SourceRowProps) {
  const info = SOURCES[source.name];
  const cc = source.country?.toUpperCase();
  const flag = cc ? ccToFlag(cc) : null;
  const tone = computeTone(source.sentiment);
  const toneWord = tone ? TONE_LABELS[tone] : 'unknown';
  const toneTextTone: TextTone = tone ? (TONE_TEXT[tone] ?? 'secondary') : 'secondary';

  return (
    <Pressable
      haptic="tick"
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 16, right: 16 }}
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
            <Text variant="labelXs" tone={toneTextTone} numberOfLines={1}>
              {toneWord}
            </Text>
            <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size="sm" tone="secondary" />
          </View>
        </View>
        {isExpanded && (info || source.angle) && (
          <>
            {info && (
              <Text selectable variant="labelXs" style={styles.typeLine}>
                {info.type} · {info.location}
              </Text>
            )}
            {source.angle ? (
              <>
                <Text selectable variant="body" tone="accent">
                  {source.angle}
                </Text>
                {info && (
                  <Text selectable variant="caption" style={styles.description}>
                    {info.description}
                  </Text>
                )}
              </>
            ) : (
              info && (
                <Text selectable variant="body" tone="accent">
                  {info.description}
                </Text>
              )
            )}
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
    gap: SPACING.sm,
  },
  name: {
    flex: 1,
  },
  typeLine: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  description: {
    marginTop: SPACING.sm,
  },
});
