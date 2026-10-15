import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type LayoutChangeEvent } from 'react-native';
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
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
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
  onCommit: (fraction: number, cameraEpoch?: number) => void;
  /** A story scrub carries its camera claim through the delayed JS commit. */
  requestEpoch?: SharedValue<number>;
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
  requestEpoch,
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
  const generation = useSharedValue(0);
  const released = useSharedValue<{ fraction: number; epoch?: number; id: number } | null>(null);
  const delivered = useRef(0);
  const available = useSharedValue(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const mounted = useRef(true);
  const foreground = useRef(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );

  // Only the tooltip subscribes. Updating text in this hook's owner used to
  // rebuild the dock and gesture detector on every story crossed by a drag.
  const [preview] = useState(() => {
    let snapshot = { label: '', detail: '', caption: '' };
    const listeners = new Set<() => void>();
    return {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      update: (next: typeof snapshot) => {
        if (
          next.label === snapshot.label &&
          next.detail === snapshot.detail &&
          next.caption === snapshot.caption
        )
          return;
        snapshot = next;
        for (const listener of listeners) listener();
      },
    };
  });
  const updateLabel = useCallback(
    (f: number) =>
      preview.update({
        label: labelFor(f),
        detail: detailFor?.(f) ?? '',
        caption: captionFor?.(f) ?? '',
      }),
    [labelFor, detailFor, captionFor, preview],
  );
  // One hop per step, carrying both effects. Two `scheduleOnRN` calls are two
  // JS tasks, and the notch and the label they carried could land on
  // different frames — the same frame is the promise above.
  const onStep = useCallback(
    (f: number, notch: boolean, relabel: boolean) => {
      if (!mounted.current || !foreground.current) return;
      // `hapticImpact`, not `hapticTick`: iOS suppresses `selectionAsync()`
      // while an AVAudioSession is in playback mode.
      if (notch) hapticImpact();
      if (relabel) updateLabel(f);
    },
    [updateLabel],
  );
  const start = onScrubStart ?? noop;
  const end = onScrubEnd ?? noop;
  const notifyHolding = useCallback(
    (held: boolean, version: number) => {
      if (!mounted.current || version !== generation.value) return;
      if (held) start();
      else end();
    },
    [end, generation, start],
  );
  const commit = useCallback(
    (f: number, version: number, epoch?: number, releaseId = version) => {
      if (!mounted.current || version !== generation.value || releaseId <= delivered.current)
        return;
      delivered.current = releaseId;
      if (epoch === undefined) onCommit(f);
      else onCommit(f, epoch);
    },
    [generation, onCommit],
  );
  const publishCommit = useCallback(() => {
    'worklet';
    const epoch = requestEpoch?.value;
    released.value = { fraction: pending.value, epoch, id: generation.value };
    scheduleOnRN(commit, pending.value, generation.value, epoch);
  }, [commit, generation, pending, released, requestEpoch]);
  const cancel = useCallback(() => {
    'worklet';
    if (!holding.value) return;
    generation.value += 1;
    fraction.value = beforeDrag.value;
    holding.value = 0;
    shown.value = 0;
    tooltipScale.value = 0.8;
    // The newer drag was canceled: the previous released selection is still
    // on the cards. If JS had not received it yet, deliver it once now.
    const previous = released.value;
    if (previous)
      scheduleOnRN(commit, previous.fraction, generation.value, previous.epoch, previous.id);
    scheduleOnRN(notifyHolding, false, generation.value);
  }, [
    beforeDrag,
    commit,
    fraction,
    generation,
    holding,
    notifyHolding,
    released,
    shown,
    tooltipScale,
  ]);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (state) => {
      foreground.current = state === 'active';
      scheduleOnUI((active: boolean) => {
        'worklet';
        available.value = active;
        if (!active) cancel();
      }, state === 'active');
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [available, cancel]);
  useEffect(() => {
    if (!enabled) scheduleOnUI(cancel);
  }, [cancel, enabled]);

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
        if (!available.value || width.value <= 0) return;
        generation.value += 1;
        onClaim?.();
        beforeDrag.value = fraction.value;
        holding.value = 1;
        scheduleOnRN(notifyHolding, true, generation.value);
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
        if (!holding.value) return;
        fingerX.value = e.x;
        track(e.x, true);
      },
      onFinalize: (e) => {
        'worklet';
        if (e.canceled) {
          cancel();
          return;
        }
        if (holding.value) {
          if (snapTo) fraction.value = snapTo(pending.value);
          onCommitUI?.(pending.value);
          publishCommit();
          scheduleOnRN(notifyHolding, false, generation.value);
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
      available,
      width,
      cancel,
      generation,
      notifyHolding,
      shown,
      tooltipScale,
      fingerX,
      lastDetent,
      lastStep,
      lastNotchAt,
      track,
      publishCommit,
      snapTo,
      onCommitUI,
      onClaim,
      pending,
    ],
  );

  const tapConfig = useMemo(
    (): TapGestureConfig => ({
      enabled,
      maxDuration: 400,
      onDeactivate: (e) => {
        'worklet';
        if (e.canceled || !available.value || width.value <= 0) return;
        generation.value += 1;
        onClaim?.();
        track(e.x, false);
        if (snapTo) fraction.value = snapTo(pending.value);
        onCommitUI?.(pending.value);
        publishCommit();
        if (onScrubEnd) scheduleOnRN(notifyHolding, false, generation.value);
      },
    }),
    [
      enabled,
      track,
      publishCommit,
      onClaim,
      pending,
      fraction,
      snapTo,
      onCommitUI,
      available,
      generation,
      width,
      onScrubEnd,
      notifyHolding,
    ],
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
    preview,
  };
}

export type Scrub = ReturnType<typeof useScrub>;
