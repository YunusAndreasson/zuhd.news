import { useCallback } from 'react';
import {
  cancelAnimation,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { EASING } from '../constants/theme';
import {
  arcDegrees,
  flightDuration,
  slerpLatLng,
  swipeClip,
  takeCamera,
} from '../lib/globe-camera';
import type { LatLng } from '../lib/now';

/**
 * Sending the camera somewhere — a tapped mark, a scrubbed-to story, a gauge,
 * an alert — the way a swipe sends it.
 *
 * A swipe between two stories turns the globe along the great circle between
 * them, rising in proportion to the distance and coming down close over the
 * next (`swipeClip`). A jump used to do neither: it tweened latitude and
 * longitude separately at the zoom it started with, so a story on the far
 * side of the planet whipped past at close range. And while a flight held the
 * camera the globe kept the *previous* story's framing and highlight — they
 * are only refreshed while the deck owns the camera — so they popped to the new
 * story when the camera was handed back, or, after a jump, not until the
 * reader next swiped.
 *
 * A flight here is one progress value, `flightT`, eased 0 → 1 over a time set
 * by the distance (`flightDuration`). A reaction on the UI thread turns it into
 * a point on the great circle and a clip through the zoom override the pinch
 * already uses — out, across and down, the swipe's shape. A flight to a story
 * lands on that story's own framing and, on the same frame, releases the
 * override and hands the camera back to the deck, which is then drawing
 * exactly what the flight ended on: nothing moves, and the highlight and the
 * place's label arrive with the landing. A flight to a place that is not a
 * story keeps the camera there and returns to the zoom it left at.
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
  fromClip: number;
  toClip: number;
  travel: number;
  /** A story's index to hand the camera back at, or -1 for a place. */
  story: number;
  /** A pinch zoom was in effect when a place flight began: keep it. */
  wasZoomed: boolean;
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
  /** Hold the camera where it is drawn, before the deck jumps under it. */
  hold: () => void;
  /** Fly to story `index`, land on its framing, and hand the camera back. */
  toStory: (coords: LatLng, index: number, framing: number) => void;
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
  const frontLat = useSharedValue(Number.NaN);
  const frontLng = useSharedValue(Number.NaN);

  const holdUI = useCallback(() => {
    'worklet';
    takeCamera(cameraOwner, cameraLat, cameraLng, viewLat, viewLng);
  }, [cameraLat, cameraLng, cameraOwner, viewLat, viewLng]);

  const startUI = useCallback(
    (lat: number, lng: number, story: number, framing: number, onlyIfHeld: boolean) => {
      'worklet';
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
      const travel = arcDegrees(fromLat, fromLng, lat, lng);
      plan.value = {
        fromLat,
        fromLng,
        toLat: lat,
        toLng: lng,
        fromClip,
        toClip: story >= 0 && framing > 0 ? framing : fromClip,
        travel,
        story,
        wasZoomed: zoomActive.value > 0.5,
      };
      // Start the override at the clip already on screen, so taking zoom from
      // the story moves nothing on the first frame.
      zoomAngle.value = fromClip;
      zoomActive.value = 1;
      flightT.value = 0;
      // Reanimated snaps this to its end under Reduce Motion: the camera is
      // placed at once, and the landing below still runs.
      flightT.value = withTiming(1, { duration: flightDuration(travel), easing: EASING.camera });
    },
    [
      cameraLat,
      cameraLng,
      cameraOwner,
      clip,
      flightT,
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
      const p = plan.value;
      if (!p) return;
      const point = slerpLatLng(p.fromLat, p.fromLng, p.toLat, p.toLng, t);
      cameraLat.value = point[0];
      cameraLng.value = point[1];
      zoomAngle.value = swipeClip(p.fromClip, p.toClip, t, p.travel);
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
  );

  const claimForDeck = useCallback(() => {
    'worklet';
    if (cameraOwner.value !== 1) return;
    const lat = frontLat.value;
    const lng = frontLng.value;
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    let dLng = Math.abs(cameraLng.value - lng) % 360;
    if (dLng > 180) dLng = 360 - dLng;
    if (Math.abs(cameraLat.value - lat) >= HANDOFF_DEGREES || dLng >= HANDOFF_DEGREES) return;
    // Close enough to be the same frame. A flight still under way is at its
    // start or its end, where its zoom is the story's own, so it can stop.
    const p = plan.value;
    if (p) {
      cancelAnimation(flightT);
      plan.value = null;
      if (p.story >= 0 || !p.wasZoomed) zoomActive.value = 0;
    }
    cameraOwner.value = 0;
  }, [cameraLat, cameraLng, cameraOwner, flightT, frontLat, frontLng, plan, zoomActive]);

  const setFront = useCallback(
    (coords: LatLng | null) => {
      frontLat.value = coords ? coords[0] : Number.NaN;
      frontLng.value = coords ? coords[1] : Number.NaN;
    },
    [frontLat, frontLng],
  );

  const hold = useCallback(() => scheduleOnUI(holdUI), [holdUI]);
  const toStory = useCallback(
    (coords: LatLng, index: number, framing: number) =>
      scheduleOnUI(startUI, coords[0], coords[1], index, framing, false),
    [startUI],
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

  return { flightT, setFront, claimForDeck, hold, toStory, toStoryIfHeld, toPlace };
}
