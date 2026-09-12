import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, useNativeGesture, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ANIMATION, EASING, LAYOUT, RADIUS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { hapticTick } from '../../lib/haptics';

/**
 * The persistent sheet over the globe — the app's only list.
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
 * Peek and full. A third middle stop is what a map app needs when the sheet
 * is also the reading surface; here the reader is its own full-screen layer,
 * so the sheet only ever answers two questions — *what is happening* and
 * *show me the list* — and a middle stop would be a third place to leave it
 * with nothing that belongs there.
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
 *     simultaneously without the content rubber-banding under it. This is the
 *     same reason `SectionBar`'s rail sets it.
 *  3. **The pan decides once per gesture, on the first update, and holds.**
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

interface MapSheetProps {
  /** Visible height at rest, in px. */
  peek: number;
  /** Visible height when expanded, in px. */
  full: number;
  /** 0 at peek, 1 at full. Read by the globe; written only from here. */
  progress: SharedValue<number>;
  /** Always visible, above the list. */
  header: ReactNode;
  /**
   * The list, as a single scrollable element — it is handed straight to a
   * `GestureDetector`, so it must be the scroll view itself and not a wrapper.
   * `NativeViewGestureHandler` attaches to the view it is given; a `View` in
   * between and the pan is coordinating with a box that never scrolls.
   *
   * Must carry `flex: 1` (it is the flexible child of the sheet's column) and
   * `bounces={false}` (rule 2 above).
   */
  renderList: (props: {
    scrollEnabled: boolean;
    onScrollOffset: SharedValue<number>;
  }) => ReactElement;
  onDetentChange?: (detent: MapSheetDetent) => void;
  ref?: React.Ref<MapSheetRef>;
}

/** A flick this fast decides the detent regardless of where the finger got to
 *  — the gesture was a throw, not a placement. */
const FLICK_VELOCITY = 550;

/** How far a drag must travel before the pan claims it, so a tap on a row
 *  does not nudge the sheet. */
