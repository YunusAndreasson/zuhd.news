import type { Category } from '@shared/types';
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { RiverArticle } from '../lib/news-order';
import { ArticleRow } from './ArticleRow';
import { EmptyState } from './EmptyState';
import { Text } from './primitives';

/**
 * Today's stories, as one list.
 *
 * The three instrument columns already open as an index — six rows a glance
 * takes in, and a row tap opens the card. `news` was the one column that did
 * not, and it is the column a reader lands on: forty articles, one full screen
 * each, reachable only by swiping through them in order. The question a reader
 * actually arrives with — what is going on this morning — cost forty swipes
 * and forty readings, when the headline, the desk that filed it, its age and
 * where it happened were all already written.
 *
 * So the same shape as `ColumnIndex`, for the same reason, and deliberately
 * the same shape as it: an app that teaches one navigation model on three of
 * its four columns should not ask the reader to learn a second on the fourth.
 * Nothing is lost — the river is what a row opens, with its globe, its sources,
 * its isnad and its bookmark gesture untouched.
 *
 * ── Why a ScrollView and not a list ───────────────────────────────────────
 *
 * The same call as `ColumnIndex`, for a reason that reads backwards until you
 * hit it: forty-odd rows sound like the case virtualisation is for, and a
 * `FlatList` here was the first thing written. It cannot restore its own
 * scroll position. `scrollToOffset` moves the underlying scroll view, and on
 * mount that view is only as tall as `initialNumToRender` has made it — so
 * returning from the twentieth headline landed on the eighth, silently
 * clamped, which reads as a bug rather than as a restore. (`contentOffset`,
 * the prop that would set the starting position, is iOS-only.)
 *
 * The feed is bounded: the API ships at most thirteen articles per category
 * across four, so this list has a ceiling of about forty-three rows of two
 * `Text`s each. That is a cheaper mount than the six sparkline rows the
 * instrument columns already render eagerly, and it buys a content height
 * that is correct in the first layout pass — which is the whole of the
 * restore.
 *
 * ── What the globe is doing while this is on screen ───────────────────────
 *
 * Nothing — it belongs to `ArticleList`, which is not mounted. That is the
 * same trade the instrument columns make: their index draws a 56pt sparkline
 * and the full chart lives one tap away, in the card. A globe under a list has
 * no single place to point at, and pointing at nothing is worse than waiting
 * to be opened.
 */

export interface NewsIndexRef {
  scrollToTop: () => void;
}

