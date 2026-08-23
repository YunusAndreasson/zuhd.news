import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import {
  GestureStateManager,
  type NativeGestureConfig,
  type PanGestureConfig,
  useNativeGesture,
  usePanGesture,
} from 'react-native-gesture-handler';
import {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ANIMATION, RADIUS } from '../constants/theme';
import { hapticImpact, hapticTick } from '../lib/haptics';
import { useTheme } from './useTheme';

/**
 * Pull a detail view down to leave it.
 *
 * ── Why this needed the columns re-shaped first ───────────────────────────
 *
 * Down was already vertical paging, and vertical paging is the axis the whole
 * app is built on. The only place a downward drag is free is the *top* of a
 * detail, where the list cannot scroll any further — and that used not to be
 * where anyone was standing, because a detail opened at whatever page the
 * reader had tapped, twelve deep in a river of forty-three.
 *
 * So the detail views open at their own page zero now: `ArticleList` and
 * `CardPager` slice from the item that was tapped. Arrival and "the top" are
 * the same place, which makes the pull free at exactly the moment a reader
 * wants it — they have read the thing they came for and want out.
 *
 * The direction stays honest either way: down moves you *outward*. Page one
 * pulls back to page zero, page zero pulls out to the list. Nothing about the
 * gesture has to be explained, because it is the same movement all the way.
 *
 * What is lost is swiping back to a story *earlier* than the one you opened,
 * and the list answers that better — it is one pull away and it remembers
 * where you were.
 *
 * ── Why it activates by hand ──────────────────────────────────────────────
 *
 * `manualActivation`, and this is the part that took a device to find. The
 * first build used `activeOffsetY` and `failOffsetX` and let the recogniser
 * decide — which meant that on a drag it was going to ignore anyway, the pan
 * still *activated*, and an activating pan cancels the touch stream of the
 * views under it. The fifteen-currency card, scrolled down, could no longer be
 * scrolled back up: the drag reached nothing at all. Silent, and exactly the
 * class of bug `mobile/CLAUDE.md` spends a page on.
 *
 * So the decision is made in `onTouchesMove`, where declining costs nothing:
 *
 *   not armed          → `fail`. The pan never activates, so the card's own
 *                        ScrollView keeps the drag it was always going to get.
 *   sideways           → `fail`. That is a section swipe and it belongs to
 *                        `PagerView`. This axis is not negotiable.
 *   upward             → `fail`. That is the next story.
 *   downward, at rest  → `activate`, and only then does anything move.
 *
 * `simultaneousWith` the list's native gesture on top of that, so even the
 * activation the pull *does* claim leaves the scroll underneath intact — a
 * reader who starts down, changes their mind and swipes up still gets the
 * next story rather than a dead gesture.
 *
 * ── Why `armed` reads two offsets, not one ────────────────────────────────
 *
 * A page can carry its own scroll: an article longer than the screen, a card
 * taller than the page at large Dynamic Type. A reader who has scrolled one of
 * those down and drags down again is scrolling *back up through their own
 * content* — the most ordinary gesture there is — and closing the view under
 * them would be the worst bug this could ship with. So the pull only arms when
 * both the pager and the page are at their tops, latched at touch-down so a
 * drag that starts legal stays legal for its whole life.
 */

/** Distance the pull has to cover before releasing closes. Generous: this is
 *  a destructive-ish gesture on a reading surface and an accidental one costs
 *  the reader their place. Exported because `PullHandle` shows the reader how
 *  close they are to it, and two copies of the number would let the bar say
 *  "committed" at a distance that does not commit. */
export const CLOSE_DISTANCE = 96;

/** Resistance. The page follows the finger at a fraction of its travel, the
 *  way a sheet does — the drag reads as elastic rather than as dragging a
 *  window, and the ceiling stops a hard fling throwing the page off screen
 *  before the release is even read. */
const DAMPING = 0.5;
const MAX_PULL = 220;

/** How far down the drag has to get before the pan takes over. Small, because
 *  by the time it is consulted the drag is already known to be downward, at
 *  the top of both scrolls, and not a section swipe. */
const ACTIVATE_Y = 12;

/** A drag this far off vertical is a section swipe, and belongs to the pager. */
const FAIL_X = 16;

