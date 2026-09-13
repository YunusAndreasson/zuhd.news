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

export interface ScrubOptions {
  /** The filled share, 0–1. The scrub writes it on the UI thread while held. */
  fraction: SharedValue<number>;
  /** Haptic notches across the whole track — spatial, not per unit of content,
   *  so a long and a short track feel the same under the finger. */
  detents: number;
  /** How finely the label changes: seconds of audio, stories in a day. */
  steps: number;
  /** The tooltip's text for a fraction. */
  labelFor: (fraction: number) => string;
  /** A quieter second line under it — when the story at that fraction ran. */
  detailFor?: (fraction: number) => string;
  /** The finger lifted, or tapped: go there. */
  onCommit: (fraction: number) => void;
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
 * - **Grabbing announces itself**: both ratchets reset on activation, so the
 *   first contact is one notch.
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
  labelFor,
  detailFor,
  onCommit,
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
  const lastDetent = useSharedValue(-1);
  const lastStep = useSharedValue(-1);

  const [label, setLabel] = useState('');
  const [detail, setDetail] = useState('');
  const labelRef = useRef('');
  const detailRef = useRef('');
  const updateLabel = useCallback(
    (f: number) => {
      const next = labelFor(f);
      const nextDetail = detailFor ? detailFor(f) : '';
      if (next === labelRef.current && nextDetail === detailRef.current) return;
      labelRef.current = next;
      detailRef.current = nextDetail;
      setLabel(next);
      setDetail(nextDetail);
    },
    [labelFor, detailFor],
  );
  const start = onScrubStart ?? noop;
  const end = onScrubEnd ?? noop;

  const track = useMemo(() => {
    const fn = (x: number) => {
      'worklet';
      const w = width.value;
      if (w <= 0) return;
      const f = Math.max(0, Math.min(1, x / w));
      fraction.value = f;
      pending.value = f;
      const detent = Math.round(f * detents);
      if (detent !== lastDetent.value) {
        lastDetent.value = detent;
        // `hapticImpact`, not `hapticTick`: iOS suppresses `selectionAsync()`
        // while an AVAudioSession is in playback mode.
        scheduleOnRN(hapticImpact);
      }
      const step = Math.floor(f * steps);
      if (step !== lastStep.value) {
        lastStep.value = step;
        scheduleOnRN(updateLabel, f);
      }
    };
    return fn;
  }, [width, fraction, pending, detents, lastDetent, steps, lastStep, updateLabel]);

  const panConfig = useMemo<PanGestureConfig>(
    () => ({
      enabled,
      activeOffsetX: [-2, 2],
      failOffsetY: [-10, 10],
      onActivate: (e) => {
        'worklet';
        holding.value = 1;
        scheduleOnRN(start);
        shown.value = withSpring(1, ANIMATION.springSoft);
        tooltipScale.value = withSpring(1, { damping: 8, stiffness: 260, mass: 0.7 });
        fingerX.value = e.x;
        lastDetent.value = -1;
        lastStep.value = -1;
        track(e.x);
      },
      onUpdate: (e) => {
        'worklet';
        fingerX.value = e.x;
        track(e.x);
      },
      onFinalize: () => {
        'worklet';
        if (holding.value) {
          scheduleOnRN(onCommit, pending.value);
          scheduleOnRN(end);
          holding.value = 0;
        }
        shown.value = withTiming(0, { duration: ANIMATION.fast });
        tooltipScale.value = withTiming(0.8, { duration: ANIMATION.fast });
      },
    }),
    [
      enabled,
      holding,
      start,
      shown,
      tooltipScale,
      fingerX,
      lastDetent,
      lastStep,
      track,
      onCommit,
      pending,
      end,
    ],
  );

  const tapConfig = useMemo<TapGestureConfig>(
    () => ({
      enabled,
      maxDuration: 400,
      onDeactivate: (e) => {
        'worklet';
        if (e.canceled) return;
        lastDetent.value = -1;
        lastStep.value = -1;
        track(e.x);
        scheduleOnRN(onCommit, pending.value);
      },
    }),
    [enabled, lastDetent, lastStep, track, onCommit, pending],
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
  };
}

export type Scrub = ReturnType<typeof useScrub>;
