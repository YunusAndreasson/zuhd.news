import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { EDITORIAL, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { ArticleSource } from '../types';
import { SheetHandle } from './SheetHandle';
import { SheetContainer, useMaxSheetHeight } from './SheetPrimitives';
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

  const SourceHandle = useCallback(
    () => <SheetHandle title={sources.length === 1 ? 'source' : 'sources'} />,
    [sources.length],
  );

  const handleDismiss = useCallback(() => {
    setExpandedSource(null);
    onDismiss();
  }, [onDismiss]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={MAX_SHEET_HEIGHT}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleComponent={SourceHandle}
      containerComponent={SheetContainer}
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
                { ...font.italic, fontSize: typography.sizeSm, color: colors.accent, fontStyle: 'italic' },
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
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  coverageHeading: {
    marginBottom: SPACING.md,
  },
});
