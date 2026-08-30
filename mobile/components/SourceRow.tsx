import { TONE_LABELS, toneOf } from '@shared/source-framing';
import type { ArticleSource } from '@shared/types';
import { StyleSheet, View } from 'react-native';
import { SOURCES } from '../constants/sources';
import { SPACING, type TextTone } from '../constants/theme';
import { ccToFlag } from '../lib/article-utils';
import { useOpenLink } from '../lib/open-link';
import { Box, Icon, Pressable, Text } from './primitives';
import { SheetLink } from './SheetContent';

// Thresholds and wording now live in `@shared/source-framing`, because the
// article page renders the same angles and the same tones since 2026-08-30 and
// a second copy here is how the app and the page would come to describe one
// outlet two different ways. The labels are unchanged: "leans" sidesteps the
// "favorable to whom?" ambiguity and signals this is framing, not a verdict.

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
  const tone = toneOf(source.sentiment);
  const toneWord = tone ? TONE_LABELS[tone] : 'unknown';
  const toneTextTone: TextTone = tone ? (TONE_TEXT[tone] ?? 'secondary') : 'secondary';
  const openLink = useOpenLink();
  const url = source.url || null;

  // The chevron used to promise an expansion that two thirds of rows could not
  // deliver: `SOURCES` is a hand-maintained registry of ~98 outlets and the
  // feed routinely cites outlets outside it (Reuters, AP, the NYT among them),
  // so the row opened onto nothing. Now the affordance is only drawn when
  // there is something behind it, and `url` means most rows have something.
  const expandable = !!(info || source.angle || url);

  const body = (
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
          {expandable && (
            <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size="sm" tone="secondary" />
          )}
        </View>
      </View>
      {isExpanded && expandable && (
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
          {/* "Sources cited" is a first principle; until now it stopped at
              naming the outlet. This is the reader's path to the original
              reporting — the thing that makes the citation checkable. */}
          {url && (
            <SheetLink
              label="read the original"
              accessibilityLabel={`Read the original at ${source.name}`}
              onPress={() => openLink(url)}
            />
          )}
        </>
      )}
    </Box>
  );

  // A row with nothing behind it is not a control. Render it as plain content
  // so screen readers announce a citation rather than a button that does
  // nothing, and so the press animation doesn't imply an action.
  if (!expandable) return <View accessible>{body}</View>;

  return (
    <Pressable
      haptic="tick"
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 16, right: 16 }}
      accessibilityRole="button"
      accessibilityLabel={source.name}
      accessibilityState={{ expanded: isExpanded }}
    >
      {body}
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
