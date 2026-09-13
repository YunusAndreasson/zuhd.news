import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
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
 * — kicker, title, the lead — and at full the same card grown into the whole
 * story, with the globe still above it. **Full is the story's own height**
 * (`contentHeight`), capped at `full`: a four-sentence story stopped a third
 * of the screen short of a fixed full stop, and that third was blank while
 * the earth above it sat in a 140pt band. A swipe while grown springs the
 * sheet to the next story's height. A middle stop would be a third place
 * to leave a card with nothing that belongs there. There is no full-screen
 * reader to hand off to; a modal reader was intrusive and lost the earth.
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
  /** The tallest the sheet expands to, in px. */
  full: number;
  /** The height the expanded sheet actually stops at, published for the
   *  globe's grown transform. Written only from here. */
  expandedHeight?: SharedValue<number>;
  /** 0 at peek, 1 at full. Read by the globe; written only from here. */
  progress: SharedValue<number>;
  /** Always visible, above the list. */
  header: ReactNode;
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
    /** Report the natural height of the list's current content. The expanded
     *  sheet stops at it (plus the handle and header), between `peek` and
     *  `full`. Stable. */
    onContentHeight: (height: number) => void;
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
  expandedHeight,
  progress,
  header,
  renderList,
  onDetentChange,
  onPullDown,
  ref,
}: MapSheetProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [detent, setDetent] = useState<MapSheetDetent>('peek');

  // Travel: `full - peek` px between the two stops. `offset` is how far the
  // sheet is pushed down from its expanded position, so peek is the maximum.
  const travel = Math.max(1, full - peek);
  const offset = useSharedValue(travel);
  // The reactions below read these, not the render-time numbers. A reaction
  // closes over what it was created with, and when the window changed size the
  // old one fired on the re-pinned offset with the old travel — a progress of
  // 0.3 at rest, which drew the globe shrunk and shifted up until the sheet
  // was next moved. Nothing re-runs the new reaction until a value it reads
  // changes, so the values have to be shared.
  const travelSV = useSharedValue(travel);
  const fullSV = useSharedValue(full);
  // Where "expanded" is: 0 when the story needs every point of `full`, more
  // when it is shorter. Animated alongside `offset` so the two never part.
  const [chrome, setChrome] = useState(0);
  // The card's height is this sheet's state, not the screen's: it changes on
  // every landing, and held by the screen it re-rendered the whole map — globe
  // props, strip, masthead — a second time per swipe to move one number here.
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const onChromeLayout = useCallback((e: LayoutChangeEvent) => {
    setChrome(e.nativeEvent.layout.height);
  }, []);
  const fit =
    contentHeight !== null && chrome > 0
      ? Math.min(full, Math.max(peek, Math.ceil(chrome + contentHeight)))
      : full;
  const openTarget = full - fit;
  const openTargetRef = useRef(openTarget);
  openTargetRef.current = openTarget;
  const openAt = useSharedValue(openTarget);
  const dragStart = useSharedValue(travel);
  const owner = useSharedValue(UNDECIDED);
  const listOffset = useSharedValue(0);
  // Finger travel past peek during a pull, for the refresh trigger.
  const pull = useSharedValue(0);

  // Published for the globe, which translates and fades as the sheet rises.
  // A reaction, not `useDerivedValue`: this writes to a value the screen owns,
  // which is a side effect, and a derived value is meant to be a pure function
  // of its inputs — Reanimated is free to evaluate one lazily or not at all
  // when nothing reads *it*, and here nothing does.
  useAnimatedReaction(
    // Clamped: a pull stretches the sheet below peek, and the globe's fade
    // must not read that as a negative rise.
    () => {
      const span = Math.max(1, travelSV.value - openAt.value);
      return Math.max(0, Math.min(1, (travelSV.value - offset.value) / span));
    },
    (next) => {
      progress.value = next;
    },
  );
  useAnimatedReaction(
    () => fullSV.value - openAt.value,
    (next) => {
      if (expandedHeight) expandedHeight.value = next;
    },
    [expandedHeight],
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
    fullSV.value = full;
    offset.value = detentRef.current === 'full' ? openTargetRef.current : travel;
  }, [full, fullSV, offset, travel, travelSV]);

  // A different story, or the same one measured: move the expanded stop. At
  // rest nothing visible changes; grown, the sheet springs to the new height.
  useEffect(() => {
    if (detentRef.current !== 'full') {
      openAt.value = openTarget;
      return;
    }
    const move = (to: number) =>
      reduceMotion
        ? withTiming(to, { duration: ANIMATION.fast, easing: EASING.out })
        : withSpring(to, ANIMATION.springSoft);
    openAt.value = move(openTarget);
    offset.value = move(openTarget);
  }, [offset, openAt, openTarget, reduceMotion]);
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
        dragStart.value = offset.value;
        owner.value = UNDECIDED;
        pull.value = 0;
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
          owner.value = offset.value > openAt.value + 0.5 || (atTop && pullingDown) ? SHEET : LIST;
        }
        if (owner.value !== SHEET) return;
        const next = dragStart.value + e.translationY;
        if (next > travel) {
          // Past peek the sheet follows at a fraction of the finger, which is
          // what makes a pull read as a pull rather than as a stuck sheet.
          pull.value = next - travel;
          offset.value = travel + pull.value * PULL_RESISTANCE;
        } else {
          pull.value = 0;
          offset.value = next < openAt.value ? openAt.value : next;
        }
      },
      onDeactivate: (e: { velocityY: number }) => {
        'worklet';
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
          v < -FLICK_VELOCITY
            ? true
            : v > FLICK_VELOCITY
              ? false
              : offset.value < (openAt.value + travel) / 2;
        animateTo(expand ? openAt.value : travel, v, expand ? 'full' : 'peek');
      },
      onFinalize: () => {
        'worklet';
        owner.value = UNDECIDED;
      },
    }),
    [animateTo, dragStart, handlePullDown, listOffset, offset, openAt, owner, pull, travel],
  );

  const pan = usePanGesture(panConfig);

  useImperativeHandle(
    ref,
    () => ({
      expand: () => {
        const to = openTargetRef.current;
        offset.value = reduceMotion
          ? withTiming(to, { duration: ANIMATION.fast, easing: EASING.out })
          : withSpring(to, ANIMATION.springSoft);
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
      offset.value = withTiming(expand ? openTargetRef.current : travel, {
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

  const list = renderList({
    scrollEnabled: detent === 'full',
    onScrollOffset: listOffset,
    sheetGesture: pan,
    onContentHeight: setContentHeight,
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
          <View onLayout={onChromeLayout}>
            <View
              style={styles.handleWrap}
              accessibilityRole="adjustable"
              accessibilityLabel="Story"
              accessibilityValue={{ text: detent === 'full' ? 'expanded' : 'collapsed' }}
              accessibilityHint="Swipe up to read the whole story, down to see the globe"
              accessibilityActions={ADJUST_ACTIONS}
              onAccessibilityAction={handleAccessibilityAction}
            >
              <View style={[styles.indicator, { backgroundColor: colors.rule }]} />
            </View>
            {header}
          </View>
          {list}
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
