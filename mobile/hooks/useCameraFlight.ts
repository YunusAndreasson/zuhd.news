import { useCallback, useEffect } from 'react';
import {
  cancelAnimation,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { ANIMATION, EASING } from '../constants/theme';
import {
  arcDegrees,
  type FlyCurve,
  flyCurve,
  flyMs,
  flyPosition,
  flySpanClip,
  slerpLatLng,
  takeCamera,
} from '../lib/globe-camera';
import type { LatLng } from '../lib/now';

/**
 * Sending the camera somewhere — a tapped mark, a scrubbed-to story, a gauge,
 * an alert — the way a swipe sends it.
 *
 * A swipe between two stories turns the globe along the great circle between
 * them, rising out of its way and coming down close over the next — van Wijk's
 * path, `flyCurve`. A jump used to do neither: it tweened latitude and
 * longitude separately at the zoom it started with, so a story on the far
 * side of the planet whipped past at close range. And while a flight held the
 * camera the globe kept the *previous* story's framing and highlight — they
 * are only refreshed while the deck owns the camera — so they popped to the new
 * story when the camera was handed back, or, after a jump, not until the
 * reader next swiped.
 *
 * A flight here is one progress value, `flightT`, eased 0 → 1 over a time the
 * crossing sets for itself (`flyMs`). A reaction on the UI thread turns it into
 * a point on the great circle and a clip through the zoom override the pinch
 * already uses — out, across and down, the swipe's shape, because a swipe and
 * a flight now read the same curve. A flight to a story lands on that story's
 * own framing and, on the same frame, releases the override and hands the
 * camera back to the deck, which is then drawing exactly what the flight ended
 * on: nothing moves, and the highlight and the place's label arrive with the
 * landing. A flight to a place that is not a story keeps the camera there and
 * returns to the zoom it left at.
 *
 * Everything that reads the camera to start a flight runs on the UI thread
 * (`scheduleOnUI`): a JS read of a value the UI thread keeps changing blocks
 * until the UI thread answers.
 */

interface FlightPlan {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  /** The rise and the pacing, worked out once when the flight starts. */
  curve: FlyCurve;
  /** A story's index to hand the camera back at, or -1 for a place. */
  story: number;
  /** A pinch zoom was in effect when a place flight began: keep it. */
  wasZoomed: boolean;
  /** Which flight this is, so a completion callback lands only its own. */
  id: number;
}

export interface CameraFlightInputs {
  cameraOwner: SharedValue<number>;
  cameraLat: SharedValue<number>;
  cameraLng: SharedValue<number>;
  viewLat: SharedValue<number>;
  viewLng: SharedValue<number>;
  zoomActive: SharedValue<number>;
  zoomAngle: SharedValue<number>;
  /** The clip in effect at the last projection (`MiniGlobe.clipOut`). */
  clip: SharedValue<number>;
  storyProgress: SharedValue<number>;
}

export interface CameraFlight {
  /** 0 → 1 while a flight is under way; a finger on the globe cancels it. */
  flightT: SharedValue<number>;
  /** Captured on the UI thread to reject taps delivered after a newer gesture. */
  requestEpoch: SharedValue<number>;
  /** Tell the camera which story is in front of the deck (`null`: no place). */
  setFront: (coords: LatLng | null) => void;
  /**
   * A worklet for the deck's pan to call as it claims a swipe. If the camera
   * is still on the story in front — the usual case — the swipe takes it over
   * at once and the earth turns under the finger. If a drag or a flight has
   * put it somewhere else it stays there: taking it back mid-drag would snap
   * the earth from where the reader left it, and the swipe flies it once it
   * lands (`toStoryIfHeld`). Decided on the UI thread, where the camera is.
   */
  claimForDeck: () => void;
  /**
   * A worklet for a finger landing on the globe. Stopping `flightT` is not
   * enough on its own: the zoom override is the flight's, and left where the
   * curve had risen to it strands the globe zoomed out until the next pinch or
   * settle. This eases it back to the framing underneath, as a pinch release
   * does.
   */
  cancelFlight: () => void;
  /** Hold the camera where it is drawn, before the deck jumps under it. */
  hold: (expectedEpoch?: number) => void;
  /** Fly to story `index`, land on its framing, and hand the camera back. */
  toStory: (
    coords: LatLng,
    index: number,
    framing: number,
    delayMs?: number,
    expectedEpoch?: number,
  ) => void;
  /** Remap a refreshed feed without moving a camera the reader is holding. */
  remapStory: (previousIndex: number, index: number, sameStory: boolean) => void;
  /** As `toStory`, but only if a target is holding the camera: a swipe that
   *  landed while the earth was left somewhere else. */
  toStoryIfHeld: (coords: LatLng, index: number, framing: number) => void;
  /** Fly to a place that is not a story, keeping the camera and the zoom. */
  toPlace: (coords: LatLng) => void;
}

/** How near the deck must rest to the flight's story for the landing to hand
 *  the camera back, in stories. */
const HAND_BACK_SLACK = 0.01;
/** How close, in degrees, the camera must be to the story in front for a swipe
 *  to take it over mid-drag rather than fly once the swipe lands. */
const HANDOFF_DEGREES = 1;

export function useCameraFlight({
  cameraOwner,
  cameraLat,
  cameraLng,
  viewLat,
  viewLng,
  zoomActive,
  zoomAngle,
  clip,
  storyProgress,
}: CameraFlightInputs): CameraFlight {
  const flightT = useSharedValue(1);
  const plan = useSharedValue<FlightPlan | null>(null);
  const flightId = useSharedValue(0);
  const pending = useSharedValue<{
    lat: number;
    lng: number;
    story: number;
    framing: number;
    epoch: number;
  } | null>(null);
  const pendingClock = useSharedValue(0);
  const requestEpoch = useSharedValue(0);
  const invalidatePending = useCallback(() => {
    'worklet';
    requestEpoch.value += 1;
    pending.value = null;
    cancelAnimation(pendingClock);
  }, [pending, pendingClock, requestEpoch]);
  useEffect(() => () => scheduleOnUI(invalidatePending), [invalidatePending]);
  const frontLat = useSharedValue(Number.NaN);
  const frontLng = useSharedValue(Number.NaN);

  const holdUI = useCallback(
    (expectedEpoch?: number) => {
      'worklet';
      if (expectedEpoch !== undefined && expectedEpoch !== requestEpoch.value) return;
      takeCamera(cameraOwner, cameraLat, cameraLng, viewLat, viewLng);
    },
    [cameraLat, cameraLng, cameraOwner, requestEpoch, viewLat, viewLng],
  );

  /** The camera at flight fraction `t`, and the landing once `t` is 1. */
  const applyFlight = useCallback(
    (t: number) => {
      'worklet';
      const p = plan.value;
      if (!p) return;
      // `flyPosition`, not `t`: the path covers most of its ground while it is
      // furthest out, which is what holds the ground to one speed on screen.
      const at = flyPosition(p.curve, t);
      const point = slerpLatLng(p.fromLat, p.fromLng, p.toLat, p.toLng, at);
      cameraLat.value = point[0];
      cameraLng.value = point[1];
      zoomAngle.value = flySpanClip(p.curve, t);
      if (t < 1) return;
      plan.value = null;
      if (p.story >= 0) {
        // Landed on the story's own framing: the deck now draws exactly this
        // frame, so the override and the camera go back to it together. A
        // deck that has moved on in the meantime will fly again when it lands.
        zoomActive.value = 0;
        if (Math.abs(storyProgress.value - p.story) < HAND_BACK_SLACK) cameraOwner.value = 0;
      } else if (!p.wasZoomed) {
        zoomActive.value = 0;
      }
    },
    [cameraLat, cameraLng, cameraOwner, plan, storyProgress, zoomActive, zoomAngle],
  );

  const startUI = useCallback(
    (lat: number, lng: number, story: number, framing: number, onlyIfHeld: boolean) => {
      'worklet';
      invalidatePending();
      if (onlyIfHeld && cameraOwner.value !== 1) return;
      takeCamera(cameraOwner, cameraLat, cameraLng, viewLat, viewLng);
      // A glide, a zoom hand-back or the last flight stops where it is.
      cancelAnimation(flightT);
      cancelAnimation(cameraLat);
      cancelAnimation(cameraLng);
      cancelAnimation(zoomActive);
      cancelAnimation(zoomAngle);
      const fromLat = cameraLat.value;
      const fromLng = cameraLng.value;
      const fromClip = clip.value;
      // A story flight lands on the story's own framing; a gauge or an alert
      // has none, so it comes back down to the zoom it left at.
      const toClip = story >= 0 && framing > 0 ? framing : fromClip;
      const curve = flyCurve(fromClip, toClip, arcDegrees(fromLat, fromLng, lat, lng));
      plan.value = {
        fromLat,
        fromLng,
        toLat: lat,
        toLng: lng,
        curve,
        story,
        wasZoomed: zoomActive.value > 0.5,
        id: flightId.value + 1,
      };
      flightId.value += 1;
      const id = flightId.value;
      // Start the override at the clip already on screen, so taking zoom from
      // the story moves nothing on the first frame.
      zoomAngle.value = fromClip;
      zoomActive.value = 1;
      flightT.value = 0;
      // Under Reduce Motion Reanimated finishes this inside the assignment, so
      // `flightT` is 1 again before the reaction below ever sees the 0 — it
      // compares 1 with 1 and returns, and the camera stayed held where the
      // finger left it, with the flight's zoom override on, for every story
      // after. The completion lands the flight whenever the reaction has not.
      flightT.value = withTiming(
        1,
        { duration: flyMs(curve), easing: EASING.camera },
        (finished) => {
          if (finished && plan.value?.id === id) applyFlight(1);
        },
      );
    },
    [
      applyFlight,
      cameraLat,
      cameraLng,
      cameraOwner,
      clip,
      flightId,
      flightT,
      invalidatePending,
      plan,
      viewLat,
      viewLng,
      zoomActive,
      zoomAngle,
    ],
  );

  useAnimatedReaction(
    () => flightT.value,
    (t, previous) => {
      if (previous === null || t === previous) return;
      applyFlight(t);
    },
  );

  const claimForDeck = useCallback(() => {
    'worklet';
    invalidatePending();
    if (cameraOwner.value !== 1) return;
    const lat = frontLat.value;
    const lng = frontLng.value;
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    let dLng = Math.abs(cameraLng.value - lng) % 360;
    if (dLng > 180) dLng = 360 - dLng;
    if (Math.abs(cameraLat.value - lat) >= HANDOFF_DEGREES || dLng >= HANDOFF_DEGREES) return;
    // Over the story, but at a pinch's zoom — the whole planet, say — is not
    // the story's frame either: taken now, the deck would carry that zoom on
    // to every story after it. The camera stays, and the swipe flies it down
    // to the story it lands on (`toStoryIfHeld`), as it does from a drag.
    // Position alone cannot prove matching framing during a flight: a
    // same-location return from a pinch changes only zoom. Keep its camera
    // until it lands, or let the deck's landing retarget it to the next story.
    if (plan.value || zoomActive.value > 0.5) return;
    cameraOwner.value = 0;
  }, [cameraLat, cameraLng, cameraOwner, frontLat, frontLng, invalidatePending, plan, zoomActive]);

  const cancelFlight = useCallback(() => {
    'worklet';
    invalidatePending();
    cancelAnimation(flightT);
    const p = plan.value;
    if (!p) return;
    plan.value = null;
    // A pinch's own zoom on a place flight is the reader's and stays; every
    // other override belonged to the flight and goes back to the framing.
    if (p.story >= 0 || !p.wasZoomed) {
      zoomActive.value = withTiming(0, {
        duration: ANIMATION.zoomRelease,
        easing: EASING.camera,
      });
    }
  }, [flightT, invalidatePending, plan, zoomActive]);

  const setFront = useCallback(
    (coords: LatLng | null) => {
      frontLat.value = coords ? coords[0] : Number.NaN;
      frontLng.value = coords ? coords[1] : Number.NaN;
    },
    [frontLat, frontLng],
  );

  const hold = useCallback(
    (expectedEpoch?: number) => scheduleOnUI(holdUI, expectedEpoch),
    [holdUI],
  );
  const requestStoryUI = useCallback(
    (
      lat: number,
      lng: number,
      story: number,
      framing: number,
      delayMs: number,
      expectedEpoch?: number,
    ) => {
      'worklet';
      if (expectedEpoch !== undefined && expectedEpoch !== requestEpoch.value) return;
      if (delayMs <= 0) {
        startUI(lat, lng, story, framing, false);
        return;
      }
      cancelFlight();
      holdUI();
      const epoch = requestEpoch.value;
      pending.value = { lat, lng, story, framing, epoch };
      pendingClock.value = 0;
      // The collection burst waits on the UI thread, where a newer drag,
      // pinch or deck claim can invalidate it even while JS is blocked.
      pendingClock.value = withDelay(
        delayMs,
        withTiming(1, { duration: 0 }, (finished) => {
          const next = pending.value;
          if (!finished || !next || next.epoch !== epoch) return;
          startUI(next.lat, next.lng, next.story, next.framing, false);
        }),
      );
    },
    [cancelFlight, holdUI, pending, pendingClock, requestEpoch, startUI],
  );
  const toStory = useCallback(
    (coords: LatLng, index: number, framing: number, delayMs = 0, expectedEpoch?: number) =>
      scheduleOnUI(requestStoryUI, coords[0], coords[1], index, framing, delayMs, expectedEpoch),
    [requestStoryUI],
  );
  const remapStory = useCallback(
    (previousIndex: number, index: number, sameStory: boolean) => {
      scheduleOnUI(() => {
        'worklet';
        // A held view and its zoom are independent of the feed's indices.
        // Retarget only the landing bookkeeping of an existing story flight.
        if (sameStory) {
          if (plan.value?.story === previousIndex) plan.value = { ...plan.value, story: index };
          if (pending.value?.story === previousIndex)
            pending.value = { ...pending.value, story: index };
        } else {
          cancelFlight();
        }
        storyProgress.value = index;
      });
    },
    [cancelFlight, pending, plan, storyProgress],
  );
  const toStoryIfHeld = useCallback(
    (coords: LatLng, index: number, framing: number) =>
      scheduleOnUI(startUI, coords[0], coords[1], index, framing, true),
    [startUI],
  );
  const toPlace = useCallback(
    (coords: LatLng) => scheduleOnUI(startUI, coords[0], coords[1], -1, 0, false),
    [startUI],
  );

  return {
    flightT,
    requestEpoch,
    setFront,
    claimForDeck,
    cancelFlight,
    hold,
    toStory,
    remapStory,
    toStoryIfHeld,
    toPlace,
  };
}
