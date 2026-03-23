import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Dimensions, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  runOnUI,
  type SharedValue,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORIES, COLORS, LAYOUT } from '../constants/theme';
import { useHaptic } from '../hooks/useHaptic';
import { getReadingPositions, saveReadingPosition } from '../lib/storage';
import type { Article } from '../types';
import { ArticlePage } from './ArticlePage';
import { MiniGlobe, type MiniGlobeRef, type TapResult } from './globe/MiniGlobe';

export interface ArticleListRef {
  scrollToTop: () => void;
}

interface ArticleListProps {
  articles: Article[];
  viewportHeight: number;
  catIndex: number;
  lastSeenAt: number;
  onRefresh: () => Promise<void>;
  onEndReached?: () => void;
  onSourcePress?: (sourceName: string, allSources?: Array<{name: string; country?: string | null}>) => void;
  onConceptPress?: (concept: string) => void;
  onCountryPress?: (result: TapResult) => void;
  pagerIdle: React.RefObject<boolean>;
  progressesSV: SharedValue<number[]>;
  tick?: number;
  ref?: React.Ref<ArticleListRef>;
}

export const ArticleList = memo(function ArticleList({
  articles,
  viewportHeight,
  catIndex,
  lastSeenAt,
  onSourcePress,
  onConceptPress,
  onCountryPress,
  onRefresh,
  onEndReached,
  pagerIdle,
  progressesSV,
  tick,
  ref,
}: ArticleListProps) {
  const insets = useSafeAreaInsets();
  const { impact: hapticSnap, notification: hapticComplete } = useHaptic();
  const articleCount = articles.length;
  const itemHeight = viewportHeight - LAYOUT.peekHeight;
  const categoryFeedInfo = useMemo(() => {
    if (articleCount === 0) return null;
    const words = articles.reduce((sum, a) => sum + a.sentences.join(' ').split(/\s+/).length, 0);
    return { total: articleCount, readMins: Math.max(1, Math.ceil(words / 238)) };
  }, [articles, articleCount]);
  const contentStyle = useMemo(
    () => ({ paddingBottom: LAYOUT.peekHeight + insets.bottom }),
    [insets.bottom],
  );
  const scrollY = useSharedValue(0);
  const listRef = useAnimatedRef<Animated.FlatList<Article>>();
  const atEndSV = useSharedValue(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const globeRef = useRef<MiniGlobeRef>(null);
  const containerRef = useRef<View>(null);
  const containerTopRef = useRef(0);
  const overscrollFired = useSharedValue(false);
  const resetOverscroll = useCallback(() => {
    setTimeout(() => {
      overscrollFired.value = false;
    }, 800);
  }, [overscrollFired]);
  const [localRefreshing, setLocalRefreshing] = useState(false);

  // Restore saved reading position on mount
  useEffect(() => {
    const cat = CATEGORIES[catIndex];
    if (!cat) return;
    getReadingPositions().then((positions) => {
      const idx = positions[cat];
      if (idx != null && idx > 0 && idx < articles.length) {
        runOnUI(() => {
          'worklet';
          scrollTo(listRef, 0, idx * itemHeight, false);
        })();
      }
    });
  }, [articles.length, catIndex, itemHeight, listRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist reading position on scroll
  useEffect(() => {
    const cat = CATEGORIES[catIndex];
    if (cat && currentIndex > 0) saveReadingPosition(cat, currentIndex);
  }, [currentIndex, catIndex]);

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
      atEndSV.value = false;
      runOnUI(() => {
        'worklet';
        scrollTo(listRef, 0, 0, true);
      })();
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
        runOnJS(hapticComplete)();
        if (onEndReached) runOnJS(onEndReached)();
        // Reset after bounce-back settles
        runOnJS(resetOverscroll)();
      }
    },
  });

  // Find the boundary between new and previously seen articles
  const earlierIndex = useMemo(() => {
    if (lastSeenAt <= 0) return -1;
    const idx = articles.findIndex((a) => a.addedAt <= lastSeenAt);
    return idx > 0 ? idx : -1;
  }, [articles, lastSeenAt]);

  const caughtUpFired = useRef(false);
  const handleSnap = useCallback(
    (idx: number) => {
      if (earlierIndex > 0 && idx === earlierIndex - 1 && !caughtUpFired.current) {
        caughtUpFired.current = true;
        hapticComplete();
      } else {
        hapticSnap();
      }
      setCurrentIndex(idx);
    },
    [earlierIndex, hapticSnap, hapticComplete],
  );

  useAnimatedReaction(
    () => Math.round(scrollY.value / itemHeight),
    (idx, prev) => {
      if (prev !== null && idx !== prev) {
        runOnJS(handleSnap)(idx);
        if (idx === articleCount - 1 && !atEndSV.value) {
          atEndSV.value = true;
          runOnJS(hapticComplete)();
        } else if (idx < articleCount - 1 && atEndSV.value) {
          atEndSV.value = false;
        }
      }
    },
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
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
        onSourcePress={onSourcePress}
        onConceptPress={onConceptPress}
        showEarlierDivider={index === earlierIndex}
        feedInfo={index === 0 ? categoryFeedInfo : undefined}
        globeRef={globeRef}
        globeYOffset={containerTopRef}
        onCountryPress={onCountryPress}
      />
    ),
    [itemHeight, scrollY, onSourcePress, onConceptPress, earlierIndex, categoryFeedInfo],
  );

  const keyExtractor = useCallback((item: Article) => item.slug, []);

  if (articles.length === 0) return <View style={styles.empty} />;

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
        articles={articles}
        scrollY={scrollY}
        itemHeight={itemHeight}
        width={Dimensions.get('window').width}
        height={viewportHeight}
      />
      <Animated.FlatList
        ref={listRef}
        data={articles}
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
            onRefresh={currentIndex === 0 && pagerIdle.current ? handleRefresh : undefined}
            enabled={currentIndex === 0 && pagerIdle.current}
            tintColor={COLORS.textSecondary}
            progressBackgroundColor={COLORS.bg}
            colors={[COLORS.textSecondary]}
          />
        }
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1 },
});
