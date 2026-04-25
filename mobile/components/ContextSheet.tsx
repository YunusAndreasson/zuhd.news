import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../constants/theme';

const TIMELINE_DOT = 7;
const TIMELINE_LINE = 1.5;

import type { CountryData } from '@shared/countries/country-data';
import type { ContextBrief, TimelineEntry } from '@shared/types';
import { useTheme } from '../hooks/useTheme';
import { makeMarkdownStyles } from '../lib/markdown';
import { useOpenLink } from '../lib/open-link';
import { renderBlocks } from './blocks';
import { Text } from './primitives';
import { SheetLayout } from './SheetLayout';
import { useMaxSheetHeight } from './SheetPrimitives';

interface ContextSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  brief: ContextBrief | null;
  loading: boolean;
  threadLabel?: string;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
  onCountryPress?: (payload: { countryName: string; data: CountryData | null }) => void;
}

export const ContextSheet = memo(function ContextSheet({
  sheetRef,
  brief,
  loading,
  threadLabel,
  bottomInset,
  renderBackdrop,
  onDismiss,
  onCountryPress,
}: ContextSheetProps) {
  const { colors, font, typography, sheetStyles } = useTheme();
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();

  const timeline = brief?.timeline ?? [];
  // Only show the big title for genuine multi-article threads. For single-
  // article edu briefs the `threadLabel` upstream carries is just the
  // article's own title — re-rendering it on top of the article page's
  // title is redundant and reads as a confusing duplicate.
  const isMultiArticleThread =
    brief != null && brief.type !== 'edu' && (brief.articleCount ?? 1) > 1;
  const hasThread = !!threadLabel && isMultiArticleThread;

  const mdStyles = useMemo(
    () => makeMarkdownStyles(colors, font, typography),
    [colors, font, typography],
  );
  const openLink = useOpenLink();

  const spanningBlocks = brief?.blocks ?? [];
  const hasSpanning = spanningBlocks.length > 0;
  const hasContent = brief != null || hasSpanning;

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

  const loadingSnap = useMemo(() => ['40%'], []);

  const briefSources = brief?.sources;
  const renderTimelineEntry = (entry: TimelineEntry, i: number, arr: TimelineEntry[]) => {
    const entryBlocks = entry.blocks ?? [];
    const hasBlocks = entryBlocks.length > 0;
    const blocksNode = hasBlocks ? (
      <View style={styles.entryBlocks}>
        {renderBlocks(entryBlocks, {
          mdStyles,
          openLink,
          variant: 'context',
          sources: briefSources,
          onCountryPress,
        })}
      </View>
    ) : null;

    if (!entry.year) {
      return (
        <View key={i}>
          {entry.heading && (
            <Text variant="labelXs" style={styles.eduHeading}>
              {entry.heading}
            </Text>
          )}
          <Text selectable variant="body" style={styles.bodySpacing}>
            {entry.body}
          </Text>
          {blocksNode}
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
            variant="labelXs"
            tone="accent"
            style={[styles.entryYear, styles.yearNum]}
          >
            {entry.year}
          </Text>
          {entry.heading ? (
            <Text
              selectable
              variant="bodyEmphasis"
              tone="emphasis"
              style={[
                styles.entryHeading,
                { lineHeight: typography.sizeBase * typography.leadingHeading },
              ]}
            >
              {entry.heading}
            </Text>
          ) : null}
          <Text selectable variant="body">
            {entry.body}
          </Text>
          {blocksNode}
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
      onDismiss={onDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.xxl }]}
      >
        {hasThread && (
          <Text selectable variant="title" tone="emphasis" style={[styles.threadTitle, font.bold]}>
            {threadLabel}
          </Text>
        )}

        {loading && !brief && hasThread && (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        )}

        {hasSpanning &&
          renderBlocks(spanningBlocks, {
            mdStyles,
            openLink,
            variant: 'article',
            sources: briefSources,
            onCountryPress,
          })}

        {timeline.length > 0 && (
          <View style={hasSpanning ? styles.timelineAfterArc : undefined}>
            {timeline.map((entry, i, arr) => (
              <Animated.View
                key={i}
                entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(i))}
              >
                {renderTimelineEntry(entry, i, arr)}
              </Animated.View>
            ))}
          </View>
        )}
      </BottomSheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  threadTitle: {
    marginBottom: SPACING.lg,
  },
  timelineAfterArc: {
    marginTop: SPACING.md,
  },
  loader: {
    marginTop: SPACING.lg,
  },
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
  yearNum: {
    fontVariant: ['oldstyle-nums'],
  },
  entryHeading: {
    marginBottom: SPACING.xs,
  },
  bodySpacing: {
    marginBottom: SPACING.sm,
  },
  eduHeading: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  entryBlocks: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
});
