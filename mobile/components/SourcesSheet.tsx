import { divergenceNote } from '@shared/source-framing';
import type { ArticleSource } from '@shared/types';
import { memo, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SPACING } from '../constants/theme';
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
 *
 * The thresholds and the wording moved to `@shared/source-framing` on
 * 2026-08-30, when the article page began showing the same note: two surfaces
 * describing one story two different ways is worse than either wording. The
 * old local values fired at 0.2, which is *below* the corpus median of 0.24 —
 * so the note appeared on more than half of all articles, the exact failure the
 * paragraph above warns about. The shared thresholds are the measured top
 * quartile and top decile, which is what makes this docstring true.
 */

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
  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  useEffect(() => {
    setExpandedSource(sources.length === 1 ? 0 : null);
  }, [sources]);

  return (
    <SheetLayout sheetRef={sheetRef} onDismiss={onDismiss}>
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
