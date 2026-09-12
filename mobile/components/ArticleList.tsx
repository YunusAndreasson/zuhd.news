import type { Entity } from '@shared/types';
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
import type { StoryOdds } from '../lib/predictions';
import { maybeRequestReview } from '../lib/store-review';
import { ArticlePage } from './ArticlePage';
import { EmptyState } from './EmptyState';
import type { MiniGlobeRef, TapResult } from './globe/MiniGlobe';

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
  viewportHeight: number;
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
  /** A finger has started dragging the pager. The screen uses it to hand the
   *  globe's camera back to the scroll position after a selection — or the
   *  flight that opened the reader — took it. A drag, not a scroll: a
   *  programmatic jump must never reclaim the camera on the reader's behalf. */
  onDragStart?: () => void;
  /** slug → the prediction market the desk tied to that story. */
  oddsBySlug?: ReadonlyMap<string, StoryOdds>;
  onOddsPress?: (odds: StoryOdds) => void;
  /** How far through the column the reader is, 0–1. The section rail used to
   *  draw this as a fill under the active tab; the reader draws its own line
   *  now that there is no rail. */
  progressSV: SharedValue<number>;
  /**
   * The one globe, owned by the screen.
   *
   * `ArticleList` used to render `MiniGlobe` itself, which was right while the
   * globe belonged to the news column. It belongs to the screen now — the map
   * and the reader are two layers over the same canvas, which is why opening
   * a story does not cut to a second earth — so the list receives the ref it
   * needs for hit-testing rather than owning the component.
   */
  globeRef?: React.RefObject<MiniGlobeRef | null>;
  /** Published to the globe's camera. Owned by the screen; see `useScrollState`. */
  scrollY: SharedValue<number>;
  tick?: number;
  ref?: React.Ref<ArticleListRef>;
}

export const ArticleList = memo(function ArticleList({
  articles,
  viewportHeight,
  lastSeenAt,
  onCountryPress,
  onBookmarkPress,
  onSourcesPress,
  onTimeAgoPress,
  onEntityPress,
  resolvableEntityIds,
  onArticleChange,
  onReadingScrollStart,
  onDragStart,
  oddsBySlug,
  onOddsPress,
  onRefresh,
  onEndReached,
  onCaughtUp,
  progressSV,
  globeRef,
  scrollY: scrollYProp,
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
  // Already ordered newest-first by `orderNewsRiver`, across all categories.
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
  } = useScrollState(scrollYProp);

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
  /** Set for exactly one settle after a programmatic jump. A jump is the
   *  screen opening a story, not the reader turning a page — and the first
   *  recorded snap is what retires the swipe lesson, so counting a tap on a
   *  row as a swipe would teach the reader nothing and mark it learned. */
  const jumpingRef = useRef(false);
  const listRef = useAnimatedRef<Animated.FlatList<RiverArticle>>();
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
      if (jumpingRef.current) {
        // No haptic, no review prompt, no onboarding snap: nothing here was
        // the reader's gesture.
        jumpingRef.current = false;
        setCurrentIndex(idx);
        return;
      }
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

  const handleBeginDrag = useCallback(
    (...args: Parameters<typeof handlePagerBeginDrag>) => {
      onDragStart?.();
      handlePagerBeginDrag(...args);
    },
    [handlePagerBeginDrag, onDragStart],
  );

  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      overscrollFired.set(false);
      resetToTop();
      setResetScrollKey((key) => key + 1);
    },
    scrollToSlug: (slug: string) => {
      const idx = sortedArticles.findIndex((a) => a.slug === slug);
      if (idx >= 0) {
        // A jump, not an animated scroll. This used to animate, which was
        // right when it moved a visible column a page or two; it now opens
        // the reader onto any of forty stories, and an animated scroll to the
        // thirtieth sends the globe's camera through all twenty-nine datelines
        // in between.
        const target = idx * itemHeight;
        // Only arm the suppression if the list will actually move — a jump to
        // the page already showing emits no scroll, no settle ever consumes
        // the flag, and the reader's *next* real swipe would be swallowed.
        if (Math.abs(scrollY.value - target) > 0.5) jumpingRef.current = true;
        listRef.current?.scrollToOffset({ offset: target, animated: false });
        setCurrentIndex(idx);
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
      progressSV.value = progress;

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
        odds={oddsBySlug?.get(item.slug) ?? null}
        onOddsPress={onOddsPress}
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
      // A ref object from the screen, stable for the app's lifetime — listed
      // because biome cannot prove that across a prop boundary, and a
      // dependency that never changes costs nothing.
      globeRef,
      oddsBySlug,
      onOddsPress,
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
        onScrollBeginDrag={handleBeginDrag}
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
