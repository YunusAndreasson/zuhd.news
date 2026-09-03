import type { Chokepoint, ConflictEvent, Entity, GdacsAlert, HeatmapPoint } from '@shared/types';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useScrollState } from '../hooks/useScrollState';
import { useTheme } from '../hooks/useTheme';
import { useVerticalPager, VERTICAL_PAGER_PROPS } from '../hooks/useVerticalPager';
import { hapticNotification, hapticTick } from '../lib/haptics';
import type { RiverArticle } from '../lib/news-order';
import { recordArticleSnap } from '../lib/onboarding-store';
import { maybeRequestReview } from '../lib/store-review';
import { ArticlePage } from './ArticlePage';
import { EmptyState } from './EmptyState';
import { MiniGlobe, type MiniGlobeRef, type TapResult } from './globe/MiniGlobe';

// Article backdrop gradient stops. Hoisted to the list container so a single
// gradient view is rendered per column — cells scroll through a fixed
// fade pattern rather than each cell carrying its own.
const BG_FADE_LOCATIONS: number[] = [0, 0.02, 0.14, 0.28, 0.48, 0.72, 1];
const articleKey = (article: RiverArticle) => article.slug;

export interface ArticleListRef {
  scrollToTop: () => void;
  scrollToSlug: (slug: string) => void;
}

interface ArticleListProps {
  /** The whole feed as one ordered column. Each article carries its real
   *  category, which the card shows as a kicker and the bookmark store files
   *  it under — neither has to infer it from which page you were on. */
  articles: RiverArticle[];
  heatmapPoints?: HeatmapPoint[];
  chokepoints?: Chokepoint[];
  gdacsAlerts?: GdacsAlert[];
  conflictEvents?: ConflictEvent[];
  viewportHeight: number;
  /** Slot this column owns in `progressesSV` — the horizontal axis carries
   *  sections now, and news is one of them rather than four of them. */
  sectionIndex: number;
  lastSeenAt: number;
  onRefresh: () => Promise<void>;
  onEndReached?: () => void;
  onCaughtUp?: () => void;
  onCountryPress?: (result: TapResult) => void;
  onBookmarkPress?: (article: RiverArticle) => void;
  onSourcesPress?: (article: RiverArticle) => void;
  onTimeAgoPress?: (article: RiverArticle) => void;
  onEntityPress?: (entity: Entity) => void;
  /** Indicator ids the entity sheet can actually open. Threaded through so
   *  `ArticlePage` can strip the mentions that would look tappable and
   *  do nothing. */
  resolvableEntityIds?: ReadonlySet<string>;
  onArticleChange?: (article: RiverArticle) => void;
  /** Clears transient teaching UI as soon as the reader starts moving content. */
  onReadingScrollStart?: () => void;
  progressesSV: SharedValue<number[]>;
  zoomClipOverride?: number | null;
  tick?: number;
  ref?: React.Ref<ArticleListRef>;
}

