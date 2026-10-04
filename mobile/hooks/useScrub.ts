import { useCallback, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  type PanGestureConfig,
  type TapGestureConfig,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ANIMATION } from '../constants/theme';
import { hapticImpact } from '../lib/haptics';

const noop = () => {};

/** The stem's thickness: a line that reads above a thumb without becoming a bar. */
export const STEM_WIDTH = 1;

/** The shortest gap between two notches: one per 50 ms, at most. */
const NOTCH_MIN_MS = 50;

export interface ScrubOptions {
  /** The filled share, 0–1. The scrub writes it on the UI thread while held. */
  fraction: SharedValue<number>;
  /** Haptic notches across the whole track — spatial, not per unit of content,
   *  so a long and a short track feel the same under the finger. 0 for none:
   *  a notch that stands for nothing in the content is only a buzz. */
  detents: number;
  /** How finely the label changes: seconds of audio, stories in a day. */
  steps: number;
  /** Worklet: which step a fraction is in, for a track whose steps are not
   *  evenly spaced — the story track, where each story sits at its time. It
   *  replaces both `steps` and `detents`: a notch per story crossed. */
  stepAt?: (fraction: number) => number;
  /** The tooltip's text for a fraction. */
  labelFor: (fraction: number) => string;
  /** A quieter second line under it — when the story at that fraction ran. */
  detailFor?: (fraction: number) => string;
  /** What the finger is on, in its own words — the story's headline. A time
   *  and a category are the same for every story of a run, so without it a
   *  scrub across sixteen stories read `8h ago · politics` sixteen times and
   *  the reader chose a story blind. */
  captionFor?: (fraction: number) => string;
  /** The finger lifted, or tapped: go there. */
  onCommit: (fraction: number) => void;
  /** Worklet: settle the released playhead at a content boundary, before JS
   *  receives the commit. A delayed commit must not move a newer held drag. */
  snapTo?: (fraction: number) => number;
  /** Worklet: commit shared content position before another gesture starts. */
  onCommitUI?: (fraction: number) => void;
  /** Optional worklet: claim input before any JS callback or pending camera action. */
  onClaim?: () => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  tooltipWidth?: number;
  enabled?: boolean;
}

/**
 * Drag or tap along a track to move through something — the briefing's audio,
 * the day's stories. One implementation, because the player's scrubber and the
 * story track answer the same gesture, and two copies would drift apart on the
 * details that make it feel right:
 *
 * - **The fill follows the finger on the UI thread**; the commit waits for the
 *   lift. A seek or a jump per frame floods whatever is listening, and its
 *   delayed answers land out of order and fight the finger.
 * - **The notch the finger feels, the label it reads and the fill move on the
 *   same frame.** Haptics fire per detent, the label per step, both decided in
 *   the worklet so neither needs a JS round trip to know whether it changed.
 * - **Notches never come faster than one per `NOTCH_MIN_MS`.** Stories bunch
 *   on the day's track (a cycle's run sits in a few points), and a quick scrub
 *   across one crossed a notch every frame — a buzz, not a count.
 * - **Grabbing announces itself**: both ratchets reset on activation, so the
 *   first contact is one notch. A tap is a press, and a press never knocks.
 * - **A tap jumps without a tooltip** — the fill moving is feedback enough; the
 *   tooltip is for a drag, where the reader needs a preview before committing.
 * - **Pan claims at 2pt horizontal and fails at 10pt vertical**, so a vertical
 *   drag still belongs to whatever holds the track (a list, a sheet).
 *
 * Pair with `ScrubBar` and `ScrubTooltip`, which draw what this measures.
 */
