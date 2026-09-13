import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, useNativeGesture, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ANIMATION, SPACING } from '../../constants/theme';

/**
 * The river, one story at a time, swiped sideways.
 *
 * ## Why sideways
 *
 * The sheet's vertical axis is already spoken for twice — pulling the sheet up
 * reads the story, and a grown story scrolls. The horizontal axis on the sheet
 * was free: the strip scrolls sideways too, but at the other end of the screen
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

/** How much of the next card shows at the right edge. The only sign the row
 *  continues — no dots, no `3 / 48`. */
export const DECK_CUT = SPACING.smPlus;
/** Share of a card's width a drag must cover to commit to the next story. */
const COMMIT = 0.28;
/** A flick this fast commits regardless of distance. */
const FLICK_VELOCITY = 550;
/** Past either end the deck follows the finger at a fraction of it. */
const RUBBER = 0.25;

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
  const start = useSharedValue(0);

  const panConfig = useMemo(
    () => ({
      activeOffsetX: [-16, 16] as [number, number],
      failOffsetY: [-12, 12] as [number, number],
      onActivate: () => {
        'worklet';
        start.value = Math.round(progress.value);
        scheduleOnRN(onDragStart);
      },
      onUpdate: (e: { translationX: number }) => {
        'worklet';
        let next = start.value - e.translationX / pitch;
        if (next < 0) next *= RUBBER;
        else if (next > count) next = count + (next - count) * RUBBER;
        progress.value = next;
      },
      onDeactivate: (e: { translationX: number; velocityX: number }) => {
        'worklet';
        const base = start.value;
        const moved = -e.translationX / pitch;
        const velocity = -e.velocityX;
        let target = base;
        if (moved > COMMIT || velocity > FLICK_VELOCITY) target = base + 1;
        else if (moved < -COMMIT || velocity < -FLICK_VELOCITY) target = base - 1;
        if (target < 0) target = 0;
        if (target > count) target = count;
        progress.value = withSpring(target, {
          ...ANIMATION.springSoft,
          velocity: velocity / pitch,
          overshootClamping: true,
        });
        if (target !== base) scheduleOnRN(onSettle, target);
      },
    }),
    [count, onDragStart, onSettle, pitch, progress, start],
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