const CLAIM_SLOP = 8;

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
  header,
  renderList,
  onDetentChange,
  ref,
}: MapSheetProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [detent, setDetent] = useState<MapSheetDetent>('peek');

  // Travel: `full - peek` px between the two stops. `offset` is how far the
  // sheet is pushed down from its expanded position, so peek is the maximum.
  const travel = Math.max(1, full - peek);
  const offset = useSharedValue(travel);
  const dragStart = useSharedValue(travel);
  const owner = useSharedValue(UNDECIDED);
  const listOffset = useSharedValue(0);

  // Published for the globe, which translates and fades as the sheet rises.
  // A reaction, not `useDerivedValue`: this writes to a value the screen owns,
  // which is a side effect, and a derived value is meant to be a pure function
  // of its inputs — Reanimated is free to evaluate one lazily or not at all
  // when nothing reads *it*, and here nothing does.
  useAnimatedReaction(
    () => 1 - offset.value / travel,
    (next) => {
      progress.value = next;
    },
    [travel],
  );

  // The last detent the sheet settled on, held in a ref so `settle` can
  // decide whether anything changed *before* touching state. The haptic and
  // the parent's callback used to run inside a `setDetent` updater — which
  // React calls during render, so it fired twice under StrictMode and, once a
  // parent started keeping the detent in its own state, would have been a
  // setState on another component in the middle of this one's render.
  const detentRef = useRef<MapSheetDetent>('peek');
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
      // The spring is the continuation of a direct manipulation, so it keeps
      // its physics under Reduce Motion — snapping a finger-thrown sheet to
      // its stop reads as broken, not accessible. Only a *programmatic* move
      // (a tap, a return from the reader) shortens, and that comes in with
      // velocity 0.
      offset.value =
        reduceMotion && velocity === 0
          ? withTiming(target, { duration: ANIMATION.fast, easing: EASING.out })
          : withSpring(target, { ...ANIMATION.springSoft, velocity });
      scheduleOnRN(settle, next);
    },
    [offset, reduceMotion, settle],
  );

  const panConfig = useMemo(
    () => ({
      // Vertical drags only; a horizontal swipe on a row belongs to the row.
      activeOffsetY: [-CLAIM_SLOP, CLAIM_SLOP] as [number, number],
      failOffsetX: [-24, 24] as [number, number],
      onBegin: () => {
        'worklet';
        dragStart.value = offset.value;
        owner.value = UNDECIDED;
      },
      onUpdate: (e: { translationY: number }) => {
        'worklet';
        if (owner.value === UNDECIDED) {
          const atTop = listOffset.value <= 0.5;
          const pullingDown = e.translationY > 0;
          // Not expanded → nothing below can use a vertical drag.
          // Expanded and already at the top and pulling down → the list has
          // nowhere to go, so the sheet takes it.
          owner.value = offset.value > 0.5 || (atTop && pullingDown) ? SHEET : LIST;
        }
        if (owner.value !== SHEET) return;
        const next = dragStart.value + e.translationY;
        offset.value = next < 0 ? 0 : next > travel ? travel : next;
      },
      onDeactivate: (e: { velocityY: number }) => {
        'worklet';
        if (owner.value !== SHEET) return;
        owner.value = UNDECIDED;
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
    [animateTo, dragStart, listOffset, offset, owner, travel],
  );

  const pan = usePanGesture(panConfig);
  // Wrapping the list's own scroll view lets the pan run beside it rather
  // than against it. Without this the two race and the loser is whichever
  // recognised second, which differs by platform.
  const scroll = useNativeGesture(useMemo(() => ({ simultaneousWith: pan }), [pan]));

  useImperativeHandle(
    ref,
    () => ({
      expand: () => {
        offset.value = reduceMotion
          ? withTiming(0, { duration: ANIMATION.fast, easing: EASING.out })
          : withSpring(0, ANIMATION.springSoft);
        settle('full');
      },
      collapse: () => {
        offset.value = reduceMotion
          ? withTiming(travel, { duration: ANIMATION.fast, easing: EASING.out })
          : withSpring(travel, ANIMATION.springSoft);
        settle('peek');
      },
    }),
    [offset, reduceMotion, settle, travel],
  );

  // The detents reachable without a drag. A sheet whose only control is a
  // gesture is a sheet a switch-control or voice-control user cannot move,
  // and this one is the app's whole list.
  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      const expand = event.nativeEvent.actionName === 'increment';
      offset.value = withTiming(expand ? 0 : travel, {
        duration: ANIMATION.fast,
        easing: EASING.out,
      });
      settle(expand ? 'full' : 'peek');
    },
    [offset, settle, travel],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  const list = renderList({ scrollEnabled: detent === 'full', onScrollOffset: listOffset });

  return (
    <Animated.View
      style={[
        styles.sheet,
        { height: full, backgroundColor: colors.sheetBg, borderColor: colors.rule },
        sheetStyle,
      ]}
    >
      {/* The pan covers the whole sheet, not just the handle: at peek the
          list does not scroll, so a drag anywhere on it should raise the
          sheet rather than do nothing. The nested detector below hands the
          list its own native handler, and `simultaneousWith` lets the two
          run together instead of racing. */}
      <GestureDetector gesture={pan}>
        <View style={styles.fill}>
          {/* A hairline indicator and nothing else. The sheet's own top edge
              already reads as an edge against the globe; a second rule under
              the handle would be the same boundary drawn twice. */}
          <View
            style={styles.handleWrap}
            accessibilityRole="adjustable"
            accessibilityLabel="Today"
            accessibilityValue={{ text: detent === 'full' ? 'expanded' : 'collapsed' }}
            accessibilityHint="Swipe up for the full list, down to see the globe"
            accessibilityActions={ADJUST_ACTIONS}
            onAccessibilityAction={handleAccessibilityAction}
          >
            <View style={[styles.indicator, { backgroundColor: colors.rule }]} />
          </View>
          {header}
          <GestureDetector gesture={scroll}>{list}</GestureDetector>
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
    overflow: 'hidden',
  },
  handleWrap: { alignItems: 'center', paddingTop: SPACING.sm, paddingBottom: SPACING.xs },
  indicator: {
    width: LAYOUT.handleWidth,
    height: LAYOUT.handleHeight,
    borderRadius: RADIUS.handle,
  },
  fill: { flex: 1, minHeight: 0 },
});
