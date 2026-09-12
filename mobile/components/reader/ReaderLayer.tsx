import type { Article, Entity } from '@shared/types';
import { memo, useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ANIMATION, EASING, LAYOUT, RADIUS, SPACING } from '../../constants/theme';
import { useHardwareBack, useSwipeBackGesture } from '../../hooks/useSwipeBack';
import { useTheme } from '../../hooks/useTheme';
import type { RiverArticle } from '../../lib/news-order';
import type { StoryOdds } from '../../lib/predictions';
import { ArticleList, type ArticleListRef } from '../ArticleList';
import type { MiniGlobeRef, TapResult } from '../globe/MiniGlobe';
import { Icon, IconButton } from '../primitives';

/**
 * Reading, as a layer over the map.
 *
 * The reader is unchanged — `ArticlePage`, the vertical pager, the Skia
 * backdrop fade, the prose scroller and its three nested-scroll guards are
 * all the same code they were when `news` was a tab. What changed is only
 * that it is presented over the map rather than paged to, so the map is the
 * place you come back to rather than a mode you left.
 *
 * It is a plain absolutely-positioned view, not a `Modal` and not a
 * `FullWindowOverlay`. A modal would put the reader in a second window that
 * the globe canvas is not in, which would mean a second globe; the whole
 * point of hoisting the canvas to the screen root is that opening a story is
 * a continuous motion over one earth.
 *
 * ## Getting out
 *
 * A horizontal swipe, the close chevron, or Android's back button. **Not** a
 * downward drag: this surface is a vertical pager over a prose scroller with
 * three load-bearing guards (`mobile/CLAUDE.md` records what each one cost),
 * and a dismiss gesture on that axis would compete with all of them. The
 * horizontal axis is free for the first time — the section rail used to own
 * it — so back-swipe takes a lane nothing else wants, at the same thresholds
 * the multi-page sheets use.
 */

interface ReaderLayerProps {
  visible: boolean;
  articles: RiverArticle[];
  viewportHeight: number;
  lastSeenAt: number;
  progressSV: SharedValue<number>;
  scrollY: SharedValue<number>;
  globeRef: React.RefObject<MiniGlobeRef | null>;
  resolvableEntityIds?: ReadonlySet<string>;
  tick?: number;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onEndReached?: () => void;
  onCaughtUp?: () => void;
  onCountryPress?: (result: TapResult) => void;
  onBookmarkPress?: (article: RiverArticle) => void;
  onSourcesPress?: (article: Article) => void;
  onTimeAgoPress?: (article: Article) => void;
  onEntityPress?: (entity: Entity) => void;
  onArticleChange?: (article: RiverArticle) => void;
  onReadingScrollStart?: () => void;
  /** Shares the story currently on screen. It lived in the bottom bar over
   *  the globe, where it was wrong on three of the four sections — it shares
   *  the last article read, so standing on a Brent card and pressing it sent
   *  someone a link to an unrelated story. Here it can only ever mean the
   *  page under it. */
  onShare?: () => void;
  /** Hands the globe's camera back to the pager's scroll position. */
  onDragStart?: () => void;
  oddsBySlug?: ReadonlyMap<string, StoryOdds>;
  onOddsPress?: (odds: StoryOdds) => void;
  listRef: React.RefObject<ArticleListRef | null>;
}

export const ReaderLayer = memo(function ReaderLayer({
  visible,
  articles,
  viewportHeight,
  lastSeenAt,
  progressSV,
  scrollY,
  globeRef,
  resolvableEntityIds,
  tick,
  onClose,
  onRefresh,
  onEndReached,
  onCaughtUp,
  onCountryPress,
  onBookmarkPress,
  onSourcesPress,
  onTimeAgoPress,
  onEntityPress,
  onArticleChange,
  onReadingScrollStart,
  onShare,
  onDragStart,
  oddsBySlug,
  onOddsPress,
  listRef,
}: ReaderLayerProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(0);

  useEffect(() => {
    // A rise, not a fade: the reader comes up over the map the way a card
    // arrives in the deck, and the asymmetry is what makes it read as
    // arriving rather than cross-dissolving. Gated like every other discrete
    // animation in the app.
    const duration = reduceMotion ? 0 : ANIMATION.normal;
    shown.value = withTiming(visible ? 1 : 0, { duration, easing: EASING.out });
  }, [visible, reduceMotion, shown]);

  const swipeBack = useSwipeBackGesture({ enabled: visible, onBack: onClose });
  useHardwareBack({ enabled: visible, onBack: onClose });

  const layerStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 24 }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    // The section rail drew this as a fill under the active tab. With no rail
    // it would have quietly disappeared, and "how far through the day am I"
    // is a question the app was answering.
    width: `${Math.max(0, Math.min(1, progressSV.value)) * 100}%`,
  }));

  const handleSourcesPress = useCallback(
    (article: RiverArticle) => onSourcesPress?.(article),
    [onSourcesPress],
  );
  const handleTimeAgoPress = useCallback(
    (article: RiverArticle) => onTimeAgoPress?.(article),
    [onTimeAgoPress],
  );

  return (
    <Animated.View
      style={[styles.layer, { backgroundColor: colors.bg }, layerStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      accessibilityViewIsModal={visible}
    >
      <GestureDetector gesture={swipeBack}>
        <View style={styles.fill}>
          {viewportHeight > 0 ? (
            <ArticleList
              ref={listRef}
              articles={articles}
              viewportHeight={viewportHeight}
              lastSeenAt={lastSeenAt}
              progressSV={progressSV}
              scrollY={scrollY}
              globeRef={globeRef}
              resolvableEntityIds={resolvableEntityIds}
              tick={tick}
              onRefresh={onRefresh}
              onEndReached={onEndReached}
              onCaughtUp={onCaughtUp}
              onCountryPress={onCountryPress}
              onBookmarkPress={onBookmarkPress}
              onSourcesPress={handleSourcesPress}
              onTimeAgoPress={handleTimeAgoPress}
              onEntityPress={onEntityPress}
              onArticleChange={onArticleChange}
              onReadingScrollStart={onReadingScrollStart}
              onDragStart={onDragStart}
              oddsBySlug={oddsBySlug}
              onOddsPress={onOddsPress}
            />
          ) : null}

          <View style={[styles.progressTrack, { top: insets.top }]} pointerEvents="none">
            <Animated.View
              style={[styles.progressFill, { backgroundColor: colors.textEmphasis }, progressStyle]}
            />
          </View>

          <View style={[styles.chrome, { top: insets.top }]} pointerEvents="box-none">
            {onShare ? (
              <IconButton
                onPress={onShare}
                haptic="none"
                accessibilityLabel="Share article"
                accessibilityHint="Opens the system share sheet"
                style={[styles.chromeButton, { backgroundColor: colors.pillBg }]}
              >
                <Icon name="share" size="md" />
              </IconButton>
            ) : null}
            <IconButton
              onPress={onClose}
              haptic="tick"
              accessibilityLabel="Back to the map"
              style={[styles.chromeButton, { backgroundColor: colors.pillBg }]}
            >
              <Icon name="chevron-down" size="md" />
            </IconButton>
          </View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 },
  fill: { flex: 1 },
  progressTrack: { position: 'absolute', left: 0, right: 0, height: LAYOUT.progressBarHeight },
  progressFill: { height: '100%' },
  // Trailing edge, mirroring where the menu sits on the map's own header, so
  // the two surfaces put their chrome in the same corner.
  chrome: {
    position: 'absolute',
    right: SPACING.articlePadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingTop: SPACING.xs,
  },
  chromeButton: { borderRadius: RADIUS.floating },
});
