import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../constants/theme';

// Timeline dot sits centered on the entry line — diameter 5 over a 1px line.
const TIMELINE_DOT = 5;
const TIMELINE_LINE = 1;

import { useTheme } from '../hooks/useTheme';
import type { ArticleSource, ContextBrief, TimelineEntry } from '../types';
import { SheetLayout } from './SheetLayout';
import { useMaxSheetHeight } from './SheetPrimitives';
import { SourceRow } from './SourceRow';

// ---------------------------------------------------------------------------
// Main sheet
// ---------------------------------------------------------------------------

interface ContextSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  sources: ArticleSource[];
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
            <Text style={[styles.eduHeading, textStyles.smallCapsXs]}>{entry.heading}</Text>
          )}
          <Text selectable style={[textStyles.body, styles.bodySpacing]}>
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
          <Text selectable style={textStyles.body}>
            {entry.body}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...(hasContent
        ? { enableDynamicSizing: true, maxDynamicContentSize: MAX_SHEET_HEIGHT }
        : { snapPoints: loadingSnap, enableDynamicSizing: false })}
      renderBackdrop={renderBackdrop}
      onDismiss={handleDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.xxl }]}
      >
        {/* ── Sources ── */}
        {hasSources && (
          <>
            <Text style={[styles.sectionLabel, textStyles.smallCaps]}>
              {sources.length === 1 ? 'source' : 'sources'}
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

        {/* ── Context ── */}
        {hasThread && (
          <>
            {hasSources && (
              <View style={[styles.sectionDivider, { backgroundColor: colors.rule }]} />
            )}
            <Text style={[styles.sectionLabel, styles.sectionLabelContext, textStyles.smallCaps]}>
              context
            </Text>
            {loading && !brief && <ActivityIndicator color={colors.accent} style={styles.loader} />}
            {timeline.map((entry, i, arr) => (
              <Animated.View
                key={i}
                entering={FadeInDown.duration(ANIMATION.normal).delay(
                  sources.length * ANIMATION.staggerStep + staggerDelay(i),
                )}
              >
                {renderTimelineEntry(entry, i, arr)}
              </Animated.View>
            ))}
          </>
        )}
      </BottomSheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  /* ── Sources ── */
  sectionLabel: {
    marginBottom: SPACING.sm,
  },
  /* ── Context ── */
  sectionLabelContext: {
    marginBottom: SPACING.md,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
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
    borderLeftWidth: TIMELINE_LINE,
  },
  dot: {
    position: 'absolute',
    left: -(TIMELINE_DOT / 2) - TIMELINE_LINE / 2,
    width: TIMELINE_DOT,
    height: TIMELINE_DOT,
    borderRadius: TIMELINE_DOT / 2,
  },
  entryContent: {
    flex: 1,
    paddingLeft: SPACING.sm,
  },
  entryYear: {
    marginBottom: SPACING.xxs,
  },
  bodySpacing: {
    marginBottom: SPACING.sm,
  },
  eduHeading: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
});
