import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { ContextBrief, TimelineEntry } from '../types';
import { SheetHandle } from './SheetHandle';
import { SheetContainer, useMaxSheetHeight } from './SheetPrimitives';

interface ContextSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  brief: ContextBrief | null;
  loading: boolean;
  threadLabel?: string;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
}

export const ContextSheet = memo(function ContextSheet({
  sheetRef,
  brief,
  loading,
  threadLabel,
  bottomInset,
  renderBackdrop,
  onDismiss,
}: ContextSheetProps) {
  const { colors, font, typography, textStyles, sheetStyles } = useTheme();
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();
  const label = brief?.label ?? threadLabel;
  const timeline = brief?.timeline ?? [];
  const isEdu = brief?.type === 'edu';
  const ContextHandle = useCallback(() => <SheetHandle title={label} />, [label]);
  // While loading, use a fixed snap point so the sheet doesn't shrink to spinner size
  // then jump when content arrives. Once loaded, dynamic sizing takes over.
  const loadingSnap = useMemo(() => ['40%'], []);

  const renderTimelineEntry = (entry: TimelineEntry, i: number, arr: TimelineEntry[]) => {
    if (!entry.year) {
      return (
        <Text key={i} selectable style={[styles.bodyText, textStyles.body, styles.bodySpacing]}>
          {entry.body}
        </Text>
      );
    }
    const nextHasYear = arr[i + 1]?.year != null;
    return (
      <View
        key={i}
        style={[styles.entry, nextHasYear && [styles.entryLine, { borderLeftColor: colors.rule }]]}
      >
        <View
          style={[styles.dot, { top: typography.sizeXs * 0.55, backgroundColor: colors.accent }]}
        />
        <View style={styles.entryContent}>
          <Text
            selectable
            style={[
              styles.entryYear,
              {
                fontFamily: font.semiBold,
                fontSize: typography.sizeXs,
                color: colors.accent,
                letterSpacing: typography.trackingCaps,
              },
            ]}
          >
            {entry.year}
          </Text>
          <Text selectable style={[styles.bodyText, textStyles.body]}>
            {entry.body}
          </Text>
        </View>
      </View>
    );
  };

  const renderEduEntry = (entry: TimelineEntry, i: number) => {
    return (
      <View key={i}>
        {entry.heading && (
          <Text
            selectable
            style={[
              styles.sectionHeading,
              textStyles.smallCapsXs,
              { color: colors.accent, fontFamily: font.semiBold },
            ]}
          >
            {entry.heading}
          </Text>
        )}
        <Text selectable style={[styles.bodyText, textStyles.body, styles.bodySpacing]}>
          {entry.body}
        </Text>
      </View>
    );
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      {...(brief
        ? { enableDynamicSizing: true, maxDynamicContentSize: MAX_SHEET_HEIGHT }
        : { snapPoints: loadingSnap, enableDynamicSizing: false })}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleComponent={ContextHandle}
      containerComponent={SheetContainer}
      onDismiss={onDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {brief && !isEdu && (
          <Text style={[styles.meta, textStyles.smallCapsXs]}>
            {brief.articleCount} article{brief.articleCount === 1 ? '' : 's'} in this thread
          </Text>
        )}

        {loading && !brief && <ActivityIndicator color={colors.accent} style={styles.loader} />}

        {isEdu ? timeline.map(renderEduEntry) : timeline.map(renderTimelineEntry)}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  meta: {},
  loader: {
    marginTop: SPACING.lg,
  },
  entry: {
    flexDirection: 'row',
    paddingLeft: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  entryLine: {
    borderLeftWidth: LAYOUT.timelineLineWidth,
  },
  dot: {
    position: 'absolute',
    left: -(LAYOUT.timelineDot / 2) - LAYOUT.timelineLineWidth / 2,
    width: LAYOUT.timelineDot,
    height: LAYOUT.timelineDot,
    borderRadius: LAYOUT.timelineDot / 2,
  },
  entryContent: {
    flex: 1,
    paddingLeft: SPACING.sm,
  },
  entryYear: {
    marginBottom: SPACING.xs / 2,
  },
  bodyText: {},
  bodySpacing: {
    marginBottom: SPACING.sm,
  },
  sectionHeading: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
});
