import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
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
import { CATEGORIES, COLORS, LAYOUT, SPACING } from '../constants/theme';
import { useHaptic } from '../hooks/useHaptic';
import { getReadingPositions, saveReadingPosition } from '../lib/storage';
import type { Article } from '../types';
import { ArticlePage } from './ArticlePage';
import { CaughtUp } from './CaughtUp';

export interface ArticleListRef {
  scrollToTop: () => void;
}

interface ArticleListProps {
  articles: Article[];
  viewportHeight: number;
  catIndex: number;
  onRefresh: () => Promise<void>;
  onEndReached?: () => void;
  onThreadPress?: (article: Article) => void;
  onSourcePress?: (sourceName: string) => void;
  pagerIdle: React.RefObject<boolean>;
  progressesSV: SharedValue<number[]>;
  ref?: React.Ref<ArticleListRef>;
}

export const ArticleList = memo(function ArticleList({
  articles,
  viewportHeight,
  catIndex,
  onThreadPress,
  onSourcePress,
  onRefresh,
  onEndReached,
  pagerIdle,
  progressesSV,
  ref,
}: ArticleListProps) {
  const insets = useSafeAreaInsets();
  const { impact: hapticSnap, notification: hapticComplete } = useHaptic();
  const articleCount = articles.length;
  const itemHeight = viewportHeight - LAYOUT.peekHeight;
  const scrollY = useSharedValue(0);
  const listRef = useAnimatedRef<Animated.FlatList<Article>>();
  const [atEnd, setAtEnd] = useState(false);
  const atEndSV = useSharedValue(false);
  const [currentIndex, setCurrentIndex] = useState(0);
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
      setAtEnd(false);
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

  useAnimatedReaction(
    () => Math.round(scrollY.value / itemHeight),
    (idx, prev) => {
      if (prev !== null && idx !== prev) {
        runOnJS(hapticSnap)();
        runOnJS(setCurrentIndex)(idx);
        if (idx === articleCount - 1 && !atEndSV.value) {
          atEndSV.value = true;
          runOnJS(setAtEnd)(true);
          runOnJS(hapticComplete)();
        } else if (idx < articleCount - 1 && atEndSV.value) {
          atEndSV.value = false;
          runOnJS(setAtEnd)(false);
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
        onThreadPress={onThreadPress}
        onSourcePress={onSourcePress}
      />
    ),
    [itemHeight, scrollY, onThreadPress, onSourcePress],
  );

  const keyExtractor = useCallback((item: Article) => item.slug, []);

  if (articles.length === 0) return <View style={styles.empty} />;

  return (
    <Animated.FlatList
      ref={listRef}
      data={articles}
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
      windowSize={5}
      contentContainerStyle={{ paddingBottom: LAYOUT.peekHeight + insets.bottom }}
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
  );
});

const styles = StyleSheet.create({
  empty: { flex: 1 },
});
