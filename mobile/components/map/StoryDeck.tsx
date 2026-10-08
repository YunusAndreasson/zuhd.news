import {
  memo,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  type NativeGestureConfig,
  type PanGestureConfig,
  useNativeGesture,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  type SharedValue,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { ANIMATION, KEEP_MOTION } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { sameItems } from '../../lib/arrays';
import { assignSlots } from '../../lib/deck-slots';
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
 * ## A release is told twice: to the hand at the lift, to the screen at the landing
 *
 * `onRelease` runs as the finger lifts and is the hand's half: the haptic, the
 * announcement, the camera. `onSettle` runs when the card is on its story and
 * is where React is told. It used to be one call at the lift, and the commit
 * it caused — the screen, the sheet, the dock, a recycled card's whole text —
 * fell in the first frames of the spring: Reanimated holds its own frames back
 * from a React commit until that commit has mounted, so the card stood still
 * exactly where it moves fastest (`MapSheet` learnt the same on 2026-10-07).
 * The slots are positioned by `progress`, not by index, and the three mounted
 * around the story being left still hold every card the spring is passing.
 *
 * The landing is a reaction on the value, never the spring's completion
 * callback: `scheduleOnRN` from one aborted the app once (worklets 0.10).
 *
 * **A finger that comes down before the card has landed tells the screen
 * then.** A second quick flick heads for a story outside those three slots,
 * and React has to hold the first before the second's card exists. From
 * finger-down it has the claim's 16 pt of travel as a head start.
 *
 * ## Stepping without a finger
 *
 * The card's `next story` / `previous story` accessibility actions are
 * `step(±1)` on this deck's ref (the dock's `›` was too, until it went on
 * 2026-09-22), and a step lands as a swipe released past halfway would: the
 * same `onDragStart` first, so the camera is handed over the same way, and the
 * same spring. It tells the screen at the tap, though, not at the landing: a
 * screen reader's focus is on the card that is leaving.
 * It is not `focusStory` — a jump and a flight are for a story twenty cards
 * away, and the one beside the card should slide in. A second step before the
 * first has landed goes one further, not to the same story again.
 *
 * ## Three mounted cards, in three slots that are never remounted
 *
 * The current one and its neighbours. A card's content only ever changes while
 * it is off screen, and a card that stops being current — or a slot that is
 * handed a new story — scrolls back to its top, so every card arrives showing
 * its kicker. A story keeps its slot while it stays in the window
 * (`assignSlots`), so a landing redraws one off-screen slot and a jump redraws
 * three; neither mounts one (2026-09-25).
 */

/** How far a finger travels sideways before the deck's pan claims it. */
const CLAIM_X = 16;

/** How much of a neighbour shows through its dimming at rest; it comes up to
 *  full as it enters during a horizontal swipe. */
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
  committedPosition?: SharedValue<number>;
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
  /** What sits under a story's scroll area — `sources · save · share`
   *  (`StoryFooter`). The end card has none. */
  renderFooter?: (index: number) => ReactNode;
  renderEnd: () => ReactNode;
  /** A finger has started a swipe. Must be a stable, named callback. */
  onDragStart: () => void;
  /** A worklet, run on the UI thread as the pan claims a swipe, before
   *  `onDragStart` reaches JS: whatever must be decided on the frame the card
   *  starts to move (whether the camera follows the finger). */
  onClaim?: (direction: number) => void;
  /** A worklet, run as a swipe snaps back to the story it started on. */
  onRollback?: () => void;
  /** A swipe was let go toward a different story. Runs at the lift and must
   *  set no React state: a commit there holds the landing's first frames
   *  back. Must be a stable, named callback. */
  onRelease: (index: number) => void;
  /** The card is on that story, or a finger came down before it was: where
   *  the screen is told. Must be a stable, named callback. */
  onSettle: (index: number) => void;
  ref?: Ref<StoryDeckRef>;
}

