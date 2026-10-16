import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ANIMATION, EASING, OPACITY, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { countryTrajectories } from '../../lib/country-cards';
import { hapticSwipe } from '../../lib/haptics';
import { Pressable } from '../primitives';
import { TrajectoryCard } from './TrajectoryCard';

interface CountryCardsCarouselProps {
  countryName: string | null;
}

// Card content stack: eyebrow + headline (21pt title) + subtitle (≤2 lines)
// + chart (140pt) + source. Default-scale content lands at ~283pt; the
// previous 340 budget was sized for max-accessibility scale and left ~57pt
// of empty space below the source attribution at default scale, which read
// as a dead gap before the dot indicator. CardShell uses flex so the
// source attribution stays glued to the bottom of the card regardless —
// at max accessibility scale the chart still has enough vertical space
// because subtitle/chart take the slack.
const CARD_HEIGHT = 296;

export const CountryCardsCarousel = memo(function CountryCardsCarousel({
  countryName,
}: CountryCardsCarouselProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  // Measure the wrap's actual rendered width via onLayout instead of
  // computing from window dimensions. The wrap sits inside
  // BottomSheetScrollView's contentContainer (padded by `sheetStyles.content`)
  // and its true inner width can differ subtly from `windowWidth − 36`
  // depending on bottom-sheet internals, scrollbar gutters, or borders. A
  // mismatch of even 1pt makes paging snap short, leaving the next card's
  // left edge peeking through. Measuring is the only fix that survives
  // those discrepancies.
  const [pageWidth, setPageWidth] = useState(0);
  const onWrapLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setPageWidth((prev) => (prev === w ? prev : w));
  }, []);

  // Structural sophistication first (slow, decades), then income, what a year
  // did to prices at home, and the demographic long view. A series the
  // country lacks is a card left out.
  const cards = useMemo(() => countryTrajectories(countryName), [countryName]);
  const [active, setActive] = useState(0);
  // Track the previous page so a swipe's haptic fires only on an actual
  // change, not on the initial settle from index 0.
  const prevActive = useRef(0);
  // Programmatic paging target for the dot controls. Horizontal swipe inside
  // the bottom sheet's vertical scroller is unreliable on Android (the sheet
  // can claim the pan), so the dots double as tap controls — `scrollTo` works
  // regardless of which gesture handler owns touches.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const goToPage = useCallback(
    (i: number) => {
      if (pageWidth <= 0) return;
      scrollRef.current?.scrollTo({ x: i * pageWidth, animated: !reduceMotion });
      prevActive.current = i;
      setActive(i);
    },
    [pageWidth, reduceMotion],
  );

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageWidth <= 0) return;
      const idx = Math.max(
        0,
        Math.min(cards.length - 1, Math.round(e.nativeEvent.contentOffset.x / pageWidth)),
      );
      if (idx !== prevActive.current) {
        // A swipe landing on a page: the swipe tier, as the story deck's.
        hapticSwipe();
        prevActive.current = idx;
      }
      setActive(idx);
    },
    [pageWidth, cards.length],
  );

  // Native offsets are pixels: when the reading column changes width, retain
  // the selected card rather than leaving the reader between two pages.
  const alignPage = useCallback(() => {
    if (pageWidth <= 0 || cards.length === 0) return;
    const index = Math.min(prevActive.current, cards.length - 1);
    prevActive.current = index;
    setActive(index);
    scrollRef.current?.scrollTo({ x: index * pageWidth, animated: false });
  }, [pageWidth, cards.length]);

  if (cards.length === 0) return null;

  return (
    // Top + bottom hairlines bridge the carousel into the metric table
    // below as one continuous reading column. The carousel is the headline
    // chapter; the table is the appendix; the hairlines mark the seam.
    <View
      onLayout={onWrapLayout}
      style={[styles.wrap, { borderTopColor: colors.rule, borderBottomColor: colors.rule }]}
    >
      {pageWidth > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={pageWidth}
          snapToAlignment="start"
          onMomentumScrollEnd={onMomentumEnd}
          onContentSizeChange={alignPage}
          directionalLockEnabled
          canCancelContentTouches
          // overflow:hidden is the load-bearing fix for "next card peeks
          // through on the right". Pages set overflow:visible so chart
          // year-tick boxes don't shave on Android — that overflow leaks
          // into the next page's slot inside the horizontal ScrollView,
          // which on iOS does NOT clip child rendering by default.
          style={[styles.scroll, { height: CARD_HEIGHT }]}
        >
          {cards.map((card) => (
            <View key={card.key} style={[styles.page, { width: pageWidth, height: CARD_HEIGHT }]}>
              <TrajectoryCard card={card} />
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={{ height: CARD_HEIGHT }} />
      )}
      {cards.length > 1 ? (
        <DotIndicator count={cards.length} active={active} onSelect={goToPage} />
      ) : null}
    </View>
  );
});

const DOT = 4;
/** A card not in front: a size step down, as well as an ink step. */
const DOT_QUIET = 3;
const DOT_MOVE = { duration: ANIMATION.fast, easing: EASING.out } as const;

function DotIndicator({
  count,
  active,
  onSelect,
}: {
  count: number;
  active: number;
  onSelect: (i: number) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.dotRow}>
      {Array.from({ length: count }).map((_, i) => (
        // Keep the quiet dot, with a full independent touch target. The old
        // 12pt targets were too narrow to reliably choose neighbouring cards.
        <Pressable
          key={i}
          onPress={() => onSelect(i)}
          accessibilityRole="button"
          accessibilityLabel={`View card ${i + 1} of ${count}`}
          accessibilityState={{ selected: i === active }}
          hitSlop={0}
          style={styles.dotHit}
        >
          <Dot on={i === active} dim={colors.textSecondary} accent={colors.textEmphasis} />
        </Pressable>
      ))}
    </View>
  );
}

function Dot({ on, dim, accent }: { on: boolean; dim: string; accent: string }) {
  // One move from quiet to current: ink, size and the decorative fade ride it
  // together, so the dot no longer changes colour a frame before it grows.
  const progress = useSharedValue(on ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(on ? 1 : 0, DOT_MOVE);
  }, [on, progress]);

  const animStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [dim, accent]),
    opacity: interpolate(progress.value, [0, 1], [OPACITY.muted, 1]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [DOT_QUIET / DOT, 1]) }],
  }));

  return <Animated.View style={[styles.dot, animStyle]} />;
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // Carousel-level clip stops a page's overflow:visible content
    // (year-tick label boxes, threshold annotations) from leaking into the
    // adjacent page's slot when at rest on a snap point. iOS in particular
    // does not clip child rendering at the ScrollView page boundary.
    overflow: 'hidden',
  },
  scroll: {
    // Defensive — pair with `wrap.overflow: 'hidden'` so neither the
    // ScrollView nor its parent lets cross-page glyphs through.
    overflow: 'hidden',
  },
  // Pages keep overflow:visible so descenders / accessibility-scaled labels
  // don't shave inside the page; the wrap-level clip above is what stops
  // the inter-page leak.
  page: {
    overflow: 'visible',
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotHit: {
    width: SPACING.xxl,
    height: SPACING.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
});