/** Slack on the two offsets. A list resting at its top reports a sub-pixel
 *  value often enough that an exact zero would disarm the gesture at random. */
const TOP_EPS = 1;

export interface PullToClose {
  /** Wrap the detail's outermost view in a `GestureDetector` with this. */
  gesture: ReturnType<typeof usePanGesture>;
  /** Wrap the scrolling list in a `GestureDetector` with this, so the pan can
   *  be simultaneous with it rather than racing it. */
  listGesture: ReturnType<typeof useNativeGesture>;
  /** Put this on the view holding the whole detail. */
  pullStyle: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
  /** The resting sheet shape, for the same view. Static — see `sheetStyle`. */
  sheetStyle: ViewStyle;
  /** The page's own scroll offset, for the page component to write. Zero when
   *  the page does not scroll, which is the common case. */
  innerOffset: SharedValue<number>;
  /** How far the pull has travelled, for `PullHandle` to answer with. */
  pull: SharedValue<number>;
}

export function usePullToClose({
  scrollY,
  onClose,
  progress,
}: {
  /** The pager's offset — zero only at the first page. */
  scrollY: SharedValue<number>;
  /** Absent when the detail is the whole column and there is nothing to
   *  return to; the gesture then does nothing at all. */
  onClose?: () => void;
  /**
   * The stage's presentation, 0 to 1 — see `SheetStage`.
   *
   * The pull drives it *backwards* under the finger, so the index behind the
   * sheet grows and brightens as the sheet leaves. That is the half a page
   * shrinking into an empty background could never give a reader: they can see
   * where they are going before they commit to going there.
   *
   * Mapped against `CLOSE_DISTANCE` rather than the full travel, so the ground
   * is all the way forward at exactly the moment releasing would close — the
   * same fact the handle, the shrink and the haptic each report.
   */
  progress?: SharedValue<number>;
}): PullToClose {
  const { colors } = useTheme();
  const pull = useSharedValue(0);
  const armed = useSharedValue(false);
  const committed = useSharedValue(false);
  const innerOffset = useSharedValue(0);
  /** Where the finger went down, and whether this gesture's fate is settled.
   *  `manualActivation` means the recogniser holds no offsets of its own. */
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const decided = useSharedValue(false);

  const listGesture = useNativeGesture(useMemo<NativeGestureConfig>(() => ({}), []));

  const panConfig = useMemo<PanGestureConfig>(
    () => ({
      enabled: !!onClose,
      simultaneousWith: listGesture,
      manualActivation: true,
      onTouchesDown: (e) => {
        'worklet';
        const t = e.allTouches[0];
        if (!t) return;
        startX.value = t.absoluteX;
        startY.value = t.absoluteY;
        decided.value = false;
        committed.value = false;
        // Latched here, not read live: both offsets change *because of* this
        // drag, so a live check would arm and disarm mid-gesture.
        armed.value = scrollY.value <= TOP_EPS && innerOffset.value <= TOP_EPS;
        if (!armed.value) GestureStateManager.fail(e.handlerTag);
      },
      onTouchesMove: (e) => {
        'worklet';
        if (decided.value) return;
        if (!armed.value) {
          GestureStateManager.fail(e.handlerTag);
          return;
        }
        const t = e.allTouches[0];
        if (!t) return;
        const dx = t.absoluteX - startX.value;
        const dy = t.absoluteY - startY.value;
        // A drag this far off vertical is a section swipe. Checked before the
        // downward test so a diagonal never reads as a pull.
        if (Math.abs(dx) > FAIL_X) {
          decided.value = true;
          GestureStateManager.fail(e.handlerTag);
          return;
        }
        if (dy > ACTIVATE_Y) {
          decided.value = true;
          GestureStateManager.activate(e.handlerTag);
        } else if (dy < -ACTIVATE_Y) {
          decided.value = true;
          GestureStateManager.fail(e.handlerTag);
        }
      },
      onUpdate: (e) => {
        'worklet';
        if (!armed.value) return;
        const next = Math.min(MAX_PULL, Math.max(0, e.translationY * DAMPING));
        pull.value = next;
        if (progress) progress.value = 1 - Math.min(1, next / CLOSE_DISTANCE);
        // Say it before the release, not after. A reader holding at 90 needs
        // to know whether letting go closes.
        if (!committed.value && next >= CLOSE_DISTANCE) {
          committed.value = true;
          scheduleOnRN(hapticTick);
        } else if (committed.value && next < CLOSE_DISTANCE) {
          committed.value = false;
        }
      },
      onDeactivate: () => {
        'worklet';
        if (!armed.value) return;
        // Latch before starting the animation — once `withTiming` is assigned,
        // reading `.value` gives the in-flight value, not where the finger
        // let go. Same trap `SwipeableRow` documents.
        const released = pull.value;
        armed.value = false;
        committed.value = false;
        if (progress)
          progress.value = withTiming(released >= CLOSE_DISTANCE ? 0 : 1, {
            duration: ANIMATION.fast,
          });
        if (released >= CLOSE_DISTANCE && onClose) {
          // Carry the motion through rather than snapping back and then
          // vanishing: the page keeps going the way the finger sent it, and
          // the list is revealed underneath.
          pull.value = withTiming(MAX_PULL, { duration: ANIMATION.fast });
          scheduleOnRN(hapticImpact);
          scheduleOnRN(onClose);
        } else {
          pull.value = withTiming(0, { duration: ANIMATION.fast });
        }
      },
      onFinalize: () => {
        'worklet';
        // A cancelled pan (the pager taking the gesture, a call interrupting)
        // never reaches `onDeactivate`. Without this the page would stay where
        // the finger left it.
        decided.value = false;
        if (!armed.value) return;
        armed.value = false;
        pull.value = withTiming(0, { duration: ANIMATION.fast });
        if (progress) progress.value = withTiming(1, { duration: ANIMATION.fast });
      },
    }),
    [
      armed,
      committed,
      decided,
      innerOffset,
      listGesture,
      onClose,
      progress,
      pull,
      scrollY,
      startX,
      startY,
    ],
  );

  const gesture = usePanGesture(panConfig);

  /**
   * What the page does under the finger.
   *
   * Three channels, and they are the ones every card-dismiss a reader already
   * uses runs on — a photo viewer, a now-playing screen, a system sheet:
   *
   *   it follows the finger      the movement is the reader's, not the app's
   *   it shrinks                 an object getting smaller is an object going
   *                              away; this is the cue that separates
   *                              "dismissing" from "scrolling"
   *
   * It does *not* fade, and it used to. A fade was right while a detail was
   * the only thing on its page and what showed through was the app's own
   * background. With the index mounted behind it the same fade reads the
   * headline list straight *through* the article on top of it — which does
   * not look like a page leaving, it looks like a rendering fault. No sheet a
   * reader has ever dismissed goes translucent on the way out; they move and
   * they get smaller, and the thing behind comes forward to meet them.
   *
   * The shrink is keyed to `CLOSE_DISTANCE` rather than to the raw travel, so
   * the page is at its smallest exactly when releasing would close — the same
   * fact the haptic, the handle and the backdrop each report. Norman's point
   * about feedback is that it has to say *what will happen*, not merely that
   * something is happening.
   */
  const pullStyle = useAnimatedStyle<ViewStyle>(() => {
    'worklet';
    const p = pull.value;
    const t = Math.min(1, p / CLOSE_DISTANCE);
    return { transform: [{ translateY: p }, { scale: 1 - 0.06 * t }] };
  });

  /**
   * The sheet's own surface: a rounded top edge, and a floor.
   *
   * The corner does not move. A detail sits under the section rail with a
   * rounded top at rest — the shape of a docked sheet at full height —
   * because the affordance has to be there before the gesture is, not appear
   * once the reader has already guessed.
   *
   * The background is not decoration either. A detail used to be the only
   * thing on its page and could let the screen's own colour show through;
   * now the index is mounted behind it, and without an opaque floor the
   * headline list reads straight through the article on top of it.
   */
  const sheetStyle = useMemo<ViewStyle>(
    () => ({
      backgroundColor: colors.bg,
      borderTopLeftRadius: RADIUS.sheet,
      borderTopRightRadius: RADIUS.sheet,
      overflow: 'hidden',
    }),
    [colors.bg],
  );

  return { gesture, listGesture, pullStyle, sheetStyle, innerOffset, pull };
}
