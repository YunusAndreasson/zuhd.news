import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { ArticleSource } from '@shared/types';
import { memo, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import { Text } from './primitives';
import { SheetLayout } from './SheetLayout';
import { SourceRow } from './SourceRow';

interface SourcesSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  sources: ArticleSource[];
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
}

/** Dedicated sheet for the article's sources. Opens from the tappable source
 *  indicator in the article dateline. A single source auto-expands so the
 *  reader sees the full citation without a second tap. */
export const SourcesSheet = memo(function SourcesSheet({
  sheetRef,
  sources,
  bottomInset,
  renderBackdrop,
  onDismiss,
}: SourcesSheetProps) {
  const { sheetStyles, textVariants } = useTheme();
  const snapProps = useSheetSnaps(false);

  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  useEffect(() => {
    setExpandedSource(sources.length === 1 ? 0 : null);
  }, [sources]);

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      renderBackdrop={renderBackdrop}
      onDismiss={onDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {sources.length > 0 && (
          <>
            <Text variant="labelSm">
              {sources.length === 1 ? 'source' : `${sources.length} sources`}
            </Text>
            {/* Explainer — anchors "tone" so the pill labels read as framing
             *  analysis, not a verdict. One line, italic, then a breath.
             *  Uses the sectionHeading font family at an xs size so it visually
             *  reads as smaller than a normal italic body line. */}
            <Text
              variant="sectionHeading"
              style={[
                styles.explainer,
                {
                  fontSize: textVariants.labelXs.fontSize,
                  lineHeight: textVariants.labelXs.lineHeight,
                },
              ]}
            >
              How each outlet framed this story.
            </Text>
            {sources.map((s, i) => (
              <Animated.View
                key={s.name}
                entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(i))}
              >
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
      </BottomSheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  explainer: {
    marginTop: SPACING.xxs,
    marginBottom: SPACING.md,
  },
});
