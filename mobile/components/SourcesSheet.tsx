import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { ArticleSource } from '../types';
import { SheetLayout } from './SheetLayout';
import { useMaxSheetHeight } from './SheetPrimitives';
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
  const { colors, font, typography, textStyles, sheetStyles } = useTheme();
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();

  // Single source → auto-expanded. Multi-source → everything collapsed; the
  // user taps a row to reveal its commentary.
  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  // Seed the expanded state when the sheet's source set changes (opens on a
  // new article, etc.). Single source expands; multi collapses.
  useEffect(() => {
    setExpandedSource(sources.length === 1 ? 0 : null);
  }, [sources]);

  // Always mount the SheetLayout so `sheetRef.current?.present()` works on the
  // first tap — returning null while sources is empty would leave the modal
  // un-registered and force the user to tap twice.
  return (
    <SheetLayout
      sheetRef={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={MAX_SHEET_HEIGHT}
      renderBackdrop={renderBackdrop}
      onDismiss={onDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.xxl }]}
      >
        {sources.length > 0 && (
          <>
            <Text style={[textStyles.smallCaps, { color: colors.textSecondary }]}>
              {sources.length === 1 ? 'source' : `${sources.length} sources`}
            </Text>
            {/* Explainer — anchors "tone" so the pill labels read as framing
             *  analysis, not a verdict. One line, italic, then a breath. */}
            <Text
              style={[
                styles.explainer,
                {
                  ...font.italic,
                  fontSize: typography.sizeXs,
                  lineHeight: typography.sizeXs * typography.leadingBody,
                  color: colors.textSecondary,
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
