import {
  type ReactElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  interpolateColor,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ANIMATION, KEEP_MOTION, LAYOUT, RADIUS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { hapticTick } from '../../lib/haptics';

/**
 * The persistent sheet over the globe — where the news is read.
 *
 * It is hand-built rather than an `@expo/ui` platform sheet, and that is not a
 * preference. Every other sheet in this app is a platform sheet (SwiftUI on
 * iOS, Material3 `ModalBottomSheet` on Android) and should stay one. But a
 * platform sheet is *modal*: it scrims what is behind it, it caps Android at
 * two states it chooses, and it cannot be shown without taking the screen.
 * This sheet is never dismissed and the earth behind it has to stay live and
 * touchable, which no modal can do.
 *
 * ## Two detents, not three
 *
 * Peek and full, and they are one story at two depths: at peek the story card
 * — kicker, title, the hook — and at full the same card grown into the whole
 * story, with the globe still above it. **Full is one height for every story**
 * (`lib/deck-layout.ts`). It used to be each story's own height, and a swipe
 * while reading sprang the sheet, the globe and the text to the next story's
 * height — the text jumped on every story, which is what the reader noticed.
 * A middle stop would be a third place to leave a card with nothing that
 * belongs there. There is no full-screen reader to hand off to; a modal
 * reader was intrusive and lost the earth.
 *
 * The dock under it — the story track and its buttons — is not part of this
 * view. It is pinned to the screen, so it does not move with the sheet, and
 * the content leaves room for it at the bottom.
 *
 * ## Gesture ownership
 *
 * Three rules, and each removes a class of conflict rather than arbitrating it:
 *
 *  1. **At peek the list does not scroll at all** (`scrollEnabled` follows the
 *     settled detent, so it never changes under a finger). Every drag on the
 *     sheet is therefore a sheet drag, with nothing to arbitrate.
 *  2. **The list never bounces.** With `bounces={false}`, a list already at
 *     the top that is pulled down does nothing — so the pan can take that drag
 *     simultaneously without the content rubber-banding under it.
 *  3. **The pan decides once per gesture, on its first directed update, and holds.**
 *     A drag that starts as the list's stays the list's to the release. Half a
 *     swipe moving the sheet and half scrolling the list is the failure mode
 *     that made the article pager's nested-scroll guards necessary, and it is
 *     cheaper to refuse than to correct.
 *
 * `progress` (0 at peek, 1 at full) is published so the globe can translate
 * and fade as the sheet rises. It must never drive a reprojection: a transform
 * is free and `callReproject` is ~5 ms, and the sheet moves at 60fps.
 */

export interface MapSheetRef {
  expand: () => void;
  collapse: () => void;
}

export type MapSheetDetent = 'peek' | 'full';

type SheetGesture = ReturnType<typeof usePanGesture>;

interface MapSheetProps {
  /** Visible height at rest, in px. */
  peek: number;
  /** Height with a story open, in px — the same for every story. */
  full: number;
  /** 0 at peek, 1 at full. Read by the globe; written only from here. */
  progress: SharedValue<number>;
  /**
   * The content under the header. It owns its own gesture detectors: any
   * scroll view inside must wrap itself in a native gesture that is
   * `simultaneousWith: sheetGesture` (rule 2's pairing), must not bounce, and
   * must write its raw content offset to `onScrollOffset` — that is what the
   * pan reads to decide whether a downward drag at full is a collapse.
   *
   * Must carry `flex: 1`: it is the flexible child of the sheet's column.
   */
  renderList: (props: {
    scrollEnabled: boolean;
    onScrollOffset: SharedValue<number>;
    sheetGesture: SheetGesture;
  }) => ReactElement;
  onDetentChange?: (detent: MapSheetDetent) => void;
  /**
   * A pull on the sheet at rest, past `PULL_TRIGGER`. The list cannot host
   * pull-to-refresh — pulled down at its top it belongs to the sheet — so the
   * gesture lives one level out, on the sheet that has nowhere lower to go.
   */
  onPullDown?: () => void;
  ref?: React.Ref<MapSheetRef>;
}

/** A flick this fast decides the detent regardless of where the finger got to
 *  — the gesture was a throw, not a placement. */
const FLICK_VELOCITY = 550;

/** How far a drag must travel before the pan claims it, so a tap on a row
 *  does not nudge the sheet. */
const CLAIM_SLOP = 8;

/** How far past peek a pull must carry the finger, in points, to ask for a
 *  refresh — and the share of that travel the sheet visibly follows. */
const PULL_TRIGGER = 72;
const PULL_RESISTANCE = 0.35;

/** The two detents, as accessibility actions. */
const ADJUST_ACTIONS = [{ name: 'increment' as const }, { name: 'decrement' as const }];

/** Who owns the current drag. Decided once, on the first update. */
const UNDECIDED = 0;
const SHEET = 1;
const LIST = 2;

export function MapSheet({
  peek,
  full,
  progress,
  renderList,
  onDetentChange,
  onPullDown,
  ref,
}: MapSheetProps) {
  const { colors } = useTheme();
  const [detent, setDetent] = useState<MapSheetDetent>('peek');
  const committedDetent = useSharedValue<MapSheetDetent>('peek');

  // Travel: `full - peek` px between the two stops. `offset` is how far the
  // sheet is pushed down from its expanded position: 0 open, `travel` at peek.
  const travel = Math.max(1, full - peek);
  const offset = useSharedValue(travel);
  // The reaction below reads this, not the render-time number. A reaction
  // closes over what it was created with, and when the window changed size the
  // old one fired on the re-pinned offset with the old travel — a progress of
  // 0.3 at rest, which drew the globe shrunk and shifted up until the sheet
  // was next moved. Nothing re-runs the new reaction until a value it reads
  // changes, so the value has to be shared.
  const travelSV = useSharedValue(travel);
  const dragStart = useSharedValue(travel);
  const dragStartY = useSharedValue(0);
  const owner = useSharedValue(UNDECIDED);
  const listOffset = useSharedValue(0);
  // Finger travel past peek during a pull, for the refresh trigger.
  const pull = useSharedValue(0);

  // A tick right when the pull crosses the trigger — while still held, not
  // only on release — so the finger learns "that's enough" before it lifts.
  // The reaction's own `previous` argument gives the edge for free; no extra
  // shared value needed to avoid repeating it every frame past the trigger.
  useAnimatedReaction(
    () => pull.value >= PULL_TRIGGER,
    (ready, wasReady) => {
      if (ready && !wasReady) scheduleOnRN(hapticTick);
    },
  );

  // Published for the globe, which translates and fades as the sheet rises.
  // A reaction, not `useDerivedValue`: this writes to a value the screen owns,
  // which is a side effect, and a derived value is meant to be a pure function
  // of its inputs — Reanimated is free to evaluate one lazily or not at all
  // when nothing reads *it*, and here nothing does.
  useAnimatedReaction(
    // Clamped: a pull stretches the sheet below peek, and the globe's fade
    // must not read that as a negative rise.
    () => Math.max(0, Math.min(1, (travelSV.value - offset.value) / travelSV.value)),
    (next) => {
      progress.value = next;
    },
  );

  // The last detent the sheet settled on, held in a ref so `settle` can
  // decide whether anything changed *before* touching state. The haptic and
  // the parent's callback used to run inside a `setDetent` updater — which
  // React calls during render, so it fired twice under StrictMode and, once a
  // parent started keeping the detent in its own state, would have been a
  // setState on another component in the middle of this one's render.
  const detentRef = useRef<MapSheetDetent>('peek');

  // `travel` changes once the screen has measured its top chrome, because the
  // expanded stop is "under the gauges" rather than a fixed share of the
  // window. `offset` is in travel's units, so re-pin it to the detent the sheet
  // rests on; left alone, a peeking sheet sits at the old travel and shows a
  // sliver more or less than peek.
  useEffect(() => {
    travelSV.value = travel;
    offset.value = detentRef.current === 'full' ? 0 : travel;
  }, [offset, travel, travelSV]);

  const settle = useCallback(
    (next: MapSheetDetent) => {
      if (detentRef.current === next) return;
      detentRef.current = next;
      hapticTick();
      setDetent(next);
      onDetentChange?.(next);
    },
    [onDetentChange],
  );

  const animateTo = useCallback(
    (target: number, velocity: number, next: MapSheetDetent) => {
      'worklet';
      // Only ever called as a finger lets go, so the spring is the
      // continuation of a direct manipulation and keeps its physics under
      // Reduce Motion (`KEEP_MOTION`) — snapping a thrown sheet to its stop reads
      // as broken, not accessible. A programmatic move (the dock's button, an
      // accessibility action) is a plain `springSettle`, which Reanimated
      // itself snaps when Reduce Motion is on.
      offset.value = withSpring(target, { ...ANIMATION.springSettle, ...KEEP_MOTION, velocity });
      // Publish on the UI thread before the JS callback so a second drag
      // can be canceled back to this stop while JS is still busy.
      committedDetent.value = next;
      scheduleOnRN(settle, next);
    },
    [committedDetent, offset, settle],
  );

  // Named, because `scheduleOnRN` must never be handed an inline arrow from a
  // worklet (the TestFlight 288/289/292 abort), and optional-chained here so the
  // worklet need not know whether a parent passed a handler.
  const handlePullDown = useCallback(() => {
    onPullDown?.();
  }, [onPullDown]);

  const panConfig = useMemo(
    () => ({
      // Vertical drags only; a horizontal swipe on a row belongs to the row.
      activeOffsetY: [-CLAIM_SLOP, CLAIM_SLOP] as [number, number],
      failOffsetX: [-24, 24] as [number, number],
      onBegin: () => {
        'worklet';
        owner.value = UNDECIDED;
        pull.value = 0;
      },
      onActivate: (e: { translationY: number }) => {
        'worklet';
        // Catch a settling sheet at activation, before the first update.
        // A tap or a horizontal swipe must leave its animation running.
        cancelAnimation(offset);
        dragStart.value = offset.value;
        dragStartY.value = e.translationY;
      },
      onUpdate: (e: { translationY: number }) => {
        'worklet';
        if (owner.value === UNDECIDED) {
          // The first update can carry no translation at all — on the
          // emulator it did, on every drag — and a decision taken on a zero
          // reads "not pulling down". That handed every collapse drag on the
          // expanded sheet to the list, so the sheet could not be closed by
          // hand. Wait for a direction.
          if (e.translationY === 0) return;
          const atTop = listOffset.value <= 0.5;
          const pullingDown = e.translationY > 0;
          // Not expanded → nothing below can use a vertical drag.
          // Expanded and already at the top and pulling down → the list has
          // nowhere to go, so the sheet takes it.
          owner.value = offset.value > 0.5 || (atTop && pullingDown) ? SHEET : LIST;
        }
        if (owner.value !== SHEET) return;
        const next = dragStart.value + e.translationY - dragStartY.value;
        if (next > travel) {
          // Past peek the sheet follows at a fraction of the finger, which is
          // what makes a pull read as a pull rather than as a stuck sheet.
          pull.value = next - travel;
          offset.value = travel + pull.value * PULL_RESISTANCE;
        } else {
          pull.value = 0;
          offset.value = next < 0 ? 0 : next;
        }
      },
      onDeactivate: (e: { velocityY: number; canceled: boolean }) => {
        'worklet';
        // Activation already stopped the animation, even if no update chose
        // an owner yet. Always restore it on cancellation, without committing
        // a detent or turning an interrupted pull into a refresh.
        if (e.canceled) {
          owner.value = UNDECIDED;
          pull.value = 0;
          const target = committedDetent.value === 'full' ? 0 : travel;
          offset.value = withSpring(target, { ...ANIMATION.springSettle, velocity: 0 });
          return;
        }
        if (owner.value !== SHEET) return;
        owner.value = UNDECIDED;
        // Only a pull that began at rest. A collapse from full that overshoots
        // peek is a collapse, not a request for new stories.
        if (pull.value >= PULL_TRIGGER && dragStart.value >= travel - 0.5) {
          pull.value = 0;
          animateTo(travel, 0, 'peek');
          scheduleOnRN(handlePullDown);
          return;
        }
        pull.value = 0;
        const v = e.velocityY;
        // A throw decides on its own; otherwise the nearer stop wins.
        const expand =
          v < -FLICK_VELOCITY ? true : v > FLICK_VELOCITY ? false : offset.value < travel / 2;
        animateTo(expand ? 0 : travel, v, expand ? 'full' : 'peek');
      },
      onFinalize: () => {
        'worklet';
        owner.value = UNDECIDED;
      },
    }),
    [
      animateTo,
      committedDetent,
      dragStart,
      dragStartY,
      handlePullDown,
      listOffset,
      offset,
      owner,
      pull,
      travel,
    ],
  );

  const pan = usePanGesture(panConfig);

  useImperativeHandle(
    ref,
    () => ({
      expand: () => {
        offset.value = withSpring(0, ANIMATION.springSettle);
        committedDetent.value = 'full';
        settle('full');
      },
      collapse: () => {
        offset.value = withSpring(travel, ANIMATION.springSettle);
        committedDetent.value = 'peek';
        settle('peek');
      },
    }),
    [committedDetent, offset, settle, travel],
  );

  // The detents reachable without a drag. A sheet whose only control is a
  // gesture is a sheet a switch-control or voice-control user cannot move,
  // and this one is the app's whole list. The same spring as the dock's
  // button: one control, whichever way it is reached.
  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      const expand = event.nativeEvent.actionName === 'increment';
      offset.value = withSpring(expand ? 0 : travel, ANIMATION.springSettle);
      committedDetent.value = expand ? 'full' : 'peek';
      settle(expand ? 'full' : 'peek');
    },
    [committedDetent, offset, settle, travel],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  // The handle stretches and inks in as a pull nears the refresh trigger —
  // the only feedback a pull previously had was the masthead's text, after
  // the gesture had already committed. At rest (`pull` 0) this must draw
  // exactly the static hairline it replaces: `p` is 0 and every term below
  // resolves to the same width/color the plain View used to have. `scaleX`,
  // not `width`, so a pull frame is a transform (UI-thread compositing) and
  // never a layout property, which would re-flow the handle's row every
  // frame of the gesture for no visible difference (`handleWrap` centers it,
  // so scaling from the middle reads identically to widening it).
  const pullIndicatorStyle = useAnimatedStyle(() => {
    const p = Math.min(1, pull.value / PULL_TRIGGER);
    return {
      transform: [{ scaleX: 1 + p * 0.5 }],
      backgroundColor: interpolateColor(p, [0, 1], [colors.rule, colors.textEmphasis]),
    };
  });

  const list = renderList({
    scrollEnabled: detent === 'full',
    onScrollOffset: listOffset,
    sheetGesture: pan,
  });

  return (
    <Animated.View
      style={[
        styles.sheet,
        { height: full, backgroundColor: colors.sheetBg, borderColor: colors.rule },
        sheetStyle,
      ]}
    >
      {/* The pan covers the whole sheet, not just the handle: at peek the
          card does not scroll, so a drag anywhere on it should raise the
          sheet rather than do nothing. The content attaches its own native
          scroll handlers, `simultaneousWith` this pan, so the two run
          together instead of racing. */}
      <GestureDetector gesture={pan}>
        <View style={styles.fill}>
          {/* A hairline indicator and nothing else. The sheet's own top edge
              already reads as an edge against the globe; a second rule under
              the handle would be the same boundary drawn twice. */}
          <View
            style={styles.handleWrap}
            accessibilityRole="adjustable"
            accessibilityLabel="Story"
            accessibilityValue={{ text: detent === 'full' ? 'expanded' : 'collapsed' }}
            accessibilityHint="Swipe up to read the whole story, down to see the globe"
            accessibilityActions={ADJUST_ACTIONS}
            onAccessibilityAction={handleAccessibilityAction}
          >
            <Animated.View style={[styles.indicator, pullIndicatorStyle]} />
          </View>
          <View style={styles.clip}>{list}</View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: RADIUS.floating,
    borderTopRightRadius: RADIUS.floating,
    // The one edge the globe meets. A hairline, not a shadow: the app has no
    // elevation vocabulary and a drop shadow here would be the first.
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  handleWrap: { alignItems: 'center', paddingTop: SPACING.sm, paddingBottom: SPACING.xs },
  indicator: {
    width: LAYOUT.handleWidth,
    height: LAYOUT.handleHeight,
    borderRadius: RADIUS.handle,
  },
  fill: { flex: 1, minHeight: 0 },
  clip: { flex: 1, minHeight: 0, overflow: 'hidden' },
});
