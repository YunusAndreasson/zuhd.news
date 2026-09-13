import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, useNativeGesture, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SPACING } from '../../constants/theme';
import { deckTarget, rubberBand } from '../../lib/deck-swipe';

/**
 * The river, one story at a time, swiped sideways.
 *
 * ## Why sideways
 *
 * The sheet's vertical axis is already spoken for twice — pulling the sheet up
 * reads the story, and a grown story scrolls. The horizontal axis on the sheet
 * was free: the gauges scroll sideways too, but at the other end of the screen
 * with the globe between them, so ownership stays spatial.
 *
 * ## The gesture, and the three it has to stay out of the way of
 *
 * - **The sheet's pan** claims at 8 pt vertical and fails at 24 pt horizontal.
 *   This pan claims at 16 pt horizontal and fails at 12 pt vertical. Neither
 *   range overlaps the other's claim, and neither is `simultaneousWith` the
 *   other, so whichever activates first cancels the second: a drag is a swipe
 *   or a sheet move, never half of each.
 * - **A grown card's own scroll** only ever moves vertically, and runs
 *   alongside the sheet's pan exactly as the old list did (`MapSheet` rule 2).
 * - **The camera.** The pan writes `progress` on the UI thread and nothing
 *   else; the globe turns along the great circle between two datelines under
 *   the finger with no JS work per frame.
 *
 * ## The release
 *
 * The card follows the finger from where the pan claimed it, not from where
 * the touch began — measuring from touch-down made the card jump the 16 pt the
 * claim waits for. On release it lands on the story nearest where it would
 * come to rest if it kept decelerating (`lib/deck-swipe.ts`), so a slow drag
 * past halfway and a short flick both turn it, and the spring carries the
 * finger's velocity into the landing instead of starting from rest. A card
 * still settling can be caught by the next swipe exactly where it is.
 *
 * ## Why the index is committed on release, not when the spring lands
 *
 * Calling back to JS from an animation's completion callback aborted the app
 * once (worklets 0.10 `scheduleOnRN` from a `withTiming` callback), so the new
 * index is handed over the moment the finger lifts. That is safe here: the
 * slots are positioned by `progress`, not by index, and the window of mounted
 * cards around the new index still contains every card the spring is passing.
 *
 * ## Three mounted cards
 *
 * The current one and its neighbours. A card's content only ever changes while
 * it is off screen, and a card that stops being current scrolls back to its
 * top, so every card arrives showing its kicker.
 */

/** How much of the next card shows at the right edge — the sign, beside the
 *  masthead's track, that the row continues. It was 10pt, which read as a
 *  rendering seam rather than as the edge of another story. */
const DECK_CUT = SPACING.md;
/** Perceived duration of a landing, in ms. Critically damped, so a card
 *  arrives without a bounce the globe would have to follow past a dateline. */
const SETTLE_MS = 380;

type SheetGesture = ReturnType<typeof usePanGesture>;

interface StoryDeckProps {
  /** Stories in the river. The end card sits at index `count`. */
  count: number;
  /** The committed story. */
  index: number;
  /** Position in stories, shared with the globe's camera. */
  progress: SharedValue<number>;
  width: number;
  sheetGesture: SheetGesture;
  /** The sheet is grown: the current card scrolls. */
  scrollEnabled: boolean;
  /** Raw scroll offset of the current card, for the sheet's pan. */
  onScrollOffset: SharedValue<number>;
  /** The current card's natural height, so a grown sheet can stop at it.
   *  Reported when it lays out and again whenever a card becomes current. */
  onContentHeight?: (height: number) => void;
  keyOf: (index: number) => string;
  renderStory: (index: number) => ReactNode;
  renderEnd: () => ReactNode;
  /** A finger has started a swipe. Must be a stable, named callback. */
  onDragStart: () => void;
  /** The swipe ended on a different story. Must be a stable, named callback. */
  onSettle: (index: number) => void;
}