export const NewsIndex = memo(function NewsIndex({
  articles,
  viewportHeight,
  sectionIndex,
  progressesSV,
  lastSeenAt,
  onSelect,
  onLongPress,
  onRefresh,
  scrollOffset,
  ref,
}: {
  articles: RiverArticle[];
  viewportHeight: number;
  /** This column's slot in the shared progress array the section rail reads. */
  sectionIndex: number;
  progressesSV: SharedValue<number[]>;
  /** The boundary between what has arrived since the last visit and what has
   *  not. `-1` (or a first launch) draws no divider. */
  lastSeenAt: number;
  onSelect: (slug: string, category: Category) => void;
  /** Press and hold to save, the same gesture the river teaches. */
  onLongPress?: (slug: string) => void;
  onRefresh: () => Promise<void>;
  /**
   * Where this list was when the reader last left it.
   *
   * Owned by the screen rather than by this component, because this component
   * is unmounted for the whole time the answer matters — a row tap swaps the
   * page for the river. Without it, coming back from the twentieth headline
   * lands on the first, and the reader scrolls the list again every single
   * time. Every list in the medium restores its place; this one is not
   * special.
   *
   * A shared value, so the offset is written from the scroll worklet with no
   * JS hop per frame, and read back once on mount.
   */
  scrollOffset: SharedValue<number>;
  ref?: React.Ref<NewsIndexRef>;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const listRef = useAnimatedRef<Animated.ScrollView>();
  const [refreshing, setRefreshing] = useState(false);

  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      scrollOffset.set(0);
      listRef.current?.scrollTo({ y: 0, animated: true });
    },
  }));

  /**
   * Put the reader back where they were, once — and only once the content is
   * tall enough to hold the position.
   *
   * Driven off the content size rather than off mount, because a scroll to an
   * offset the content has not reached yet is silently clamped and the reader
   * lands somewhere near, which is worse than landing at the top: it looks
   * like the app lost their place badly rather than not at all.
   *
   * `animated: false` is what makes this a restored position rather than a
   * scroll the reader did not ask for. The latch stops a later re-measure —
   * a rotation, a font-scale change, new articles arriving — from yanking the
   * list back under their finger.
   */
  const restoredRef = useRef(false);
  const handleContentSizeChange = useCallback(() => {
    if (restoredRef.current) return;
    const y = scrollOffset.get();
    if (y <= 0) {
      restoredRef.current = true;
      return;
    }
    listRef.current?.scrollTo({ y, animated: false });
    restoredRef.current = true;
  }, [listRef, scrollOffset]);

  /**
   * The rail's fill belongs to whichever of the two views is on screen.
   *
   * `ArticleList` leaves this column's slot wherever the reader stopped
   * reading, so returning to the index would show a fill under a list the
   * reader has not scrolled. Zero it on mount, and on unmount so the river
   * starts from its own first frame rather than from ours. Same arrangement as
   * `ColumnIndex`.
   */
  useEffect(() => {
    const reset = () => {
      progressesSV.modify((arr) => {
        'worklet';
        arr[sectionIndex] = 0;
        return arr;
      });
    };
    reset();
    return reset;
  }, [progressesSV, sectionIndex]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y = event.contentOffset.y;
      scrollOffset.set(y);
      // The scrollable distance, not the content height: a list that fits
      // reports zero and the rail draws no fill, which is the honest answer
      // when there is nothing below the fold.
      const total = Math.max(event.contentSize.height - event.layoutMeasurement.height, 1);
      const progress = Math.max(0, Math.min(y / total, 1));
      progressesSV.modify((arr) => {
        'worklet';
        arr[sectionIndex] = progress;
        return arr;
      });
    },
  });

  // The first row the reader has already seen. Same derivation as
  // `ArticleList`'s — the river draws a full-page boundary at this article and
  // the list draws a rule above it, so both surfaces agree about where the new
  // coverage stops. `> 0` because a boundary at the top of the list would be
  // announcing that nothing is new by drawing a line above everything.
  const earlierIndex = useMemo(() => {
    if (lastSeenAt <= 0) return -1;
    const idx = articles.findIndex((a) => a.addedAt <= lastSeenAt);
    return idx > 0 ? idx : -1;
  }, [articles, lastSeenAt]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // try/catch, not try/finally — see `ArticleList.handleRefresh` for why the
    // finalizer is avoided. The catch swallows, so the reset below always runs.
    try {
      await onRefresh();
    } catch {
      // HomeScreen.handleRefresh catches and toasts its own failures.
    }
    setRefreshing(false);
  }, [onRefresh]);

  const contentStyle = useMemo(
    () => ({ paddingBottom: insets.bottom + SPACING.xxl + SPACING.md }),
    [insets.bottom],
  );

  if (articles.length === 0) {
    return (
      <View style={{ height: viewportHeight }}>
        <EmptyState message="no articles yet" hint="New coverage arrives through the day" />
      </View>
    );
  }

  return (
    <Animated.ScrollView
      ref={listRef}
      style={styles.list}
      contentContainerStyle={[styles.content, contentStyle]}
      onScroll={scrollHandler}
      onContentSizeChange={handleContentSizeChange}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.textSecondary}
          progressBackgroundColor={colors.bg}
          colors={[colors.textSecondary]}
        />
      }
    >
      {articles.map((article, i) => (
        <Fragment key={article.slug}>
          {i === earlierIndex ? (
            <View
              style={styles.caughtUp}
              accessible
              accessibilityLabel="Caught up. Everything below you have already seen."
            >
              <View style={[styles.caughtUpLine, { backgroundColor: colors.rule }]} />
              <Text variant="labelSm" tone="secondary">
                {'caught up'}
              </Text>
              <View style={[styles.caughtUpLine, { backgroundColor: colors.rule }]} />
            </View>
          ) : null}
          <ArticleRow
            slug={article.slug}
            title={article.title}
            addedAt={article.addedAt}
            category={article.category}
            location={article.location}
            onPress={onSelect}
            onLongPress={onLongPress}
          />
        </Fragment>
      ))}
    </Animated.ScrollView>
  );
});

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.articlePadding,
    paddingTop: SPACING.sm,
  },
  // The river's boundary is a full page with a sentence under it, because a
  // reader arrives there one swipe at a time and the moment is worth marking.
  // In a list the same fact needs one line: a rule, the same two words, and
  // the rows either side of it doing the explaining.
  caughtUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xs,
  },
  caughtUpLine: { flex: 1, height: StyleSheet.hairlineWidth },
});
