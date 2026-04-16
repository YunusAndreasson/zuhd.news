import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { EDITORIAL, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { ArticleSource } from '../types';
import { SheetLayout } from './SheetLayout';
import { useMaxSheetHeight } from './SheetPrimitives';
import { SourceRow } from './SourceRow';

interface SourceSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  sources: ArticleSource[];
  divergence: number | null;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
}

export const SourceSheet = memo(function SourceSheet({
  sheetRef,
  sources,
  divergence,
  bottomInset,
  renderBackdrop,
  onDismiss,
}: SourceSheetProps) {
  const { colors, font, typography, sheetStyles } = useTheme();
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();
  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  const handleDismiss = useCallback(() => {
    setExpandedSource(null);
    onDismiss();
  }, [onDismiss]);

  return (
    <SheetLayout
      sheetRef={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={MAX_SHEET_HEIGHT}
      renderBackdrop={renderBackdrop}
      handleTitle={sources.length === 1 ? 'source' : 'sources'}
      onDismiss={handleDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {sources.length > 0 ? (
          <>
            <Text
              style={[
                styles.coverageHeading,
                {
                  ...font.italic,
                  fontSize: typography.sizeSm,
                  color: colors.accent,
                  fontStyle: 'italic',
                },
              ]}
            >
              {divergence != null &&
              divergence >= EDITORIAL.divergenceModerate &&
              sources.length > 1
                ? divergence >= EDITORIAL.divergenceHigh
                  ? 'These sources frame this story very differently.'
                  : 'These sources frame this story differently.'
                : 'How this story is covered'}
            </Text>
            {sources.map((s, i) => (
              <SourceRow
                key={s.name}
                source={s}
                isExpanded={expandedSource === i}
                onPress={() => setExpandedSource(expandedSource === i ? null : i)}
              />
            ))}
          </>
        ) : null}
      </BottomSheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  coverageHeading: {
    marginBottom: SPACING.md,
  },
});
