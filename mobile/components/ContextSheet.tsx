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
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import { makeMarkdownStyles } from '../lib/markdown';
import { useOpenLink } from '../lib/open-link';
import { renderBlocks } from './blocks';
import { Text } from './primitives';
import { SheetLayout } from './SheetLayout';

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
  const snapProps = useSheetSnaps(false);

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
        <View key={i} style={styles.eduEntry}>
          {entry.heading && (
            <Text variant="labelSm" style={styles.eduHeading}>
              {entry.heading}
            </Text>
          )}
          <Text selectable variant="body">
            {entry.body}
          </Text>
          {blocksNode}
        </View>
      );
    }
    const nextHasYear = arr[i + 1]?.year != null;
    // Vertically center the dot on the year text's optical midline. labelSm
    // sits at sizeSm × leadingBody; the cap-height midpoint is roughly
    // 0.42 × line-height for Source Sans 3 small-caps (slightly above the
    // geometric midline because of the smallcaps-cap construction).
    const yearLineHeight = typography.sizeSm * typography.leadingBody;
    const dotTop = yearLineHeight * 0.42 - TIMELINE_DOT / 2;
    return (
      <View
        key={i}
        style={[styles.entry, nextHasYear && [styles.entryLine, { borderLeftColor: colors.rule }]]}
      >
        {/* Closure: the absence of a left-border on the last year entry,
            combined with the dot still being present, naturally signals
            "the chronology stops here." No explicit terminus tick needed. */}
        <View style={[styles.dot, { top: dotTop, backgroundColor: colors.accent }]} />
        <View style={styles.entryContent}>
          <Text
            selectable
            variant="labelSm"
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
      {...(hasContent ? snapProps : { snapPoints: loadingSnap, enableDynamicSizing: false })}
      renderBackdrop={renderBackdrop}
      onDismiss={onDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {hasThread && (
          <>
            <Text
              selectable
              variant="title"
              tone="emphasis"
              style={[styles.threadTitle, font.bold]}
            >
              {threadLabel}
            </Text>
            {/* Title rule — a faint hairline beneath the multi-article title.
                Acts as a gestalt boundary between "what this brief covers"
                and the brief's content, similar to the rule beneath a
                masthead. */}
            <View style={[styles.titleRule, { backgroundColor: colors.rule }]} />
          </>
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

        {/* Spanning blocks → timeline transition. A centered hairline with
            generous vertical air signals "the overview is complete; the
            chronology begins." Only renders when both sides are present. */}
        {hasSpanning && timeline.length > 0 && (
          <View style={[styles.sectionDivider, { backgroundColor: colors.rule }]} />
        )}

        {timeline.length > 0 && (
          <View>
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
    marginBottom: SPACING.sm,
  },
  titleRule: {
    height: StyleSheet.hairlineWidth,
    marginBottom: SPACING.lg,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACING.lg,
    // Pulled in modestly on both sides so the divider reads as an editorial
    // beat, not a full-width separator. The eye registers it as "pause" —
    // similar to the centered three-dot section break in long-form essays.
    marginHorizontal: SPACING.lg,
  },
  loader: {
    marginTop: SPACING.lg,
  },
  entry: {
    flexDirection: 'row',
    paddingLeft: SPACING.sm,
    // Generous bottom padding so each timeline beat reads as a discrete
    // chapter; previously md (16) made consecutive entries blur together.
    paddingBottom: SPACING.lg,
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
    paddingLeft: SPACING.md,
  },
  entryYear: {
    marginBottom: SPACING.xs,
  },
  yearNum: {
    // Lining-tabular figures for chronology markers. Lining (default — no
    // `oldstyle-nums`) puts every digit at cap-height, matching the
    // small-cap letterform height around them so "1948" reads as a clean
    // date stamp rather than wavy body-text numerals. Tabular gives every
    // digit the same advance, so stacked years column-align down the
    // timeline ("1948" / "1967" / "2003" line up digit-by-digit) —
    // reinforcing the chronological structure. Standard reference-book
    // convention for years in tables.
    fontVariant: ['tabular-nums'],
  },
  entryHeading: {
    // Tight to body — heading + body read as a single bound unit, matching
    // the "proximity = grouping" gestalt principle. The chapter break lives
    // at entry.paddingBottom, not between heading and body.
    marginBottom: SPACING.xxs,
  },
  eduEntry: {
    paddingBottom: SPACING.lg,
  },
  eduHeading: {
    marginBottom: SPACING.xs,
  },
  entryBlocks: {
    marginTop: SPACING.md,
  },
});
