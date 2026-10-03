import { TONE_LABELS, toneOf } from '@shared/source-framing';
import type { ArticleSource } from '@shared/types';
import { StyleSheet, View } from 'react-native';
import { SOURCES } from '../constants/sources';
import { SPACING, type TextTone } from '../constants/theme';
import { ccToFlag } from '../lib/article-utils';
import { openExternal } from '../lib/open-link';
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
  /** The story's only source: its details are the sheet, so the row is not a
   *  control. As a toggle it could close the one thing the sheet opened to
   *  show, and a tap anywhere on the paragraph did. */
  alone?: boolean;
  onPress: () => void;
}

export function SourceRow({ source, isExpanded, isLast, alone, onPress }: SourceRowProps) {
  const info = SOURCES[source.name];
  const cc = source.country?.toUpperCase();
  const flag = cc ? ccToFlag(cc) : null;
  const tone = toneOf(source.sentiment);
  const toneWord = tone ? TONE_LABELS[tone] : 'unknown';
  const toneTextTone: TextTone = tone ? (TONE_TEXT[tone] ?? 'secondary') : 'secondary';
  const url = source.url || null;

  // The chevron used to promise an expansion that two thirds of rows could not
  // deliver: `SOURCES` is a hand-maintained registry of ~98 outlets and the
  // feed routinely cites outlets outside it (Reuters, AP, the NYT among them),
  // so the row opened onto nothing. Now the affordance is only drawn when
  // there is something behind it, and `url` means most rows have something.
  const expandable = !!(info || source.angle || url);
  const toggles = expandable && !alone;
  const open = expandable && (alone || isExpanded);

  const header = (
    <View style={[styles.header, open ? styles.headerOpen : styles.headerClosed]}>
      <Text variant="bodyEmphasis" numberOfLines={1} style={styles.name}>
        {flag ? `${flag} ` : ''}
        {source.name}
      </Text>
      <View style={styles.right}>
        <Text variant="labelXs" tone={toneTextTone} numberOfLines={1}>
          {toneWord}
        </Text>
        {toggles && (
          <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size="sm" tone="secondary" />
        )}
      </View>
    </View>
  );

  return (
    <Box rule={isLast ? undefined : 'bottom'}>
      {toggles ? (
        // Only the header is the button. The details sat inside it too, so a
        // tap on the paragraph closed it and a long press to copy a sentence
        // ended in the same close.
        <Pressable
          onPress={onPress}
          // Sideways only. Rows are stacked: a later row is hit-tested first,
          // so its top slop took the bottom 6pt of the row above, and a tap
          // there opened the wrong source.
          hitSlop={SIDE_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`${source.name}, ${toneWord}`}
          accessibilityState={{ expanded: isExpanded }}
        >
          {header}
        </Pressable>
      ) : (
        // A row with nothing behind it, or the story's only source, is not a
        // control: a screen reader announces a citation, not a button.
        <View accessible accessibilityLabel={`${source.name}, ${toneWord}`}>
          {header}
        </View>
      )}
      {open && (
        <View style={styles.details}>
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
              onPress={() => openExternal(url)}
            />
          )}
        </View>
      )}
    </Box>
  );
}

const SIDE_SLOP = { left: 16, right: 16 };

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingTop: SPACING.md,
  },
  // The row's own padding, so the whole band is the header's target; open,
  // the details close the row instead.
  headerClosed: {
    paddingBottom: SPACING.md,
  },
  headerOpen: {
    paddingBottom: SPACING.sm,
  },
  details: {
    paddingBottom: SPACING.md,
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
    marginBottom: SPACING.sm,
  },
  description: {
    marginTop: SPACING.sm,
  },
});
