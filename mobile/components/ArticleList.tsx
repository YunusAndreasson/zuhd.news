import type { Chokepoint, ConflictEvent, Entity, GdacsAlert, HeatmapPoint } from '@shared/types';
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
} from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
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
import { usePullToClose } from '../hooks/usePullToClose';
import { useScrollState } from '../hooks/useScrollState';
import { useTheme } from '../hooks/useTheme';
import { hapticNotification, hapticTick } from '../lib/haptics';
import type { RiverArticle } from '../lib/news-order';
import { recordArticleSnap } from '../lib/onboarding-store';
import { maybeRequestReview } from '../lib/store-review';
import { ArticlePage } from './ArticlePage';
import { BackToIndexButton } from './BackToIndexButton';
import { EmptyState } from './EmptyState';
import { MiniGlobe, type MiniGlobeRef, type TapResult } from './globe/MiniGlobe';
import { PullHandle } from './PullHandle';

// Article backdrop gradient stops. Hoisted to the list container so a single
// gradient view is rendered per column — cells scroll through a fixed
// fade pattern rather than each cell carrying its own.
const BG_FADE_LOCATIONS: number[] = [0, 0.02, 0.14, 0.28, 0.48, 0.72, 1];

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
  progressesSV: SharedValue<number[]>;
  zoomClipOverride?: number | null;
  tick?: number;
  /**
   * The article this river opens on, and the one it starts at.
   *
   * The column is sliced from here, so the story a reader tapped is always
   * page zero. That is not a convenience — it is what makes the pull-down
   * work: a downward drag is vertical paging everywhere except the top of the
   * list, so "the top" has to be where the reader arrives. See
   * `usePullToClose`.
   *
   * A slug rather than an index because a refresh reorders the river beneath
   * an open article, and an index would then name a different story.
   */
  entrySlug?: string;
  /** Back to the news index. Absent when the river is the whole column. */
  onClose?: () => void;
  /** The stage's presentation, driven backwards by the pull — see
   *  `SheetStage` and `usePullToClose`. */
  sheetProgress?: SharedValue<number>;
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
  onEndReached,
  onCaughtUp,
  progressesSV,
  zoomClipOverride,
  tick,
  entrySlug,
  onClose,
  sheetProgress,
  ref,
}: ArticleListProps) {
  const { bgAlpha } = useTheme();
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
  // Sliced at the entry story — see `entrySlug`. Recomputed by slug on every
  // data change, so a refresh that reorders the river keeps the reader on the
  // article they opened rather than on whatever now holds its old index. An
  // entry that has rotated out of the feed falls back to the whole column,
  // which is the old behaviour and never crashes.
  const sortedArticles = useMemo(() => {
    if (!entrySlug) return articles;
    const at = articles.findIndex((a) => a.slug === entrySlug);
    return at > 0 ? articles.slice(at) : articles;
  }, [articles, entrySlug]);
  const articleCount = sortedArticles.length;
  const itemHeight = viewportHeight;
  const safeAreaFooter = useMemo(() => <View style={{ height: insets.bottom }} />, [insets.bottom]);
  // Unseeded, and that is a consequence of the slice above rather than an
  // oversight. The entry article is index 0 of `sortedArticles`, so the
  // offset this list opens at *is* zero — there is no twelfth page whose
  // scroll-linked opacity would otherwise compute as invisible, which is the
  // trap `useScrollState`'s header describes and `CardPager` fell into.
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

  const { gesture, listGesture, pullStyle, sheetStyle, innerOffset, pull } = usePullToClose({
    scrollY,
    onClose,
    progress: sheetProgress,
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

  // Report current article to parent (initial + on snap/sort change)
  useEffect(() => {
    const article = sortedArticles[currentIndex];
    if (article) onArticleChange?.(article);
  }, [currentIndex, sortedArticles, onArticleChange]);

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

  /**
   * Hand the rail back to the index on the way out.
   *
   * The index used to unmount when a detail opened and reset this on its way
   * back in. It stays mounted behind the sheet now, so that reset never fires
   * — and without this the rail would keep showing how far through the detail
   * the reader had got, under a column they are no longer in.
   */
  useEffect(() => {
    return () => {
      progressesSV.modify((arr) => {
        'worklet';
        arr[sectionIndex] = 0;
        return arr;
      });
    };
  }, [progressesSV, sectionIndex]);

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
      // A newly-arrived page is at its own top, and the pull-down arms on
      // that. Without this, paging away from a long article you had scrolled
      // leaves its offset behind and the next page refuses the gesture.
      innerOffset.value = 0;
      maybeRequestReview();
      recordArticleSnap();
    },
    [earlierIndex, onCaughtUp, caughtUpFired, setCurrentIndex, innerOffset],
  );

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.round(e.nativeEvent.contentOffset.y / itemHeight);
      if (idx !== currentIndexRef.current) handleSnap(idx);
    },
    [itemHeight, handleSnap],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<RiverArticle> | null | undefined, index: number) => ({
      length: itemHeight,
      offset: itemHeight * index,
      index,
    }),
    [itemHeight],
  );

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
        innerOffset={innerOffset}
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
      resolvableEntityIds,
      earlierIndex,
      innerOffset,
      tick,
    ],
  );

  const keyExtractor = useCallback((item: RiverArticle) => item.slug, []);

  if (sortedArticles.length === 0)
    return (
      <View style={{ height: viewportHeight }}>
        <EmptyState message="no articles yet" hint="New coverage arrives through the day" />
      </View>
    );

  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={containerRef}
        style={styles.container}
        onLayout={() => {
          containerRef.current?.measureInWindow((_x, y) => {
            containerTopRef.current = y;
          });
        }}
      >
        {/* Everything the reader sees moves together under the pull — the globe
          included. A page whose text slides down off a globe that stays put
          reads as a bug; a page that leaves as one object reads as a page
          leaving. What is revealed underneath is the app background rather
          than the list, because the list is not mounted while this is: the
          column swaps what it renders, which is what keeps `PagerView` in
          sole charge of the horizontal axis. */}
        <Animated.View style={[styles.pullLayer, onClose ? sheetStyle : null, pullStyle]}>
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
          <GestureDetector gesture={listGesture}>
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
              // No bounce, no stretch. The pull-to-close translates the page
              // under the finger, and a list rubber-banding at the same time
              // is one movement drawn twice — on iOS the two even disagree
              // about how far.
              //
              // Pull-to-refresh went with it, and belongs gone: it lived at
              // exactly this offset, so the two gestures were the same drag on
              // the same pixel. `NewsIndex` carries refresh now, which is
              // where a reader looks for it — the list is the surface that
              // gains new stories, and an open article is not.
              bounces={false}
              overScrollMode="never"
              ListFooterComponent={safeAreaFooter}
            />
          </GestureDetector>
          {/* A sibling of the list, never a child of a page — `BackToIndexButton`
          has the reason. Here it also has to sit above the globe's tap zone,
          which spans the lower half of every article. Inside the pull layer,
          so it travels with the page it belongs to. */}
          {onClose ? <BackToIndexButton onPress={onClose} /> : null}
          {onClose ? <PullHandle pull={pull} /> : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  // The layer the pull translates. Separate from `container` because that one
  // carries the ref `measureInWindow` reads for the globe's tap offset, and a
  // transform on it would make that number move with the gesture.
  pullLayer: { flex: 1 },
  bgFade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  bgFadeCanvas: { flex: 1 },
});