const DeckSlot = memo(function DeckSlot({
  position,
  restOffset,
  storyKey,
  progress,
  peekFade,
  pitch,
  width,
  current,
  sheetGesture,
  scrollEnabled,
  onScrollOffset,
  footer,
  children,
}: {
  /** Set under the scroll area: straight after a story that fits, and at the
   *  slot's foot while a longer one scrolls above it. */
  footer?: ReactNode;
  position: number;
  /** The story drawn here. A slot outlives its stories (`assignSlots`). */
  storyKey: string;
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
  const { colors } = useTheme();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Reanimated runs both styles once on the JS thread when the slot mounts,
  // for their first values. A slot mounted as every swipe landed until slots
  // were recycled (2026-09-25), and still can mid-spring when the window first
  // grows to three, while the spring is writing
  // `progress` on the UI thread, and a JS read of a value the UI thread has
  // changed blocks until the UI thread answers (`runOnUISync`): 150–290 ms
  // of every landing's commit on the emulator, with the globe's reproject
  // queued behind it. So the first style is the one the slot rests at,
  // computed from props, and the UI mapper, which starts straight after,
  // draws the real one; a frame drawn before it takes over matches at rest.
  // `restOffset` only picks that first style; left to the closure it would
  // restart these mappers on every slot at every landing.
  //
  // **The slide and the dimming are two styles, and the sheet moves neither**
  // (2026-10-03). As one style, every frame of a story opening or closing
  // updated all three slots on the native side: `peekFade` is the sheet's
  // rise, and Reanimated skips an update only when every value is the same
  // object, which a fresh `transform` array never is — so the card in front,
  // whose numbers do not change, was re-sent each frame, and the neighbours
  // off screen were re-faded. The slide reads only the deck's `progress`.
  const slideStyle = useAnimatedStyle(() => {
    if (globalThis.__RUNTIME_KIND === 1) {
      return { transform: [{ translateX: restOffset * pitch }] };
    }
    return { transform: [{ translateX: (position - progress.value) * pitch }] };
  }, [position, pitch, progress]);
  // **A neighbour is dimmed by a veil of the sheet's ground, not by its own
  // opacity** (2026-10-03). On iOS a translucent view with sublayers is drawn
  // off screen as a group on every frame its opacity is between 0 and 1 — the
  // lesson of the story veil — and a slot is a whole card, faded on every
  // frame of a swipe. A plain view of `sheetBg` over the card is one layer,
  // and the picture is the same: the sheet is solid `sheetBg` behind every
  // slot, so a card at 40% over it is the card under a 60% veil of it.
  //
  // A resting neighbour fades with the grown sheet; one being swiped in comes
  // back as it arrives, so a swipe while reading still shows what is coming.
  // The sheet's rise is read as open or not: the neighbours are off screen
  // while it moves, so a fade tracking it drew nothing and cost a frame each.
  const dimStyle = useAnimatedStyle(() => {
    if (globalThis.__RUNTIME_KIND === 1) {
      return { opacity: (1 - PEEK_OPACITY) * Math.min(1, Math.abs(restOffset)) };
    }
    const away = Math.min(1, Math.abs(position - progress.value));
    const fade = peekFade && peekFade.value > 0.5 ? 1 : 0;
    return { opacity: 1 - (1 - (1 - PEEK_OPACITY) * away) * (1 - fade * away) };
  }, [position, progress, peekFade]);

  const nativeConfig = useMemo(
    (): NativeGestureConfig => ({ simultaneousWith: sheetGesture }),
    [sheetGesture],
  );
  const native = useNativeGesture(nativeConfig);
  const scrollPosition = useSharedValue(0);
  const closingScroll = useSharedValue(0);
  const closingProgress = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      scrollPosition.value = event.contentOffset.y;
      if (current) onScrollOffset.value = event.contentOffset.y;
    },
  });

  // A scrolled story returns to its headline with the descending sheet,
  // driven by the very same progress. A separate native scroll animation
  // drifted from the spring (or started after it), making closing look jerky.
  useAnimatedReaction(
    () => peekFade?.value ?? 0,
    (next, previous) => {
      if (!current || previous === null || next >= previous) {
        closingProgress.value = 0;
        return;
      }
      if (closingProgress.value === 0) {
        closingScroll.value = Math.max(0, scrollPosition.value);
        closingProgress.value = previous;
      }
      if (closingScroll.value === 0) return;
      const y = closingScroll.value * Math.max(0, next / closingProgress.value);
      scrollTo(scrollRef, 0, y, false);
      scrollPosition.value = y;
      onScrollOffset.value = y;
    },
  );

  const readable = current && scrollEnabled;
  // **An open story says it goes on.** Most open stories scroll — the open
  // sheet is one height, and the cap binds on a phone (`lib/deck-layout.ts`) —
  // and with no indicator, the last block, the chart and `sources · save ·
  // share` sat below an edge that looked like the story's end. The platform's
  // own sign, then: the indicator while a story scrolls, flashed once as it
  // becomes the one being read (opened, or swiped to while open), and only
  // when there is more than fits — both platforms draw nothing otherwise.
  useEffect(() => {
    if (readable) scrollRef.current?.flashScrollIndicators();
  }, [readable, scrollRef]);
  // A card leaving the front, or a sheet coming down to rest, goes back to its
  // top: at rest the card is its kicker, title and lead, never its middle.
  useEffect(() => {
    if (readable) return;
    // The current card's reset is synchronized with the closing spring above.
    // Off-screen slots (and callers without sheet progress) reset immediately.
    if (current && peekFade) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    scrollPosition.value = 0;
    if (current) onScrollOffset.value = 0;
  }, [current, onScrollOffset, peekFade, readable, scrollPosition, scrollRef]);
  // **A slot that comes to the front says it is at its top** (2026-10-03,
  // found on the emulator). The sheet reads this offset to decide whether a
  // downward drag on an open story closes it (`MapSheet`, `atTop`), and only
  // the front slot writes it — as it scrolls. So after a long story was
  // scrolled and the reader swiped on, the offset was still the story they
  // had left: the next one could not be pulled down, and one too short to
  // scroll could never correct it. A slot is always at its top when it
  // arrives — it was put back there when it left the front (above) — so this
  // is a write, never a read of the scroll position.
  useEffect(() => {
    if (current) onScrollOffset.value = 0;
  }, [current, onScrollOffset]);
  // A new story in this slot starts at its top, even open: a jump from a
  // story read halfway down would otherwise open the next one there.
  const shownKey = useRef(storyKey);
  useEffect(() => {
    if (shownKey.current === storyKey) return;
    shownKey.current = storyKey;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    scrollPosition.value = 0;
    if (current) onScrollOffset.value = 0;
  }, [current, onScrollOffset, scrollPosition, scrollRef, storyKey]);

  return (
    <Animated.View
      style={[styles.slot, { width }, slideStyle]}
      pointerEvents={current ? 'auto' : 'none'}
      accessibilityElementsHidden={!current}
      importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}
    >
      {/* **The scroll area is as tall as its story, up to the room there is**
          (`styles.fit`), and the footer comes straight after it. So a story
          that fits ends on its footer with the spare sheet below, and a longer
          one fills the slot and scrolls above a footer held at its foot —
          layout's own doing, with nothing measured. Sized to fill, the footer
          sat at the foot whatever the text did, and a short story had a hole
          between its last line and its buttons (tried 2026-09-19). */}
      <GestureDetector gesture={native}>
        <Animated.ScrollView
          ref={scrollRef}
          style={footer ? styles.fit : styles.fill}
          scrollEnabled={readable}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          bounces={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={readable}
        >
          {children}
        </Animated.ScrollView>
      </GestureDetector>
      {/* Pressed only on the story being read: at rest it lies under the
          dock, off screen, where a screen reader would still find it. */}
      {footer ? (
        <View
          pointerEvents={readable ? 'auto' : 'none'}
          accessibilityElementsHidden={!readable}
          importantForAccessibility={readable ? 'auto' : 'no-hide-descendants'}
        >
          {footer}
        </View>
      ) : null}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.sheetBg }, dimStyle]}
        pointerEvents="none"
        importantForAccessibility="no"
      />
    </Animated.View>
  );
});

