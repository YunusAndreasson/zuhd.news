import type { GenocideSituation } from '@shared/genocide';
import type {
  Article,
  Chokepoint,
  ConflictEvent,
  Entity,
  GdacsAlert,
  HeatmapPoint,
  MarketExchange,
} from '@shared/types';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useScrollState } from '../hooks/useScrollState';
import { useTheme } from '../hooks/useTheme';
import { formatTimeAgo } from '../lib/article-utils';
import { hapticNotification, hapticTick } from '../lib/haptics';
import { recordArticleSnap } from '../lib/onboarding-store';
import { maybeRequestReview } from '../lib/store-review';
import { ArticlePage } from './ArticlePage';
import { EmptyState } from './EmptyState';
import { MiniGlobe, type MiniGlobeRef, type TapResult } from './globe/MiniGlobe';

const BREAKING_THRESHOLD = 100;

// Article backdrop gradient stops. Hoisted to the list container so a single
// gradient view is rendered per category — cells scroll through a fixed
// fade pattern rather than each cell carrying its own.
const BG_FADE_LOCATIONS: number[] = [0, 0.02, 0.14, 0.28, 0.48, 0.72, 1];

export interface ArticleListRef {
  scrollToTop: () => void;
  scrollToSlug: (slug: string) => void;
}

interface ArticleListProps {
  articles: Article[];
  heatmapPoints?: HeatmapPoint[];
  chokepoints?: Chokepoint[];
  gdacsAlerts?: GdacsAlert[];
  conflictEvents?: ConflictEvent[];
  exchanges?: MarketExchange[];
  genocideSituations?: GenocideSituation[];
  viewportHeight: number;
  catIndex: number;
  lastSeenAt: number;
  onRefresh: () => Promise<void>;
  onEndReached?: (catIndex: number) => void;
  onCaughtUp?: () => void;
  onCountryPress?: (result: TapResult) => void;
  onBookmarkPress?: (article: Article) => void;
  onSourcesPress?: (article: Article) => void;
  onTimeAgoPress?: (article: Article) => void;
  onEntityPress?: (entity: Entity) => void;
  onArticleChange?: (article: Article, catIndex: number) => void;
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
  exchanges,
  genocideSituations,
  viewportHeight,
  catIndex,
  lastSeenAt,
  onCountryPress,
  onBookmarkPress,
  onSourcesPress,
  onTimeAgoPress,
  onEntityPress,
  onArticleChange,
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
  // Chronological sort, but within the same time bucket (e.g. all "1h ago")
  // breaking stories (eventCoverage >= 100) float to top of their bucket.
  // Buckets depend on Date.now() — `tick` from useArticles invalidates the
  // memo on app-resume so crossing-bucket sort stays accurate.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is the intentional re-memo signal for the Date.now() buckets
  const sortedArticles = useMemo(() => {
    // Pre-bucket once so the comparator is pure (no Date.now() per comparison)
    const buckets = new Map<Article, string>();
    for (const a of articles) buckets.set(a, formatTimeAgo(a.addedAt));
    return [...articles].sort((a, b) => {
      if (buckets.get(a) === buckets.get(b)) {
        const aBreaking = (a.eventCoverage ?? 0) >= BREAKING_THRESHOLD ? 1 : 0;
        const bBreaking = (b.eventCoverage ?? 0) >= BREAKING_THRESHOLD ? 1 : 0;
        if (bBreaking !== aBreaking) return bBreaking - aBreaking;
      }
      return b.addedAt - a.addedAt;
    });
  }, [articles, tick]);
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
  const listRef = useAnimatedRef<Animated.FlatList<Article>>();
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
    onEndReached?.(catIndex);
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

  // Report current article to parent (initial + on snap/sort change)
  useEffect(() => {
    const article = sortedArticles[currentIndex];
    if (article) onArticleChange?.(article, catIndex);
  }, [currentIndex, sortedArticles, catIndex, onArticleChange]);

  // When the data array changes (resume refresh, prepended new articles, sort
  // re-bucketing), keep the user on the same slug. Without this, prepended
  // items shift the offset and the user's reading position silently changes
  // — which is what felt "jumpy" before. Runs in useLayoutEffect so the
  // scroll adjustment lands before paint with the new data.
  const prevSlugsRef = useRef<string[]>([]);
  useLayoutEffect(() => {
    const newSlugs = sortedArticles.map((a) => a.slug);
    const prevSlugs = prevSlugsRef.current;
    prevSlugsRef.current = newSlugs;
    if (prevSlugs.length === 0 || newSlugs.length === 0) return;
    const idx = currentIndexRef.current;
    if (idx <= 0) return; // user at top — let new content sit there
    const currentSlug = prevSlugs[idx];
    if (!currentSlug) return;
    const newIdx = newSlugs.indexOf(currentSlug);
    if (newIdx < 0 || newIdx === idx) return;
    listRef.current?.scrollToOffset({ offset: newIdx * itemHeight, animated: false });
    setCurrentIndex(newIdx);
  }, [sortedArticles, itemHeight, listRef, setCurrentIndex]);

  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      overscrollFired.set(false);
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    },
    scrollToSlug: (slug: string) => {
      const idx = sortedArticles.findIndex((a) => a.slug === slug);
      if (idx >= 0) {
        listRef.current?.scrollToOffset({ offset: idx * itemHeight, animated: true });
      }
    },
  }));

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      scrollY.value = event.contentOffset.y;
      const total = Math.max((articleCount - 1) * itemHeight, 1);
      const progress = Math.max(0, Math.min(event.contentOffset.y / total, 1));
      progressesSV.modify((arr) => {
        'worklet';
        arr[catIndex] = progress;
        return arr;
      });

      // Detect overscroll past the last article
      const maxScroll = (articleCount - 1) * itemHeight;
      if (event.contentOffset.y > maxScroll + 15 && !overscrollFired.value) {
        overscrollFired.value = true;
        // Haptic + toast + bounce-back debounce reset, as one task.
        scheduleOnRN(fireOverscroll);
      }
    },
  });

  // Find the boundary between new and previously seen articles
  const earlierIndex = useMemo(() => {
    if (lastSeenAt <= 0) return -1;
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

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.y / itemHeight);
      if (idx !== currentIndexRef.current) handleSnap(idx);
    },
    [itemHeight, handleSnap],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<Article> | null | undefined, index: number) => ({
      length: itemHeight,
      offset: itemHeight * index,
      index,
    }),
    [itemHeight],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Article; index: number }) => (
      <ArticlePage
        article={item}
        itemHeight={itemHeight}
        index={index}
        scrollY={scrollY}
        onBookmarkPress={onBookmarkPress}
        onSourcesPress={onSourcesPress}
        onTimeAgoPress={onTimeAgoPress}
        onEntityPress={onEntityPress}
        showEarlierDivider={index === earlierIndex}
        globeRef={globeRef}
        globeYOffset={containerTopRef}
        onCountryPress={onCountryPress}
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
      earlierIndex,
      tick,
    ],
  );

  const keyExtractor = useCallback((item: Article) => item.slug, []);

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
        exchanges={exchanges}
        genocideSituations={genocideSituations}
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
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        ListFooterComponent={safeAreaFooter}
        refreshControl={
          <RefreshControl
            refreshing={localRefreshing}
            onRefresh={currentIndex === 0 ? handleRefresh : undefined}
            enabled={currentIndex === 0}
            tintColor={colors.textSecondary}
            progressBackgroundColor={colors.bg}
            colors={[colors.textSecondary]}
          />
        }
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  bgFade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  bgFadeCanvas: { flex: 1 },
});
