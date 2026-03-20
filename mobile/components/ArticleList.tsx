import { memo, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import { View, RefreshControl, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedReaction,
  useSharedValue,
  useAnimatedRef,
  scrollTo,
  runOnJS,
  runOnUI,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS, LAYOUT } from '../constants/theme';
import { ArticlePage } from './ArticlePage';
import { CaughtUp } from './CaughtUp';
import type { Article } from '../types';

export interface ArticleListRef {
  scrollToTop: () => void;
}

interface ArticleListProps {
  articles: Article[];
  viewportHeight: number;
  catIndex: number;
  onRefresh: () => Promise<void>;
  pagerIdle: React.RefObject<boolean>;
  progressesSV: SharedValue<number[]>;
}

const MAX_ARTICLES = 13;
const hapticSnap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
const hapticComplete = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

export const ArticleList = memo(forwardRef<ArticleListRef, ArticleListProps>(function ArticleList({
  articles,
  viewportHeight,
  catIndex,
  onRefresh,
  pagerIdle,
  progressesSV,
}, ref) {
  const articleCount = articles.length;
  const itemHeight = viewportHeight - LAYOUT.peekHeight;
  const scrollY = useSharedValue(0);
  const listRef = useAnimatedRef<Animated.FlatList<Article>>();
  const [atEnd, setAtEnd] = useState(false);
  const atEndSV = useSharedValue(false);
  const [currentIndex, setCurrentIndex] = useState(0);
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
      />
    ),
    [itemHeight, scrollY],
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
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      initialNumToRender={MAX_ARTICLES}
      windowSize={MAX_ARTICLES * 2 + 1}
      contentContainerStyle={styles.content}
      ListFooterComponent={<CaughtUp visible={atEnd} />}
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
}));

const styles = StyleSheet.create({
  empty: { flex: 1 },
  content: { paddingBottom: LAYOUT.peekHeight },
});