export const ArticleList = memo(function ArticleList({
  articles,
  heatmapPoints,
  chokepoints,
  gdacsAlerts,
  conflictEvents,
  viewportHeight,
  sectionIndex,
  lastSeenAt,
  onCountryPress,
  onBookmarkPress,
  onSourcesPress,
  onTimeAgoPress,
  onEntityPress,
  resolvableEntityIds,
  onArticleChange,
  onReadingScrollStart,
  onRefresh,
  onEndReached,
  onCaughtUp,
  progressesSV,
  zoomClipOverride,
  tick,
  ref,
}: ArticleListProps) {
  const { colors, bgAlpha } = useTheme();
  const insets = useSafeAreaInsets();
  // Backdrop stop colors for the Skia gradient below. Skia (not RN's
  // experimental_backgroundImage CSS gradient) is deliberate: the CSS
  // gradient rendered fine on Android but silently failed on iOS release
  // builds (RN 0.86 new-arch — the gradient layer races layout and pairs
  // badly with Reanimated updates on the same view; see reanimated #8297),
  // leaving the article column sitting naked on the map with no bg wash —
  // "grey articles" in both themes. Skia is the one gradient path this app
  // has proven on both platforms (the entire globe renders through it),
  // and it OTA-deploys since the native module is already in every build.
  const bgFadeColors = useMemo(
    () => [
      bgAlpha(0),
      bgAlpha(1),
      bgAlpha(1),
      bgAlpha(0.92),
      bgAlpha(0.65),
      bgAlpha(0.28),
      bgAlpha(0),
    ],
    [bgAlpha],
  );
  const { width: screenWidth } = useWindowDimensions();
  // Already ordered by `orderNewsRiver` before it got here — by how many
  // newsrooms covered the event, then by recency, then de-clumped so the top
  // of the column is not one category's wall. This component used to do its
  // own chronological sort with a breaking-story float inside each time
  // bucket; that logic moved into the ordering function, where it is a pure
  // function with tests rather than a memo that had to be invalidated by a
  // clock tick.
  const sortedArticles = articles;
  const articleCount = sortedArticles.length;
  const itemHeight = viewportHeight;
  const safeAreaFooter = useMemo(() => <View style={{ height: insets.bottom }} />, [insets.bottom]);
  const {
    scrollY,
    currentIndex,
    setCurrentIndex,
    overscrollFired,
    caughtUpFired,
    overscrollTimer,
  } = useScrollState();

  const bgFadeStyle = useAnimatedStyle(() => {
    'worklet';
    if (itemHeight === 0) return { opacity: 1 };
    const raw = scrollY.value / itemHeight;
    if (raw < 0 || raw > articleCount - 1) return { opacity: 1 };
    const fraction = raw % 1;
    const distanceFromSettled = Math.min(fraction, 1 - fraction); // 0 at rest, 0.5 mid-drag
    const opacity = interpolate(distanceFromSettled, [0, 0.4], [1, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const listRef = useAnimatedRef<Animated.FlatList<RiverArticle>>();
  const globeRef = useRef<MiniGlobeRef>(null);
  const containerRef = useRef<View>(null);
  const containerTopRef = useRef(0);
  const resetOverscroll = useCallback(() => {
    if (overscrollTimer.current) clearTimeout(overscrollTimer.current);
    overscrollTimer.current = setTimeout(() => {
      overscrollFired.set(false);
    }, 800);
  }, [overscrollFired, overscrollTimer]);
  const fireEndReached = useEffectEvent(() => {
    onEndReached?.();
  });
  // Bundled into one hop from the scroll worklet. As three separate
  // `scheduleOnRN` calls the haptic, the toast and the debounce reset were
  // three independent JS tasks, so the buzz could land a frame or more away
  // from the "Back to top" toast it is supposed to accompany.
  // `fireEndReached` is a `useEffectEvent` — stable by construction, and React
  // requires effect events stay out of dependency lists.
  const fireOverscroll = useCallback(() => {
    hapticNotification();
    fireEndReached();
    resetOverscroll();
  }, [resetOverscroll]);
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const [resetScrollKey, setResetScrollKey] = useState(0);

  const handleRefresh = useCallback(async () => {
    setLocalRefreshing(true);
    // Deliberately try/catch and NOT try/finally: React Compiler cannot lower a
    // finalizer ("BuildHIR::lowerStatement: Handle TryStatement with a
    // finalizer") and silently bails out of compiling this entire file when one
    // is present. Because the catch swallows, control always reaches the reset
    // below, so this is equivalent to the finally it replaces.
    try {
      await onRefresh();
      hapticNotification();
    } catch {
      // Nothing to report here: the injected `onRefresh`
      // (HomeScreen.handleRefresh) already catches and toasts its own failures.
    }
    setLocalRefreshing(false);
  }, [onRefresh]);

  // Keep the native refresh control referentially stable while the reader
  // pages through stories. Recreating this element on every `currentIndex`
  // update makes Android rebuild the ScrollView/VirtualizedList subtree even
  // though pull-to-refresh has not changed; the list can only pull past its
  // leading edge at index zero, so no index-dependent `enabled` prop is
  // necessary.
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={localRefreshing}
        onRefresh={handleRefresh}
        tintColor={colors.textSecondary}
        progressBackgroundColor={colors.bg}
        colors={[colors.textSecondary]}
      />
    ),
    [localRefreshing, handleRefresh, colors.textSecondary, colors.bg],
  );

  // Report current article to parent (initial + on snap/sort change)
  useEffect(() => {
    const article = sortedArticles[currentIndex];
    if (article) onArticleChange?.(article);
  }, [currentIndex, sortedArticles, onArticleChange]);

  // Find the boundary between new and previously seen articles
  const earlierIndex = useMemo(() => {
    if (lastSeenAt <= 0) return -1;
    // `addedAt`, deliberately — the one place in the app that still wants it.
    // `lastSeenAt` is a wall clock (`Date.now()` when the reader last looked),
    // so the question here is "did this arrive in the feed before then", which
    // is what mtime answers. `articleTime` answers how old the *news* is, and
    // would mark a three-day-old story published this morning as already seen.
    const idx = sortedArticles.findIndex((a) => a.addedAt <= lastSeenAt);
    return idx > 0 ? idx : -1;
  }, [sortedArticles, lastSeenAt]);

  const handleSnap = useCallback(
    (idx: number) => {
      if (earlierIndex > 0 && idx === earlierIndex - 1 && !caughtUpFired.current) {
        caughtUpFired.current = true;
        hapticNotification();
        onCaughtUp?.();
      } else {
        hapticTick();
      }
      setCurrentIndex(idx);
      maybeRequestReview();
      recordArticleSnap();
    },
    [earlierIndex, onCaughtUp, caughtUpFired, setCurrentIndex],
  );

  /**
   * Land on an article, always — including when the gesture was never this
   * list's own.
   *
   * An article that outgrows the page becomes a `ScrollView` (see
   * `ArticlePage`), and the tail of a scroll it did not need arrives here with
   * no touch-down and no fling, so native snapping never sees it. Shared with
   * `CardPager`, which has carried this correction since the card decks
   * shipped; the reader is where the bug was actually reported.
   */
  const {
    handlePagerBeginDrag,
    handleEndDrag,
    handleMomentumBegin,
    handleMomentumEnd,
    armSettleFromScroll,
    handleInnerScrollConsumed,
    getItemLayout,
    resetToTop,
  } = useVerticalPager({
    listRef,
    scrollY,
    itemHeight,
    count: articleCount,
    currentIndexRef,
    onSettled: handleSnap,
    onReadingScrollStart,
    items: sortedArticles,
    getItemKey: articleKey,
    onItemsReordered: setCurrentIndex,
    preserveAtTop: false,
  });

  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      overscrollFired.set(false);
      resetToTop();
      setResetScrollKey((key) => key + 1);
    },
    scrollToSlug: (slug: string) => {
      const idx = sortedArticles.findIndex((a) => a.slug === slug);
      if (idx >= 0) {
        listRef.current?.scrollToOffset({ offset: idx * itemHeight, animated: true });
      }
    },
  }));

  /** Throttle clock for the settle-arm hop below. Shared rather than a ref
   *  because only the UI thread reads or writes it. */
  const lastArmAt = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      scrollY.value = event.contentOffset.y;
      const total = Math.max((articleCount - 1) * itemHeight, 1);
      const progress = Math.max(0, Math.min(event.contentOffset.y / total, 1));
      progressesSV.modify((arr) => {
        'worklet';
        arr[sectionIndex] = progress;
        return arr;
      });

      // Detect overscroll past the last article
      const maxScroll = (articleCount - 1) * itemHeight;
      if (event.contentOffset.y > maxScroll + 15 && !overscrollFired.value) {
        overscrollFired.value = true;
        // Haptic + toast + bounce-back debounce reset, as one task.
        scheduleOnRN(fireOverscroll);
      }

      // Arm the settle from the scroll itself, not only from a drag ending.
      //
      // `onScrollEndDrag` cannot fire for the one arrival that needs
      // correcting most: an article taller than the page hands its leftover
      // overscroll to this list, so the list moves having never been touched.
      // No drag end, no momentum end, nothing to snap — and it parks between
      // two articles, one faded out and the next at half opacity, with no
      // gesture that recovers. Only when off-page, and at most ten times a
      // second: a hop per frame would put 60 JS tasks a second behind every
      // scroll.
      const off = event.contentOffset.y % itemHeight;
      const offPage = Math.min(off, itemHeight - off) > 1;
      const now = Date.now();
      if (offPage && now - lastArmAt.value > 100) {
        lastArmAt.value = now;
        scheduleOnRN(armSettleFromScroll);
      }
    },
  });

  const renderItem = useCallback(
    ({ item, index }: { item: RiverArticle; index: number }) => (
      <ArticlePage
        article={item}
        itemHeight={itemHeight}
        index={index}
        scrollY={scrollY}
        onBookmarkPress={onBookmarkPress}
        onSourcesPress={onSourcesPress}
        onTimeAgoPress={onTimeAgoPress}
        onEntityPress={onEntityPress}
        resolvableEntityIds={resolvableEntityIds}
        showEarlierDivider={index === earlierIndex}
        globeRef={globeRef}
        globeYOffset={containerTopRef}
        onCountryPress={onCountryPress}
        onInnerScrollConsumed={handleInnerScrollConsumed}
        onReadingScrollStart={onReadingScrollStart}
        hasNext={index < articleCount - 1}
        resetScrollKey={resetScrollKey}
        tick={tick}
      />
    ),
    [
      itemHeight,
      scrollY,
      onCountryPress,
      onBookmarkPress,
      onSourcesPress,
      onTimeAgoPress,
      onEntityPress,
      resolvableEntityIds,
      earlierIndex,
      handleInnerScrollConsumed,
      onReadingScrollStart,
      articleCount,
      tick,
      resetScrollKey,
    ],
  );

  if (sortedArticles.length === 0)
    return (
      <View style={{ height: viewportHeight }}>
        <EmptyState message="no articles yet" hint="New coverage arrives through the day" />
      </View>
    );

  return (
    <View
      ref={containerRef}
      style={styles.container}
      onLayout={() => {
        containerRef.current?.measureInWindow((_x, y) => {
          containerTopRef.current = y;
        });
      }}
    >
      <MiniGlobe
        ref={globeRef}
        articles={sortedArticles}
        heatmapPoints={heatmapPoints}
        chokepoints={chokepoints}
        gdacsAlerts={gdacsAlerts}
        conflictEvents={conflictEvents}
        scrollY={scrollY}
        itemHeight={itemHeight}
        width={screenWidth}
        height={viewportHeight}
        zoomClipOverride={zoomClipOverride}
        tick={tick}
      />
      {/* Single article backdrop fade — sits between MiniGlobe and the
          FlatList so cells scroll through a fixed fade pattern instead of
          each cell carrying its own. pointerEvents:none keeps the per-cell
          GlobeTapZone reachable through it. Scroll-driven opacity stays on
          the wrapper view (plain layer opacity, reliable everywhere); the
          gradient itself is a static Skia draw — see bgFadeColors above
          for why Skia rather than a CSS background. `dither` for the same
          reason as the globe gradients: a long alpha ramp over the dark bg
          quantizes into visible bands without it. */}
      <Animated.View style={[styles.bgFade, bgFadeStyle]} pointerEvents="none">
        <Canvas style={styles.bgFadeCanvas}>
          <Rect x={0} y={0} width={screenWidth} height={viewportHeight} dither>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, viewportHeight)}
              colors={bgFadeColors}
              positions={BG_FADE_LOCATIONS}
            />
          </Rect>
        </Canvas>
      </Animated.View>
      <Animated.FlatList
        ref={listRef}
        data={sortedArticles}
        extraData={tick}
        renderItem={renderItem}
        keyExtractor={articleKey}
        getItemLayout={getItemLayout}
        snapToInterval={itemHeight}
        {...VERTICAL_PAGER_PROPS}
        onScroll={scrollHandler}
        onScrollBeginDrag={handlePagerBeginDrag}
        onScrollEndDrag={handleEndDrag}
        onMomentumScrollBegin={handleMomentumBegin}
        onMomentumScrollEnd={handleMomentumEnd}
        // The next story is already in the initial/window buffer. Warm later
        // pages one at a time so Android does not mount two prose-heavy cells
        // in the same commit immediately after the reader's first swipe.
        maxToRenderPerBatch={1}
        ListFooterComponent={safeAreaFooter}
        refreshControl={refreshControl}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  bgFade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  bgFadeCanvas: { flex: 1 },
});
