import type { ArticleSource } from '@shared/types';
import { memo, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { EDITORIAL, SPACING } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { staggerEnter } from '../lib/stagger';
import { Text } from './primitives';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';
import { SourceRow } from './SourceRow';

interface SourcesSheetProps extends BaseSheetProps {
  sources: ArticleSource[];
  /** How far apart the outlets' framing sits, 0–1, computed by the pipeline
   *  from the spread of their sentiment scores. Published on every article
   *  since the field existed and read by nothing until now. */
  divergence?: number | null;
}

/**
 * How much the outlets disagreed, in one line.
 *
 * The sheet already showed each outlet's own lean. What it never showed was
 * the relationship between them, which is the thing worth knowing: two sources
 * agreeing is a story, two sources at opposite ends is a different story, and
 * the reader could only get there by comparing pills themselves.
 *
 * Silent below the moderate threshold. A small spread between two outlets is
 * noise, and a line that appears on every article stops being read.
 */
function divergenceNote(divergence: number | null | undefined, count: number): string | null {
  if (divergence == null || count < 2) return null;
  if (divergence >= EDITORIAL.divergenceHigh) {
    return 'These outlets told this story very differently.';
  }
  if (divergence >= EDITORIAL.divergenceModerate) {
    return 'These outlets told this story differently.';
  }
  return null;
}

/** Dedicated sheet for the article's sources. Opens from the tappable source
 *  indicator in the article dateline. A single source auto-expands so the
 *  reader sees the full citation without a second tap. */
export const SourcesSheet = memo(function SourcesSheet({
  sheetRef,
  sources,
  divergence,
  bottomInset,
  onDismiss,
}: SourcesSheetProps) {
  const snapProps = useSheetSnaps(false);

  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  useEffect(() => {
    setExpandedSource(sources.length === 1 ? 0 : null);
  }, [sources]);

  return (
    <SheetLayout sheetRef={sheetRef} {...snapProps} onDismiss={onDismiss}>
      <SheetScrollView bottomInset={bottomInset}>
        {sources.length > 0 && (
          <>
            <Text variant="labelSm">
              {sources.length === 1 ? 'source' : `${sources.length} sources`}
            </Text>
            {/* Explainer — anchors "tone" so the pill labels read as framing
             *  analysis, not a verdict. One line, italic, then a breath.
             *  Uses the sectionHeading font family at an xs size so it visually
             *  reads as smaller than a normal italic body line. */}
            <Text variant="sectionHeading" scale={0.85} style={styles.explainer}>
              {divergenceNote(divergence, sources.length) ?? 'How each outlet framed this story.'}
            </Text>
            {sources.map((s, i) => (
              <Animated.View key={s.name} entering={staggerEnter(i)}>
                <SourceRow
                  source={s}
                  isExpanded={expandedSource === i}
                  isLast={i === sources.length - 1}
                  onPress={() => setExpandedSource(expandedSource === i ? null : i)}
                />
              </Animated.View>
            ))}
          </>
        )}
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  explainer: {
    marginTop: SPACING.xxs,
    marginBottom: SPACING.md,
  },
});
