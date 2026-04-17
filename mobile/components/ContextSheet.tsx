import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../constants/theme';

// Timeline dot sits centered on the entry line. Sized so the marker reads as
// a station on small screens without crowding the body text.
const TIMELINE_DOT = 7;
const TIMELINE_LINE = 1.5;

import type { CountryData } from '../constants/country-data';
import { useTheme } from '../hooks/useTheme';
import { makeMarkdownStyles } from '../lib/markdown';
import { useOpenLink } from '../lib/open-link';
import type { ArticleSource, ContextBrief, TimelineEntry } from '../types';
import { renderBlocks } from './blocks';
import { SheetLayout } from './SheetLayout';
import { useMaxSheetHeight } from './SheetPrimitives';
import { SourceRow } from './SourceRow';

// Dev-only canonical brief. The __DEV__ ternary is a compile-time constant;
// Metro strips the require (and the module it points to) from release bundles.
const DEV_DEMO_BRIEF: ContextBrief | null = __DEV__
  ? (require('../lib/dev-context-demo') as typeof import('../lib/dev-context-demo')).DEV_DEMO_BRIEF
  : null;

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
  /** Chip taps inside LocationsBlock bubble up here; parent decides how to
   *  present the country sheet (typically `countrySheetRef.present()`). */
  onCountryPress?: (payload: {
    countryName: string;
    data: CountryData | null;
  }) => void;
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
  onCountryPress,
}: ContextSheetProps) {
  const { colors, font, typography, textStyles, sheetStyles } = useTheme();
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();

  // In dev, every "context" tap shows the canonical demo brief so the block
  // renderer can be evaluated without waiting for the pipeline. Sources still
  // come from the active article above.
  const effectiveBrief = __DEV__ ? DEV_DEMO_BRIEF : brief;
  const effectiveThreadLabel = __DEV__ ? effectiveBrief?.label : threadLabel;
  const effectiveLoading = __DEV__ ? false : loading;

  const timeline = effectiveBrief?.timeline ?? [];
  const hasSources = sources.length > 0;
  const hasThread = !!effectiveThreadLabel;

  const mdStyles = useMemo(
    () => makeMarkdownStyles(colors, font, typography),
    [colors, font, typography],
  );
  const openLink = useOpenLink();

  const spanningBlocks = effectiveBrief?.blocks ?? [];
  const hasSpanning = spanningBlocks.length > 0;
  const hasContent = effectiveBrief != null || hasSources || hasSpanning;

  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  const wasLoading = useRef(false);
  useEffect(() => {
    if (wasLoading.current && !effectiveLoading && effectiveBrief) {
      const count = effectiveBrief.timeline.length;
      AccessibilityInfo.announceForAccessibility(
        `Context loaded, ${count} entr${count === 1 ? 'y' : 'ies'}`,
      );
    }
    wasLoading.current = effectiveLoading;
  }, [effectiveLoading, effectiveBrief]);

  const handleDismiss = useCallback(() => {
    setExpandedSource(null);
    onDismiss();
  }, [onDismiss]);

  const loadingSnap = useMemo(() => ['40%'], []);

  const briefSources = effectiveBrief?.sources;
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
            <Text style={[styles.eduHeading, textStyles.smallCapsXs]}>{entry.heading}</Text>
          )}
          <Text selectable style={[textStyles.body, styles.bodySpacing]}>
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
            style={[
              styles.entryYear,
              {
                ...font.semiBold,
                fontSize: typography.sizeXs,
                color: colors.accent,
                letterSpacing: typography.trackingCaps,
                fontVariant: ['oldstyle-nums'],
              },
            ]}
          >
            {entry.year}
          </Text>
          {entry.heading ? (
            <Text
              selectable
              style={[
                styles.entryHeading,
                {
                  ...font.semiBold,
                  fontSize: typography.sizeBase,
                  lineHeight: typography.sizeBase * typography.leadingHeading,
                  color: colors.textEmphasis,
                },
              ]}
            >
              {entry.heading}
            </Text>
          ) : null}
          <Text selectable style={textStyles.body}>
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

        {/* ── Spanning (arc) blocks ── */}
        {hasSpanning && (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelContext, textStyles.smallCaps]}>
              arc
            </Text>
            {renderBlocks(spanningBlocks, {
              mdStyles,
              openLink,
              variant: 'article',
              sources: briefSources,
              onCountryPress,
            })}
          </>
        )}

        {/* ── Context timeline ── */}
        {hasThread && (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelContext, textStyles.smallCaps]}>
              context
            </Text>
            {effectiveLoading && !effectiveBrief && (
              <ActivityIndicator color={colors.accent} style={styles.loader} />
            )}
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
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
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
