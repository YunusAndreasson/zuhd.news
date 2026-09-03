import { COUNTRY_DATA } from '@shared/countries/country-data';
import { displayNameFromCode } from '@shared/countries/iso';
import type { Entity } from '@shared/types';
import { memo, useCallback, useMemo } from 'react';
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
} from 'react-native-reanimated';
import { SPACING } from '../constants/theme';
import { useInnerScrollReporter } from '../hooks/useInnerScrollReporter';
import { useTheme } from '../hooks/useTheme';
import { articleTime, computeFontScale, formatTimeAgo } from '../lib/article-utils';
import { hapticImpact, hapticTick } from '../lib/haptics';
import { COUNTRY_URL_SCHEME, makeMarkdownStyles, renderSentences } from '../lib/markdown';
import type { RiverArticle } from '../lib/news-order';
import { useOpenLink } from '../lib/open-link';
import type { MiniGlobeRef, TapResult } from './globe/MiniGlobe';
import { InnerEdgeGesture } from './InnerEdgeGesture';
import { OverflowEndCue } from './OverflowEndCue';
import { Text } from './primitives';

// Title's distance from the container top. Smaller than the prior 32px gap
// so the headline sits closer to the SectionBar; the article backdrop
// gradient (rendered once in ArticleList) handles the top map-bleed.
const CONTENT_PADDING_TOP = 18;

// Reader-only text scale. Bumps the article-page title and body ~4% so the
// reader feels a touch more relaxed than the rest of the app, paired with
// the slightly tighter `SPACING.articlePadding` to widen the column. The
// scale lives local because it's a per-surface tuning; the padding lives
// in `SPACING` so `SectionBar` can mirror it.
const READER_TEXT_SCALE = 1.04;

interface ArticlePageProps {
  article: RiverArticle;
  itemHeight: number;
  index: number;
  scrollY: SharedValue<number>;
  onBookmarkPress?: (article: RiverArticle) => void;
  onSourcesPress?: (article: RiverArticle) => void;
  onTimeAgoPress?: (article: RiverArticle) => void;
  /** Tap handler for in-body entity mentions (oil, Hormuz, Bitcoin…). */
  onEntityPress?: (entity: Entity) => void;
  /** Indicator ids the app can actually open a sheet for, from the live
   *  trends catalog. See `tappableEntities` below for why this is a prop and
   *  not something the renderer works out for itself. */
  resolvableEntityIds?: ReadonlySet<string>;
  showEarlierDivider?: boolean;
  globeRef?: React.RefObject<MiniGlobeRef | null>;
  globeYOffset?: React.RefObject<number>;
  onCountryPress?: (result: TapResult) => void;
  /** Reported when this page's own scroll ate part of a swipe, so the pager
   *  can tell an inherited gesture tail from a real page turn. */
  onInnerScrollConsumed?: (index: number) => void;
  /** Nested same-axis scrolling can keep an edge swipe inside the child.
   *  This explicit request makes the next independent swipe page reliably. */
  onInnerEdgePage?: (index: number, direction: -1 | 1) => void;
  onReadingScrollStart?: () => void;
  hasNext?: boolean;
  tick?: number;
}

