import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { ArticleSource, ContextBrief, TimelineEntry } from '../types';
import { SheetHandle } from './SheetHandle';
import { SheetContainer, useMaxSheetHeight } from './SheetPrimitives';
import { SourceRow } from './SourceRow';

const MoreHandle = () => <SheetHandle title="more" />;

// ---------------------------------------------------------------------------
// Main sheet
// ---------------------------------------------------------------------------

interface ContextSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  sources: ArticleSource[];
  eventCoverage: number | null;
  brief: ContextBrief | null;
  loading: boolean;
  threadLabel?: string;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
}

export const ContextSheet = memo(function ContextSheet({
  sheetRef,
  sources,
  eventCoverage,
  brief,
  loading,
  threadLabel,
  bottomInset,
  renderBackdrop,
  onDismiss,
}: ContextSheetProps) {
  const { colors, font, typography, textStyles, sheetStyles } = useTheme();
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();
  const timeline = brief?.timeline ?? [];
  const hasSources = sources.length > 0;
  const hasThread = !!threadLabel;
  const hasContent = brief != null || hasSources;

  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  const wasLoading = useRef(false);
  useEffect(() => {
    if (wasLoading.current && !loading && brief) {
      const count = brief.timeline.length;
      AccessibilityInfo.announceForAccessibility(
        `Context loaded, ${count} entr${count === 1 ? 'y' : 'ies'}`,
      );
    }
    wasLoading.current = loading;
  }, [loading, brief]);

  const handleDismiss = useCallback(() => {
    setExpandedSource(null);
    onDismiss();
  }, [onDismiss]);

  const loadingSnap = useMemo(() => ['40%'], []);

  const renderTimelineEntry = (entry: TimelineEntry, i: number, arr: TimelineEntry[]) => {
    if (!entry.year) {
      return (
        <View key={i}>
          {entry.heading && (
            <Text style={[styles.eduHeading, textStyles.smallCaps]}>{entry.heading}</Text>
          )}
          <Text selectable style={[styles.bodyText, textStyles.body, styles.bodySpacing]}>
            {entry.body}
          </Text>
        </View>
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
                ...font.semiBold,
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

  return (
    <BottomSheetModal
      ref={sheetRef}
      {...(hasContent
        ? { enableDynamicSizing: true, maxDynamicContentSize: MAX_SHEET_HEIGHT }
        : { snapPoints: loadingSnap, enableDynamicSizing: false })}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleComponent={MoreHandle}
      containerComponent={SheetContainer}
      onDismiss={handleDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.xxl }]}
      >
        {/* ── Sources ── */}
        {hasSources && (
          <>
            <Text style={[styles.sectionLabel, textStyles.smallCapsXs]}>
              {sources.length === 1 ? 'source' : 'sources'}
            </Text>
            {eventCoverage != null && eventCoverage > sources.length && (
              <Text style={[styles.sectionSubtitle, textStyles.sectionHeading]}>
                {eventCoverage}+ sources covering this story
              </Text>
            )}
            {sources.map((s, i) => (
              <SourceRow
                key={s.name}
                source={s}
                isExpanded={expandedSource === i}
                onPress={() => setExpandedSource(expandedSource === i ? null : i)}
              />
            ))}
          </>
        )}

        {/* ── Context ── */}
        {hasThread && (
          <>
            {hasSources && (
              <View style={[styles.sectionDivider, { backgroundColor: colors.rule }]} />
            )}
            <Text style={[styles.sectionLabel, textStyles.smallCapsXs]}>context</Text>
            <Text style={[styles.contextHeading, textStyles.sectionHeading]} numberOfLines={2}>
              {threadLabel}
            </Text>
            {loading && !brief && <ActivityIndicator color={colors.accent} style={styles.loader} />}
            {timeline.map(renderTimelineEntry)}
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  /* ── Sources ── */
  sectionLabel: {
    marginBottom: SPACING.sm,
  },
  sectionSubtitle: {
    marginBottom: SPACING.sm,
  },
  /* ── Context ── */
  contextHeading: {
    marginBottom: SPACING.md,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACING.lg,
  },
  loader: {
    marginTop: SPACING.lg,
  },
  /* ── Timeline ── */
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
    marginBottom: SPACING.xxs,
  },
  bodyText: {},
  bodySpacing: {
    marginBottom: SPACING.sm,
  },
  eduHeading: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
});