export function useScrub({
  fraction,
  detents,
  steps,
  stepAt,
  labelFor,
  detailFor,
  captionFor,
  onCommit,
  snapTo,
  onCommitUI,
  onClaim,
  onScrubStart,
  onScrubEnd,
  tooltipWidth = 48,
  enabled = true,
}: ScrubOptions) {
  const width = useSharedValue(0);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      width.value = e.nativeEvent.layout.width;
    },
    [width],
  );
  /** 0–1: the thumb and tooltip fade with it. */
  const shown = useSharedValue(0);
  /** 1 while a drag holds the track, so the owner does not overwrite the fill. */
  const holding = useSharedValue(0);
  const tooltipScale = useSharedValue(0.8);
  const fingerX = useSharedValue(0);
  const pending = useSharedValue(0);
  const beforeDrag = useSharedValue(0);
  const lastDetent = useSharedValue(-1);
  const lastStep = useSharedValue(-1);

  const [label, setLabel] = useState('');
  const [detail, setDetail] = useState('');
  const [caption, setCaption] = useState('');
  const labelRef = useRef('');
  const detailRef = useRef('');
  const captionRef = useRef('');
  const updateLabel = useCallback(
    (f: number) => {
      const next = labelFor(f);
      const nextDetail = detailFor ? detailFor(f) : '';
      const nextCaption = captionFor ? captionFor(f) : '';
      if (
        next === labelRef.current &&
        nextDetail === detailRef.current &&
        nextCaption === captionRef.current
      ) {
        return;
      }
      labelRef.current = next;
      detailRef.current = nextDetail;
      captionRef.current = nextCaption;
      setLabel(next);
      setDetail(nextDetail);
      setCaption(nextCaption);
    },
    [labelFor, detailFor, captionFor],
  );
  // One hop per step, carrying both effects. Two `scheduleOnRN` calls are two
  // JS tasks, and the notch and the label they carried could land on
  // different frames — the same frame is the promise above.
  const onStep = useCallback(
    (f: number, notch: boolean, relabel: boolean) => {
      // `hapticImpact`, not `hapticTick`: iOS suppresses `selectionAsync()`
      // while an AVAudioSession is in playback mode.
      if (notch) hapticImpact();
      if (relabel) updateLabel(f);
    },
    [updateLabel],
  );
  const start = onScrubStart ?? noop;
  const end = onScrubEnd ?? noop;

  const notches = stepAt != null || detents > 0;
  const lastNotchAt = useSharedValue(0);

  /** Move the fill to `x`. `held` is a drag: only a finger holding the track
   *  feels notches and reads a label — a tap's tooltip never shows, and a drag
   *  relabels on its first frame whatever a tap left (`lastStep` resets). */
  const track = useMemo(() => {
    const fn = (x: number, held: boolean) => {
      'worklet';
      const w = width.value;
      if (w <= 0) return;
      const f = Math.max(0, Math.min(1, x / w));
      fraction.value = f;
      pending.value = f;
      if (!held) return;
      const step = stepAt ? stepAt(f) : Math.floor(f * steps);
      const detent = stepAt ? step : Math.round(f * detents);
      let notch = false;
      if (detent !== lastDetent.value) {
        lastDetent.value = detent;
        const now = Date.now();
        if (notches && now - lastNotchAt.value >= NOTCH_MIN_MS) {
          lastNotchAt.value = now;
          notch = true;
        }
      }
      const relabel = step !== lastStep.value;
      lastStep.value = step;
      if (notch || relabel) scheduleOnRN(onStep, f, notch, relabel);
    };
    return fn;
  }, [
    width,
    fraction,
    pending,
    detents,
    lastDetent,
    lastNotchAt,
    notches,
    steps,
    stepAt,
    lastStep,
    onStep,
  ]);

  const panConfig = useMemo(
    (): PanGestureConfig => ({
      enabled,
      activeOffsetX: [-2, 2],
      failOffsetY: [-10, 10],
      onActivate: (e) => {
        'worklet';
        onClaim?.();
        beforeDrag.value = fraction.value;
        holding.value = 1;
        scheduleOnRN(start);
        shown.value = withSpring(1, ANIMATION.springSoft);
        tooltipScale.value = withSpring(1, ANIMATION.springPop);
        fingerX.value = e.x;
        lastDetent.value = -1;
        lastStep.value = -1;
        lastNotchAt.value = 0;
        track(e.x, true);
      },
      onUpdate: (e) => {
        'worklet';
        fingerX.value = e.x;
        track(e.x, true);
      },
      onFinalize: (e) => {
        'worklet';
        if (holding.value) {
          if (e.canceled) fraction.value = beforeDrag.value;
          else {
            if (snapTo) fraction.value = snapTo(pending.value);
            onCommitUI?.(pending.value);
            scheduleOnRN(onCommit, pending.value);
          }
          scheduleOnRN(end);
          holding.value = 0;
        }
        shown.value = withTiming(0, { duration: ANIMATION.fast });
        tooltipScale.value = withTiming(0.8, { duration: ANIMATION.fast });
      },
    }),
    [
      enabled,
      beforeDrag,
      fraction,
      holding,
      start,
      shown,
      tooltipScale,
      fingerX,
      lastDetent,
      lastStep,
      lastNotchAt,
      track,
      onCommit,
      snapTo,
      onCommitUI,
      onClaim,
      pending,
      end,
    ],
  );

  const tapConfig = useMemo(
    (): TapGestureConfig => ({
      enabled,
      maxDuration: 400,
      onDeactivate: (e) => {
        'worklet';
        if (e.canceled) return;
        onClaim?.();
        track(e.x, false);
        if (snapTo) fraction.value = snapTo(pending.value);
        onCommitUI?.(pending.value);
        scheduleOnRN(onCommit, pending.value);
      },
    }),
    [enabled, track, onCommit, onClaim, pending, fraction, snapTo, onCommitUI],
  );

  const pan = usePanGesture(panConfig);
  const tap = useTapGesture(tapConfig);
  const gesture = useCompetingGestures(pan, tap);

  // Rides the finger, clamped so it never leaves the track's ends.
  const tooltipStyle = useAnimatedStyle(() => {
    const w = width.value || 1;
    const half = tooltipWidth / 2;
    const x = Math.max(half, Math.min(fingerX.value, w - half));
    return {
      opacity: shown.value,
      transform: [{ translateX: x - half }, { scale: tooltipScale.value }],
    };
  });

  // The stem under the tooltip points at the finger itself, unclamped, so the
  // place it marks stays true at the track's ends where the label cannot follow.
  const stemStyle = useAnimatedStyle(() => {
    const w = width.value || 1;
    return {
      opacity: shown.value,
      transform: [{ translateX: Math.max(0, Math.min(fingerX.value, w)) - STEM_WIDTH / 2 }],
    };
  });

  return {
    gesture,
    onLayout,
    width,
    shown,
    holding,
    tooltipStyle,
    stemStyle,
    tooltipWidth,
    label,
    detail,
    caption,
  };
}

export type Scrub = ReturnType<typeof useScrub>;