function GlobeTapZone({
  globeRef,
  globeYOffset,
  onTap,
  impact,
}: {
  globeRef?: React.RefObject<MiniGlobeRef | null>;
  globeYOffset?: React.RefObject<number>;
  onTap?: (result: TapResult) => void;
  impact: () => void;
}) {
  const handleTap = useCallback(
    (e: GestureResponderEvent) => {
      const yOff = globeYOffset?.current ?? 0;
      const tapX = e.nativeEvent.pageX;
      const tapY = e.nativeEvent.pageY - yOff;
      const result = globeRef?.current?.hitTest(tapX, tapY);
      if (!result) return;
      globeRef?.current?.showPulse(tapX, tapY);
      impact();
      onTap?.(result);
    },
    [impact, globeRef, globeYOffset, onTap],
  );

  // The hit-test relies on the precise tap coordinates, which screen-reader
  // activations can't supply (VoiceOver/TalkBack fire at the element's
  // geometric centre). Hide the zone from the a11y tree so reader users
  // aren't sent to a "lottery country" sheet; inline country/entity links
  // in prose remain the non-spatial path to the same sheets.
  return (
    <Pressable
      style={styles.globeTapZone}
      onPress={handleTap}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export const ArticlePage = memo(function ArticlePage({
  article,
  itemHeight,
  index,
  scrollY,
  onBookmarkPress,
  onSourcesPress,
  onTimeAgoPress,
  onEntityPress,
  resolvableEntityIds,
  showEarlierDivider,
  globeRef,
  globeYOffset,
  onCountryPress,
  onInnerScrollConsumed,
  onInnerEdgePage,
  onReadingScrollStart,
  hasNext = false,
  tick: _tick,
}: ArticlePageProps) {
  const { colors, font, typography } = useTheme();
  const timeAgo = formatTimeAgo(articleTime(article));
  const pageStart = index * itemHeight;
  const reduceMotion = useReducedMotion();

  const offset = useDerivedValue(() => {
    'worklet';
    if (index === 0 && scrollY.value <= 0) return 0;
    return scrollY.value - pageStart;
  });

  const fadeStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1 };
    const off = offset.value;

    const opacity = interpolate(
      off,
      [-itemHeight, 0, itemHeight * 0.4],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );

    const translateY = interpolate(
      off,
      [-itemHeight * 0.3, 0, itemHeight * 0.4],
      [14, 0, -6],
      Extrapolation.CLAMP,
    );

    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  // The kicker names the desk, and — only when the ledger actually holds more
  // than one report on the same story — how long that story has been running.
  //
  // The guard is the whole point. Every article carries `threadDay` and
  // `threadArc`, and 38 of today's 40 carry them with an article count of one,
  // where "developing, day 13" would be a claim the data does not support.
  // A thread is worth mentioning when there is a thread.
  const kicker = useMemo(() => {
    const count = article.threadArticleCount ?? 0;
    if (count < 2) return article.category;
    const arc = article.threadArc ?? 'developing';
    const day = article.threadDay;
    const run = day && day > 1 ? `${arc}, day ${day}` : arc;
    return `${article.category} · ${run} · ${count} reports`;
  }, [article.category, article.threadArc, article.threadDay, article.threadArticleCount]);

  const fontScale = useMemo(
    () => computeFontScale(article.title, article.sentences),
    [article.title, article.sentences],
  );

  // Reader scale always applies — for short articles (fontScale=1) it lifts
  // the body from sizeBase to a slightly larger reader size; for long
  // articles (fontScale<1) it partially counteracts the auto-shrink so
  // readability stays comfortable.
  const readerScale = fontScale * READER_TEXT_SCALE;
  const bodyFontSize = Math.round(typography.sizeBase * readerScale);

  const mdStyles = useMemo(
    () => makeMarkdownStyles(colors, font, typography),
    [colors, font, typography],
  );

  /**
   * Only the mentions that lead somewhere.
   *
   * An entity run is accent-coloured prose, and the app teaches readers that
   * an accent-coloured word opens a sheet. A mention whose indicator is not in
   * the catalog would keep the colour and do nothing, which is the one
   * outcome `handleEntityPress` in `app/index.tsx` already refuses to produce
   * — this makes the affordance itself honest rather than the tap.
   *
   * The filter is here rather than in the build because the app's catalog is
   * the live `trends.json` it downloads on launch, which is a fresher and
   * sometimes different set from the snapshot the site build read. Chokepoint
   * entities (`cp:hormuz`) legitimately fall out here: they have pages on the
   * web and no indicator in the app's catalog.
   */
  const tappableEntities = useMemo(() => {
    const all = article.entities;
    if (!all?.length) return undefined;
    if (!resolvableEntityIds) return undefined;
    const usable = all.filter((e) => resolvableEntityIds.has(e.indicatorId));
    return usable.length > 0 ? usable : undefined;
  }, [article.entities, resolvableEntityIds]);

  const rawOpenLink = useOpenLink();
  // Intercept `country:XX` markdown links and dispatch them through the same
  // TapResult-shaped callback that the globe's hit-tester uses, so the
  // existing CountrySheet plumbing in app/index.tsx opens without a new
  // prop chain. Anything else (http, mailto…) falls through to the browser.
  const openLink = useCallback(
    (url: string) => {
      if (url.startsWith(COUNTRY_URL_SCHEME)) {
        const cc = url.slice(COUNTRY_URL_SCHEME.length).toUpperCase();
        const countryName = displayNameFromCode(cc);
        if (!countryName || !onCountryPress) return;
        const data = COUNTRY_DATA[countryName] ?? null;
        hapticTick();
        onCountryPress({ countryName, location: null, localTime: null, data });
        return;
      }
      rawOpenLink(url);
    },
    [rawOpenLink, onCountryPress],
  );

  const handleSourcesPress = useCallback(() => {
    onSourcesPress?.(article);
  }, [article, onSourcesPress]);

  const handleTimeAgoPress = useCallback(() => {
    onTimeAgoPress?.(article);
  }, [article, onTimeAgoPress]);

  const sourceCount = article.sources.length;
  const body = useMemo(
    () =>
      renderSentences(
        article.sentences,
        mdStyles,
        typography,
        bodyFontSize,
        article.location,
        timeAgo,
        openLink,
        onTimeAgoPress ? handleTimeAgoPress : undefined,
        tappableEntities,
        onEntityPress,
      ),
    [
      article.sentences,
      article.location,
      tappableEntities,
      mdStyles,
      typography,
      bodyFontSize,
      timeAgo,
      openLink,
      onTimeAgoPress,
      handleTimeAgoPress,
      onEntityPress,
    ],
  );

  const handleLongPress = useCallback(() => {
    onBookmarkPress?.(article);
  }, [article, onBookmarkPress]);

  // Tap anywhere on the body opens the sources sheet. Inline tappables
  // (entity, country, time-ago, the explicit "sources" word) capture first,
  // so this only fires for blank prose. Disabled when there's nothing to show.
  const bodyTapEnabled = sourceCount > 0 && !!onSourcesPress;
  const bookmarkEnabled = !!onBookmarkPress;
  const isInteractive = bodyTapEnabled || bookmarkEnabled;

  // Spell out both gestures for assistive tech. Single-tap and long-press
  // are otherwise undiscoverable to screen-reader users (the gestures are
  // visual conventions). `accessibilityActions` registers the long-press
  // in the rotor / TalkBack local context menu so it can be invoked
  // explicitly even when the wrapper is treated as one focusable element.
  const accessibilityHint = bodyTapEnabled
    ? bookmarkEnabled
      ? 'Open sources. Long press to bookmark.'
      : 'Open sources'
    : bookmarkEnabled
      ? 'Long press to bookmark'
      : undefined;
  const accessibilityActions = useMemo(
    () => (bookmarkEnabled ? [{ name: 'longpress', label: 'Bookmark' }] : undefined),
    [bookmarkEnabled],
  );
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'longpress') {
        onBookmarkPress?.(article);
      }
    },
    [article, onBookmarkPress],
  );

  // Only prose may own a nested vertical gesture. The title and the globe/map
  // region stay outside this scroll view, so a swipe that begins there belongs
  // directly to the article pager. This avoids making the whole screen choose
  // between two same-axis scroll owners.
  const innerScroll = useInnerScrollReporter(
    index,
    onInnerScrollConsumed,
    onInnerEdgePage,
    onReadingScrollStart,
  );

  const pressableProps = {
    onPress: bodyTapEnabled ? handleSourcesPress : undefined,
    onLongPress: bookmarkEnabled ? handleLongPress : undefined,
    delayLongPress: 400,
    accessibilityRole: isInteractive ? ('button' as const) : undefined,
    accessibilityHint,
    accessibilityActions,
    onAccessibilityAction: bookmarkEnabled ? handleAccessibilityAction : undefined,
  };

  return (
    <View style={[styles.container, { height: itemHeight }]}>
      <GlobeTapZone
        globeRef={globeRef}
        globeYOffset={globeYOffset}
        onTap={onCountryPress}
        impact={hapticImpact}
      />

      <Animated.View style={[styles.contentLayout, fadeStyle]} pointerEvents="box-none">
        {showEarlierDivider && (
          <View
            style={styles.earlierBoundary}
            accessible
            accessibilityLabel="Caught up. Everything from here you have already seen."
          >
            <View style={styles.earlierDivider}>
              <View style={[styles.earlierLine, { backgroundColor: colors.rule }]} />
              <Text variant="labelSm" tone="secondary">
                {'caught up'}
              </Text>
              <View style={[styles.earlierLine, { backgroundColor: colors.rule }]} />
            </View>
            {/* The boundary used to be a rule and a two-word label you swiped
              straight past, while a toast said the same two words a beat
              earlier — the same fact in two places, which foundation.md
              forbids. The toast is gone; this line is what's left, and it
              says the thing the rule only implied. An app that refuses to be
              an infinite feed should be willing to tell the reader they can
              stop. */}
            {/* "from here", not "below": the divider is drawn at the top of the
              first already-seen article, so the page it sits on is itself one
              of them. */}
            <Text variant="caption" style={styles.earlierNote}>
              Everything from here you've already seen.
            </Text>
          </View>
        )}
        <Pressable {...pressableProps} testID="article-page-header">
          {/* The category used to be the tab you were standing on. The column
            is mixed now — ordered by how many newsrooms covered the event, not
            by desk — so the story has to name its own. A `labelXs` kicker,
            not a control: nothing here is tappable, and foundation.md's rule
            that information appears exactly once is why it is the only place
            the category is stated. */}
          <Text variant="labelXs" tone="secondary" style={styles.kicker}>
            {kicker}
          </Text>
          <Text
            variant="display"
            tone="emphasis"
            scale={readerScale}
            numberOfLines={3}
            style={styles.title}
          >
            {article.title}
          </Text>
        </Pressable>

        <View style={styles.textViewport} testID="article-text-region">
          <InnerEdgeGesture enabled={innerScroll.scrollable} gesture={innerScroll.edgeGesture}>
            <ScrollView
              style={styles.scrollFill}
              pointerEvents={innerScroll.scrollable ? 'auto' : 'box-none'}
              showsVerticalScrollIndicator={innerScroll.scrollable}
              scrollEnabled={innerScroll.scrollable}
              nestedScrollEnabled
              onLayout={innerScroll.onLayout}
              onContentSizeChange={innerScroll.onContentSizeChange}
              onScrollBeginDrag={innerScroll.onScrollBeginDrag}
              onScrollEndDrag={innerScroll.onScrollEndDrag}
              onScroll={innerScroll.onScroll}
              scrollEventThrottle={16}
            >
              <Pressable {...pressableProps}>{body}</Pressable>
              {innerScroll.scrollable && hasNext ? <OverflowEndCue /> : null}
            </ScrollView>
          </InnerEdgeGesture>
        </View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  // Bounds the prose ScrollView to its region so it scrolls rather than
  // growing and breaking the pager's uniform itemHeight.
  scrollFill: {
    flex: 1,
  },
  contentLayout: {
    flex: 1,
    paddingHorizontal: SPACING.articlePadding,
    paddingTop: CONTENT_PADDING_TOP,
    // Clear the BottomActionBar across all platforms. The bar's top edge
    // sits at `max(bottomInset, SPACING.sm) + ~24px pill height` from the
    // screen bottom; on Android with no inset that's only 32px, which the
    // previous SPACING.xl matched exactly (zero buffer). SPACING.xxl gives
    // ≥16px of breathing room everywhere and ~26px on devices with a home
    // indicator — enough to feel deliberate, not enough to waste viewport.
    paddingBottom: SPACING.xxl,
  },
  textViewport: {
    flex: 1,
    minHeight: 0,
  },
  // The "caught up" divider is the only place the app surfaces its
  // anti-doomscroll philosophy in pixels — the moment a reader hits the
  // articles they've already seen. Visual weight reflects that:
  //   • symmetric vertical breathing (was hugged to the title via a
  //     negative marginTop) so the moment has its own room
  //   • 1px rule (was hairlineWidth) so the line reads as a deliberate
  //     section break rather than a hairline divider
  //   • labelSm small caps (was labelXs) — one tier up so the milestone
  //     label carries through at glance distance without shouting
  earlierBoundary: {
    marginVertical: SPACING.lg,
  },
  earlierDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  earlierLine: {
    flex: 1,
    height: 1,
  },
  earlierNote: {
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  kicker: {
    marginBottom: SPACING.xxs,
  },
  title: {
    marginBottom: SPACING.md,
  },
  globeTapZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
});
