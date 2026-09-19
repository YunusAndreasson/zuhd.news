import {
  memo,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
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
import { ANIMATION, KEEP_MOTION } from '../../constants/theme';
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
 * ## The next button
 *
 * The dock's `›` is `step(1)` on this deck's ref, and it lands exactly as a
 * swipe released past halfway would: the same `onDragStart` first, so the
 * camera is handed over the same way, the same spring, the same `onSettle`.
 * It is not `focusStory` — a jump and a flight are for a story twenty cards
 * away, and the one beside the card should slide in. A second tap before the
 * first has landed goes one further, not to the same story again.
 *
 * ## Three mounted cards
 *
 * The current one and its neighbours. A card's content only ever changes while
 * it is off screen, and a card that stops being current scrolls back to its
 * top, so every card arrives showing its kicker.
 */

/** Neighbours fade in as they enter during a horizontal swipe. */
const PEEK_OPACITY = 0.4;

type SheetGesture = ReturnType<typeof usePanGesture>;

export interface StoryDeckRef {
  /** Move the deck `delta` stories, as a completed swipe would. */
  step: (delta: number) => void;
}

interface StoryDeckProps {
  /** Stories in the river. The end card sits at index `count`. */
  count: number;
  /** 0 at rest, 1 grown: the neighbours' peek fades while a story is read, so
   *  the next headline does not sit beside the reading column. */
  peekFade?: SharedValue<number>;
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
  /** Room left under the cards for the dock pinned over the sheet's foot. */
  bottomInset?: number;
  keyOf: (index: number) => string;
  renderStory: (index: number) => ReactNode;
  renderEnd: () => ReactNode;
  /** A finger has started a swipe. Must be a stable, named callback. */
  onDragStart: () => void;
  /** A worklet, run on the UI thread as the pan claims a swipe, before
   *  `onDragStart` reaches JS: whatever must be decided on the frame the card
   *  starts to move (whether the camera follows the finger). */
  onClaim?: () => void;
  /** The swipe ended on a different story. Must be a stable, named callback. */
  onSettle: (index: number) => void;
  ref?: Ref<StoryDeckRef>;
}

const DeckSlot = memo(function DeckSlot({
  position,
  restOffset,
  progress,
  peekFade,
  pitch,
  width,
  current,
  sheetGesture,
  scrollEnabled,
  onScrollOffset,
  children,
}: {
  position: number;
  /** Where this slot rests relative to the committed story, for its first style. */
  restOffset: number;
  progress: SharedValue<number>;
  peekFade?: SharedValue<number>;
  pitch: number;
  width: number;
  current: boolean;
  sheetGesture: SheetGesture;
  scrollEnabled: boolean;
  onScrollOffset: SharedValue<number>;
  children: ReactNode;
}) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const slotStyle = useAnimatedStyle(() => {
    // Reanimated runs this once on the JS thread when the slot mounts, for its
    // first style. A slot mounts as a swipe lands, while the spring is writing
    // `progress` on the UI thread, and a JS read of a value the UI thread has
    // changed blocks until the UI thread answers (`runOnUISync`): 150–290 ms
    // of every landing's commit on the emulator, with the globe's reproject
    // queued behind it. So the first style is the one the slot rests at,
    // computed from props, and the UI mapper, which starts straight after,
    // draws the real one; a frame drawn before it takes over matches at rest.
    if (globalThis.__RUNTIME_KIND === 1) {
      const rest = Math.min(1, Math.abs(restOffset));
      return {
        opacity: 1 - (1 - PEEK_OPACITY) * rest,
        transform: [{ translateX: restOffset * pitch }],
      };
    }
    const offset = position - progress.value;
    const away = Math.min(1, Math.abs(offset));
    // A resting neighbour fades with the grown sheet; one being swiped in comes
    // back as it arrives, so a swipe while reading still shows what is coming.
    const fade = peekFade ? Math.min(1, Math.max(0, peekFade.value)) : 0;
    return {
      opacity: (1 - (1 - PEEK_OPACITY) * away) * (1 - fade * away),
      transform: [{ translateX: offset * pitch }],
    };
    // `restOffset` only picks the first style; left to the closure it would
    // restart this mapper on every slot at every landing.
  }, [position, pitch, progress, peekFade]);

  const nativeConfig = useMemo(() => ({ simultaneousWith: sheetGesture }), [sheetGesture]);
  const native = useNativeGesture(nativeConfig);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      if (current) onScrollOffset.value = event.contentOffset.y;
    },
  });

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
  peekFade,
  index,
  progress,
  width,
  sheetGesture,
  scrollEnabled,
  onScrollOffset,
  bottomInset = 0,
  keyOf,
  renderStory,
  renderEnd,
  onDragStart,
  onClaim,
  onSettle,
  ref,
}: StoryDeckProps) {
  // Use the full reading width at both detents. The scrubber signals more
  // stories; reserving a neighbour preview narrowed every paragraph, even
  // when expanded. A fixed width also avoids reflow during vertical drags.
  const pitch = Math.max(1, width);
  const slotWidth = pitch;
  /** Where the card was when the pan claimed it, and the finger's translation then. */
  const start = useSharedValue(0);
  const startX = useSharedValue(0);
  /** The story last handed to `onSettle`, so a caught card is not re-committed. */
  const committed = useSharedValue(index);
  /** Where the last `step` sent the deck, so a second tap before React has
   *  caught up goes one further. JS-side on purpose: reading `committed`
   *  from JS would wait on the UI thread. */
  const stepTarget = useRef(index);
  useEffect(() => {
    committed.value = index;
    stepTarget.current = index;
  }, [committed, index]);

  useImperativeHandle(
    ref,
    () => ({
      step: (delta: number) => {
        const target = Math.max(0, Math.min(count, stepTarget.current + delta));
        if (target === stepTarget.current) return;
        stepTarget.current = target;
        onDragStart();
        // A tap is not a finger carrying the card, so it takes the plain
        // landing, which Reanimated snaps under Reduce Motion; a released
        // swipe keeps its spring (`KEEP_MOTION`) because it continues a hand.
        progress.value = withSpring(target, ANIMATION.springSettle);
        committed.value = target;
        onSettle(target);
      },
    }),
    [committed, count, onDragStart, onSettle, progress],
  );

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
        if (onClaim) onClaim();
        scheduleOnRN(onDragStart);
      },
      onUpdate: (e: { translationX: number }) => {
        'worklet';
        progress.value = rubberBand(start.value - (e.translationX - startX.value) / pitch, count);
      },
      onDeactivate: (e: { translationX: number; velocityX: number; canceled: boolean }) => {
        'worklet';
        const position = start.value - (e.translationX - startX.value) / pitch;
        const velocity = e.canceled ? 0 : -e.velocityX / pitch;
        // Cancellation is a rollback, even if the finger crossed a story or
        // caught a spring on its way to the already committed story.
        const target = e.canceled
          ? committed.value
          : deckTarget(Math.round(start.value), position, velocity, count);
        // Critically damped, so a card arrives without a bounce the globe
        // would have to follow past a dateline.
        progress.value = withSpring(target, {
          ...ANIMATION.springSettle,
          ...KEEP_MOTION,
          velocity,
        });
        if (target !== committed.value) {
          committed.value = target;
          scheduleOnRN(onSettle, target);
        }
      },
    }),
    [committed, count, onClaim, onDragStart, onSettle, pitch, progress, start, startX],
  );
  const pan = usePanGesture(panConfig);

  const slots: number[] = [];
  for (let i = Math.max(0, index - 1); i <= Math.min(count, index + 1); i++) slots.push(i);

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.fill, { marginBottom: bottomInset }]}>
        {slots.map((i) => (
          <DeckSlot
            key={keyOf(i)}
            position={i}
            restOffset={i - index}
            progress={progress}
            peekFade={peekFade}
            pitch={pitch}
            width={slotWidth}
            current={i === index}
            sheetGesture={sheetGesture}
            scrollEnabled={scrollEnabled}
            onScrollOffset={onScrollOffset}
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
