import type { CountryData } from '@shared/countries/country-data';
import type { ContextBrief, TimelineEntry } from '@shared/types';
import { memo, useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { RADIUS, SPACING } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import { hapticImpact } from '../lib/haptics';
import { makeMarkdownStyles } from '../lib/markdown';
import { useOpenLink } from '../lib/open-link';
import { staggerEnter } from '../lib/stagger';
import { renderBlocks } from './blocks';
import { Markdown, Pressable, Stack, Text } from './primitives';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

const TIMELINE_DOT = 7;
const TIMELINE_LINE = 1.5;

interface ContextSheetProps extends BaseSheetProps {
  brief: ContextBrief | null;
  loading: boolean;
  error: boolean;
  threadLabel?: string;
  onRetry: () => void;
  onCountryPress?: (payload: { countryName: string; data: CountryData | null }) => void;
}

export const ContextSheet = memo(function ContextSheet({
  sheetRef,
  brief,
  loading,
  error,
  threadLabel,
  bottomInset,
  renderBackdrop,
  onDismiss,
  onRetry,
  onCountryPress,
}: ContextSheetProps) {
  const { colors, font, typography } = useTheme();
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
            <Text selectable variant="labelSm" style={styles.eduHeading}>
              {entry.heading}
            </Text>
          )}
          <Markdown selectable variant="body" openLink={openLink}>
            {entry.body}
          </Markdown>
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
          <Markdown selectable variant="body" openLink={openLink}>
            {entry.body}
          </Markdown>
          {blocksNode}
        </View>
      </View>
    );
  };

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      renderBackdrop={renderBackdrop}
      onDismiss={onDismiss}
    >
      <SheetScrollView bottomInset={bottomInset}>
        {hasThread && (
          <>
            {/* font.bold escape hatch: the brief title wants masthead weight
                (bolder than the semibold `title` variant). Only two call sites
                bold a title — here and ChokepointSheet's focal count — so a
                dedicated `titleEmphasis` variant isn't yet justified (<3). */}
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

        {loading && !brief && (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}

        {!loading && !brief && error && (
          <Stack align="center" gap="item" style={styles.errorBlock}>
            <Text variant="body" style={styles.errorText}>
              Couldn't load context.
            </Text>
            <Pressable
              onPress={() => {
                hapticImpact();
                onRetry();
              }}
              accessibilityRole="button"
              accessibilityLabel="Try again"
              style={[styles.retryPill, { backgroundColor: colors.pillBg }]}
            >
              <Text variant="labelXs" tone="emphasis">
                try again
              </Text>
            </Pressable>
          </Stack>
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
              <Animated.View key={i} entering={staggerEnter(i)}>
                {renderTimelineEntry(entry, i, arr)}
              </Animated.View>
            ))}
          </View>
        )}
      </SheetScrollView>
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
  loaderWrap: {
    // Min-height anchors the sheet's dynamic sizing so a loading state
    // doesn't snap to a tiny ~50pt strip and then jump up when content
    // arrives. ~30% of a typical phone height — enough that the user
    // visually registers "something is being prepared here," matching the
    // size budget the loaded brief will land near.
    minHeight: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBlock: {
    marginTop: SPACING.xl,
  },
  errorText: {
    textAlign: 'center',
  },
  retryPill: {
    // Vertical padding lifted from sm→md so the pill clears the 44pt iOS
    // tap-target floor. labelXs at sizeXs (11pt) × leadingBody is ~15pt
    // of glyph height; sm (8) padding put the pill at ~31pt which fails
    // Fitts's Law for the only interactive element in the error state.
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.floating,
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
