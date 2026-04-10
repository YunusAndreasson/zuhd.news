import {
  memo,
  useCallback,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACING } from '../constants/theme';
import { useScrollState } from '../hooks/useScrollState';
import { useTheme } from '../hooks/useTheme';
import { formatTimeAgo } from '../lib/article-utils';
import { hapticNotification, hapticTick } from '../lib/haptics';
import { maybeRequestReview } from '../lib/store-review';
import type { Article, ContextPressHandler, HeatmapPoint, SourcePressHandler } from '../types';
import { ArticlePage } from './ArticlePage';
import { MiniGlobe, type MiniGlobeRef, type TapResult } from './globe/MiniGlobe';

const BREAKING_THRESHOLD = 100;

export interface ArticleListRef {
  scrollToTop: () => void;
  scrollToSlug: (slug: string) => void;
}

interface ArticleListProps {
  articles: Article[];
  heatmapPoints?: HeatmapPoint[];
  viewportHeight: number;
  catIndex: number;
  lastSeenAt: number;
  onRefresh: () => Promise<void>;
  onEndReached?: (catIndex: number) => void;
  onCaughtUp?: () => void;
  onSourcePress?: SourcePressHandler;
  onContextPress?: ContextPressHandler;
  onCountryPress?: (result: TapResult) => void;
  onBookmarkPress?: (article: Article) => void;
  onBreakingPress?: (coverage: number) => void;
  progressesSV: SharedValue<number[]>;
  tick?: number;
  resetKey?: number;
  ref?: React.Ref<ArticleListRef>;
}

export const ArticleList = memo(function ArticleList({
  articles,
  heatmapPoints,
  viewportHeight,
  catIndex,
  lastSeenAt,
  onSourcePress,
  onContextPress,
  onCountryPress,
  onBookmarkPress,
  onBreakingPress,
  onRefresh,
  onEndReached,
  onCaughtUp,
  progressesSV,
  tick,
  resetKey,
  ref,
}: ArticleListProps) {
  const { colors, font, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  // Chronological sort, but within the same time bucket (e.g. all "1h ago")
  // breaking stories (eventCoverage >= 100) float to top of their bucket
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
  }, [articles]);
  const articleCount = sortedArticles.length;
  const itemHeight = viewportHeight;
  const contentStyle = useMemo(() => ({ paddingBottom: insets.bottom }), [insets.bottom]);
  const {
    scrollY,
    currentIndex,
    setCurrentIndex,
    overscrollFired,
    caughtUpFired,
    overscrollTimer,
  } = useScrollState(resetKey, catIndex, progressesSV);
  const listRef = useAnimatedRef<Animated.FlatList<Article>>();
  const globeRef = useRef<MiniGlobeRef>(null);
  const containerRef = useRef<View>(null);
  const containerTopRef = useRef(0);
  const resetOverscroll = useCallback(() => {
    if (overscrollTimer.current) clearTimeout(overscrollTimer.current);
    overscrollTimer.current = setTimeout(() => {
      overscrollFired.value = false;
    }, 800);
  }, [overscrollFired, overscrollTimer]);
  const fireEndReached = useEffectEvent(() => {
    onEndReached?.(catIndex);
  });
  const [localRefreshing, setLocalRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setLocalRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setLocalRefreshing(false);
    }
  }, [onRefresh]);

  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      overscrollFired.value = false;
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
        runOnJS(hapticNotification)();
        runOnJS(fireEndReached)();
        // Reset after bounce-back settles
        runOnJS(resetOverscroll)();
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
    },
    [earlierIndex, onCaughtUp],
  );

  useAnimatedReaction(
    () => Math.round(scrollY.value / itemHeight),
    (idx, prev) => {
      if (prev !== null && idx !== prev) {
        runOnJS(handleSnap)(idx);
      }
    },
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
        screenWidth={screenWidth}
        index={index}
        scrollY={scrollY}
        onSourcePress={onSourcePress}
        onContextPress={onContextPress}
        onBookmarkPress={onBookmarkPress}
        showEarlierDivider={index === earlierIndex}
        globeRef={globeRef}
        globeYOffset={containerTopRef}
        onCountryPress={onCountryPress}
        onBreakingPress={onBreakingPress}
        tick={tick}
        isBreaking={(item.eventCoverage ?? 0) >= BREAKING_THRESHOLD}
      />
    ),
    [
      itemHeight,
      screenWidth,
      scrollY,
      onSourcePress,
      onContextPress,
      onCountryPress,
      onBookmarkPress,
      onBreakingPress,
      earlierIndex,
      tick,
    ],
  );

  const keyExtractor = useCallback((item: Article) => item.slug, []);

  if (sortedArticles.length === 0)
    return (
      <View style={styles.empty}>
        <Text style={{ fontFamily: font.regular, fontSize: typography.sizeSm, color: colors.textSecondary }}>
          No articles yet
        </Text>
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
        scrollY={scrollY}
        itemHeight={itemHeight}
        width={screenWidth}
        height={viewportHeight}
        tick={tick}
      />
      <Animated.FlatList
        key={resetKey}
        ref={listRef}
        data={sortedArticles}
        extraData={tick}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        snapToInterval={itemHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        contentContainerStyle={contentStyle}
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
  empty: { flex: 1, alignItems: 'center', paddingTop: SPACING.xl },
});