export const StoryDeck = memo(function StoryDeck({
  count,
  peekFade,
  index,
  progress,
  committedPosition,
  width,
  sheetGesture,
  scrollEnabled,
  onScrollOffset,
  bottomInset = 0,
  keyOf,
  renderStory,
  renderFooter,
  renderEnd,
  onDragStart,
  onClaim,
  onRollback,
  onRelease,
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
  const localCommitted = useSharedValue(index);
  const committed = committedPosition ?? localCommitted;
  /** The story the screen holds or has been sent. `committed` leads it by a
   *  landing: the gap is a swipe let go whose card is still on its way. */
  const landed = useSharedValue(index);
  /** Where the last swipe or `step` sent the deck, so a step before React has
   *  caught up goes one further. JS-side on purpose: reading `committed`
   *  from JS would wait on the UI thread. */
  const stepTarget = useRef(index);
  useEffect(() => {
    // A queued render must not undo a newer scrub or swipe. External jumps
    // put progress at their index. A landing the deck reported itself is
    // committed already, and syncing it again could pull `committed` back
    // under a swipe let go since.
    scheduleOnUI((next: number) => {
      'worklet';
      if (landed.value === next || progress.value !== next) return;
      committed.value = next;
      landed.value = next;
    }, index);
    stepTarget.current = index;
  }, [committed, index, landed, progress]);

  const release = useCallback(
    (target: number) => {
      stepTarget.current = target;
      onRelease(target);
    },
    [onRelease],
  );

  // The spring ends on its target exactly, so the test is equality, and a
  // finger on the deck never sees it fire: `onBegin` has already sent
  // whatever landing was owed.
  useAnimatedReaction(
    () => (progress.value === committed.value ? committed.value : -1),
    (at) => {
      if (at < 0 || at === landed.value) return;
      landed.value = at;
      scheduleOnRN(onSettle, at);
    },
  );

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
        landed.value = target;
        onRelease(target);
        onSettle(target);
      },
    }),
    [committed, count, landed, onDragStart, onRelease, onSettle, progress],
  );

  // The builder's return type, not the `useMemo`'s type argument: only the
  // first checks the literal for keys it does not know (a v2 `onEnd` beside
  // valid keys compiles and never fires otherwise), and it types the events.
  const panConfig = useMemo(
    (): PanGestureConfig => ({
      activeOffsetX: [-CLAIM_X, CLAIM_X],
      failOffsetY: [-12, 12],
      onBegin: () => {
        'worklet';
        if (landed.value === committed.value) return;
        landed.value = committed.value;
        scheduleOnRN(onSettle, committed.value);
      },
      onActivate: (e) => {
        'worklet';
        // Catch a card that is still landing where it is, not where it was going.
        cancelAnimation(progress);
        start.value = progress.value;
        // From the claim's threshold, not from wherever the claim happened.
        // Measured from touch-down the card jumped the 16 pt the claim waits
        // for; measured from the claiming event, a swipe whose events arrived
        // in a burst — the first move already 200 pt out, which a busy UI
        // thread delivers — kept only its last few points and snapped back:
        // two quick flicks moved one story (2026-09-24, logged on the
        // emulator: claimed, then released 5 ms later at −2.4 pt).
        startX.value = Math.sign(e.translationX) * Math.min(Math.abs(e.translationX), CLAIM_X);
        // Heading for the next story when the finger moves left.
        if (onClaim) onClaim(e.translationX < 0 ? 1 : -1);
        scheduleOnRN(onDragStart);
      },
      onUpdate: (e) => {
        'worklet';
        progress.value = rubberBand(start.value - (e.translationX - startX.value) / pitch, count);
      },
      onDeactivate: (e) => {
        'worklet';
        const position = start.value - (e.translationX - startX.value) / pitch;
        const velocity = e.canceled ? 0 : -e.velocityX / pitch;
        // Cancellation is a rollback, even if the finger crossed a story or
        // caught a spring on its way to the already committed story.
        // One story from the *committed* story, not from where the finger
        // caught the card: a second flick that catches the first early in its
        // landing found the card still nearer the story being left, and its
        // one-story cap stopped it at the story already committed — two quick
        // flicks moved one story (2026-09-24, 4 of 4 on the emulator).
        const target = e.canceled
          ? committed.value
          : deckTarget(committed.value, position, velocity, count);
        // Critically damped, so a card arrives without a bounce the globe
        // would have to follow past a dateline.
        progress.value = withSpring(target, {
          ...ANIMATION.springSettle,
          ...KEEP_MOTION,
          velocity,
        });
        if (target !== committed.value) {
          committed.value = target;
          scheduleOnRN(release, target);
        } else if (onRollback) {
          onRollback();
        }
      },
    }),
    [
      committed,
      count,
      landed,
      onClaim,
      onDragStart,
      onRollback,
      onSettle,
      pitch,
      progress,
      release,
      start,
      startX,
    ],
  );
  const pan = usePanGesture(panConfig);

  const slots: number[] = [];
  for (let i = Math.max(0, index - 1); i <= Math.min(count, index + 1); i++) slots.push(i);
  const windowKeys = slots.map(keyOf);
  // Slots are recycled, not remounted: keyed by the slot a story holds, never
  // by the story. Keyed by slug, every landing mounted a whole card — its
  // scroll view, native gesture, animated style and scroll handler, all set
  // up and torn down on the JS thread and all created as views on the UI
  // thread as the spring settled — and a jump mounted three. Now the card
  // entering the window is drawn in the slot the one leaving gave up, off
  // screen on both sides, and a jump redraws the three slots it has.
  const [assigned, setAssigned] = useState(() => ({
    keys: windowKeys,
    slots: assignSlots(windowKeys, new Map()),
  }));
  let slotOf = assigned.slots;
  if (!sameItems(assigned.keys, windowKeys)) {
    slotOf = assignSlots(windowKeys, assigned.slots);
    setAssigned({ keys: windowKeys, slots: slotOf });
  }

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.fill, { marginBottom: bottomInset }]}>
        {slots.map((i, j) => (
          <DeckSlot
            key={`slot-${slotOf.get(windowKeys[j] ?? '') ?? j}`}
            storyKey={windowKeys[j] ?? ''}
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
            footer={i === count ? undefined : renderFooter?.(i)}
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
  // Its content's height, and no taller than what the footer leaves it.
  fit: { flexGrow: 0, flexShrink: 1 },
  slot: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