const DeckSlot = memo(function DeckSlot({
  position,
  progress,
  pitch,
  width,
  current,
  sheetGesture,
  scrollEnabled,
  onScrollOffset,
  onContentHeight,
  children,
}: {
  position: number;
  progress: SharedValue<number>;
  pitch: number;
  width: number;
  current: boolean;
  sheetGesture: SheetGesture;
  scrollEnabled: boolean;
  onScrollOffset: SharedValue<number>;
  onContentHeight?: (height: number) => void;
  children: ReactNode;
}) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const slotStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (position - progress.value) * pitch }],
  }));

  const nativeConfig = useMemo(() => ({ simultaneousWith: sheetGesture }), [sheetGesture]);
  const native = useNativeGesture(nativeConfig);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      if (current) onScrollOffset.value = event.contentOffset.y;
    },
  });

  // Cached, because a card's size is only reported when it lays out, and the
  // neighbour a swipe lands on laid out while it was still off to the side.
  const contentHeight = useRef<number | null>(null);
  const handleContentSize = useCallback(
    (_width: number, height: number) => {
      contentHeight.current = height;
      if (current) onContentHeight?.(height);
    },
    [current, onContentHeight],
  );
  useEffect(() => {
    if (current && contentHeight.current !== null) onContentHeight?.(contentHeight.current);
  }, [current, onContentHeight]);

  const readable = current && scrollEnabled;
  // A card leaving the front, or a sheet coming down to rest, goes back to its
  // top: at rest the card is its kicker, title and lead, never its middle.
  useEffect(() => {
    if (readable) return;
    scrollRef.current?.scrollTo({ y: 0, animated: current });
    if (current) onScrollOffset.value = 0;
  }, [current, onScrollOffset, readable, scrollRef]);

  return (
    <Animated.View
      style={[styles.slot, { width }, slotStyle]}
      pointerEvents={current ? 'auto' : 'none'}
      accessibilityElementsHidden={!current}
      importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}
    >
      <GestureDetector gesture={native}>
        <Animated.ScrollView
          ref={scrollRef}
          style={styles.fill}
          scrollEnabled={readable}
          onScroll={scrollHandler}
          onContentSizeChange={handleContentSize}
          scrollEventThrottle={16}
          bounces={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </Animated.ScrollView>
      </GestureDetector>
    </Animated.View>
  );
});

export const StoryDeck = memo(function StoryDeck({
  count,
  index,
  progress,
  width,
  sheetGesture,
  scrollEnabled,
  onScrollOffset,
  onContentHeight,
  keyOf,
  renderStory,
  renderEnd,
  onDragStart,
  onSettle,
}: StoryDeckProps) {
  const pitch = Math.max(1, width - DECK_CUT);
  /** Where the card was when the pan claimed it, and the finger's translation then. */
  const start = useSharedValue(0);
  const startX = useSharedValue(0);
  /** The story last handed to `onSettle`, so a caught card is not re-committed. */
  const committed = useSharedValue(index);
  useEffect(() => {
    committed.value = index;
  }, [committed, index]);

  const panConfig = useMemo(
    () => ({
      activeOffsetX: [-16, 16] as [number, number],
      failOffsetY: [-12, 12] as [number, number],
      onActivate: (e: { translationX: number }) => {
        'worklet';
        // Catch a card that is still landing where it is, not where it was going.
        cancelAnimation(progress);
        start.value = progress.value;
        startX.value = e.translationX;
        scheduleOnRN(onDragStart);
      },
      onUpdate: (e: { translationX: number }) => {
        'worklet';
        progress.value = rubberBand(start.value - (e.translationX - startX.value) / pitch, count);
      },
      onDeactivate: (e: { translationX: number; velocityX: number }) => {
        'worklet';
        const position = start.value - (e.translationX - startX.value) / pitch;
        const velocity = -e.velocityX / pitch;
        const target = deckTarget(Math.round(start.value), position, velocity, count);
        progress.value = withSpring(target, {
          duration: SETTLE_MS,
          dampingRatio: 1,
          velocity,
          overshootClamping: true,
        });
        if (target !== committed.value) {
          committed.value = target;
          scheduleOnRN(onSettle, target);
        }
      },
    }),
    [committed, count, onDragStart, onSettle, pitch, progress, start, startX],
  );
  const pan = usePanGesture(panConfig);

  const slots: number[] = [];
  for (let i = Math.max(0, index - 1); i <= Math.min(count, index + 1); i++) slots.push(i);

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.fill}>
        {slots.map((i) => (
          <DeckSlot
            key={keyOf(i)}
            position={i}
            progress={progress}
            pitch={pitch}
            width={width}
            current={i === index}
            sheetGesture={sheetGesture}
            scrollEnabled={scrollEnabled}
            onScrollOffset={onScrollOffset}
            onContentHeight={onContentHeight}
          >
            {i === count ? renderEnd() : renderStory(i)}
          </DeckSlot>
        ))}
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  slot: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
