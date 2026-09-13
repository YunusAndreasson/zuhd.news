import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  usePinchGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Easing,
  type SharedValue,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { WHITE } from '../../constants/theme';
import {
  anchorZoom,
  dragDelta,
  flingVelocity,
  MAX_LAT,
  pinchClip,
  projScaleFor,
} from '../../lib/globe-camera';
import type { MiniGlobeRef, TapResult } from '../globe/MiniGlobe';

/**
 * The earth, as something you can touch.
 *
 * The globe canvas is `pointerEvents="none"` — it always has been — and a
 * sibling view collects the touches and asks the renderer what is under them.
 *
 * ## It moves the way the web's map moves
 *
 * The website's globe felt more natural than this one for three reasons, none
 * of them the renderer: the ground drifted out from under the finger, a released
 * drag stopped dead, and a pinch jumped between three zoom levels. MapLibre does
 * none of that, so neither does this:
 *
 * - **The ground stays under the finger.** A drag converts points to degrees at
 *   the projection's own scale (`dragDelta`), which is `radius / sin(clip)` — the
 *   old fixed `0.28° · clip/90` turned the earth at half the finger's speed at a
 *   tight zoom.
 * - **A release glides.** `withDecay` on the camera, from the release velocity
 *   capped at MapLibre's 1400 pt/s. A touch stops it. Reduce Motion drops the
 *   glide: it is momentum the reader did not ask for, where the drag itself is
 *   direct manipulation and is not gated.
 * - **A pinch zooms continuously, about the fingers.** It writes the clip
 *   override `MiniGlobe` already reads, and turns the camera so the ground under
 *   the fingers stays there (`anchorZoom`), which also makes a two-finger drag
 *   turn the earth. Pinching out to the story's own framing hands zoom back to it.
 *
 * All three feed the same reprojection pipeline the deck does, under the same
 * throttle and latest-only backpressure — see `MiniGlobe`.
 *
 * ## Where a gesture picks the camera up
 *
 * `cameraLat` / `cameraLng` only mean something while a target owns the camera.
 * While the deck owns it they keep whatever the last flight left, so a gesture
 * that took the camera from them snapped the earth back to a story the reader
 * had already swiped past. A gesture starts from `viewLat` / `viewLng` instead:
 * where the globe last drew the camera, whoever was moving it.
 *
 * Latitude is clamped short of the poles: an orthographic projection at ±90°
 * has no defined "up", and the graticule tears.
 */

/** Per-frame velocity retention while a released drag glides. Reanimated's
 *  0.998 default coasts for seconds; this settles in about half of one, which
 *  is what a MapLibre throw feels like. */
const FLING_DECELERATION = 0.994;
/** How long zoom takes to hand back to the story's framing. */
export const ZOOM_RELEASE_MS = 260;
export const ZOOM_EASING = Easing.inOut(Easing.cubic);

/** Take the camera for a gesture, starting from where it was last drawn. */
function takeCamera(
  owner: SharedValue<number>,
  lat: SharedValue<number>,
  lng: SharedValue<number>,
  viewLat: SharedValue<number>,
  viewLng: SharedValue<number>,
) {
  'worklet';
  if (owner.value === 1) return;
  lat.value = viewLat.value;
  lng.value = viewLng.value;
  owner.value = 1;
}

interface GlobeGestureLayerProps {
  globeRef: React.RefObject<MiniGlobeRef | null>;
  /** Distance from the top of the window to the top of the globe canvas. */
  canvasTop: number;
  cameraOwner: SharedValue<number>;
  cameraLat: SharedValue<number>;
  cameraLng: SharedValue<number>;
  /** Where the globe last drew the camera, whoever owned it. */
  viewLat: SharedValue<number>;
  viewLng: SharedValue<number>;
  /** `MiniGlobe`'s zoom override: 0 follows the story, 1 holds `zoomAngle`. */
  zoomActive: SharedValue<number>;
  zoomAngle: SharedValue<number>;
  /** The clip in effect at the last projection, in degrees. */
  clip: SharedValue<number>;
  /** The clip the story in front would take on its own. */
  storyClip: SharedValue<number>;
  /** The globe disc, in canvas points. */
  radius: number;
  centerX: number;
  centerY: number;
  reduceMotion: boolean;
  onTap: (result: TapResult) => void;
  /** A pinch has ended; redraw at full detail once `delayMs` has passed. */
  onZoomSettle: (delayMs: number) => void;
  onImpact: () => void;
  enabled?: boolean;
  /**
   * The sheet is grown and the globe is drawn scaled into a band above it.
   * Marks are not where the projection thinks they are, so nothing is
   * hit-tested and nothing rotates: a tap anywhere on the earth puts the story
   * back down.
   */
  collapseMode?: boolean;
  onCollapse?: () => void;
}

export const GlobeGestureLayer = memo(function GlobeGestureLayer({
  globeRef,
  canvasTop,
  cameraOwner,
  cameraLat,
  cameraLng,
  viewLat,
  viewLng,
  zoomActive,
  zoomAngle,
  clip,
  storyClip,
  radius,
  centerX,
  centerY,
  reduceMotion,
  onTap,
  onZoomSettle,
  onImpact,
  enabled = true,
  collapseMode = false,
  onCollapse,
}: GlobeGestureLayerProps) {
  const turnable = enabled && !collapseMode;
  const handleTap = useCallback(
    (x: number, y: number) => {
      if (collapseMode) {
        onCollapse?.();
        return;
      }
      const localY = y - canvasTop;
      const result = globeRef.current?.hitTest(x, localY);
      // Nothing under the finger: no pulse. The ring is a confirmation that
      // something was found, and drawing it over empty ocean would claim
      // there had been.
      if (!result) return;
      // A story is found, not selected: its own hue bursts where the mark was,
      // in place of the neutral selection ring every other mark gets.
      if (result.storySlug) globeRef.current?.collect(x, localY, result.storyColor ?? WHITE);
      else globeRef.current?.showPulse(x, localY);
      onImpact();
      onTap(result);
    },
    [canvasTop, collapseMode, globeRef, onCollapse, onImpact, onTap],
  );

  const tapConfig = useMemo(
    () => ({
      enabled: enabled || collapseMode,
      onDeactivate: ({ x, y, canceled }: { x: number; y: number; canceled: boolean }) => {
        'worklet';
        if (canceled) return;
        scheduleOnRN(handleTap, x, y);
      },
    }),
    [collapseMode, enabled, handleTap],
  );

  const panConfig = useMemo(
    () => ({
      enabled: turnable,
      // Enough travel that a slightly imprecise tap is still a tap.
      minDist: 6,
      // One finger. Competing gestures go to whichever activates first, and a
      // pan with no pointer cap took every two-finger touch before the pinch
      // could — observed on the emulator: a pinch logged `pan activate` and
      // never `pinch activate`. A second finger now fails the pan; the pinch
      // turns the earth with two fingers itself.
      maxPointers: 1,
      onBegin: () => {
        'worklet';
        // A finger on the earth stops a glide or a flight, as it does on the web.
        cancelAnimation(cameraLat);
        cancelAnimation(cameraLng);
      },
      onActivate: () => {
        'worklet';
        takeCamera(cameraOwner, cameraLat, cameraLng, viewLat, viewLng);
      },
      onUpdate: ({ changeX, changeY }: { changeX: number; changeY: number }) => {
        'worklet';
        const d = dragDelta(changeX, changeY, clip.value, radius, cameraLat.value);
        // Keep longitude in (−180, 180] so the slerp that resumes on the next
        // scroll does not take the long way round.
        let lng = cameraLng.value + d.dLng;
        if (lng > 180) lng -= 360;
        if (lng < -180) lng += 360;
        cameraLng.value = lng;
        const lat = cameraLat.value + d.dLat;
        cameraLat.value = lat > MAX_LAT ? MAX_LAT : lat < -MAX_LAT ? -MAX_LAT : lat;
      },
      onDeactivate: ({
        velocityX,
        velocityY,
        canceled,
      }: {
        velocityX: number;
        velocityY: number;
        canceled: boolean;
      }) => {
        'worklet';
        if (canceled || reduceMotion) return;
        const v = flingVelocity(velocityX, velocityY, clip.value, radius, cameraLat.value);
        if (v.vLng === 0 && v.vLat === 0) return;
        cameraLng.value = withDecay({ velocity: v.vLng, deceleration: FLING_DECELERATION });
        cameraLat.value = withDecay({
          velocity: v.vLat,
          deceleration: FLING_DECELERATION,
          clamp: [-MAX_LAT, MAX_LAT],
        });
      },
    }),
    [cameraLat, cameraLng, cameraOwner, clip, radius, reduceMotion, turnable, viewLat, viewLng],
  );

  // The focus the last pinch update held, so the next one can keep that ground
  // under the fingers wherever they have moved.
  const focusX = useSharedValue(0);
  const focusY = useSharedValue(0);
  const pinchConfig = useMemo(
    () => ({
      enabled: turnable,
      onActivate: ({ focalX, focalY }: { focalX: number; focalY: number }) => {
        'worklet';
        cancelAnimation(cameraLat);
        cancelAnimation(cameraLng);
        cancelAnimation(zoomActive);
        cancelAnimation(zoomAngle);
        takeCamera(cameraOwner, cameraLat, cameraLng, viewLat, viewLng);
        // Start the override at the clip already on screen, so taking zoom
        // from the story — or from a hand-back still easing — moves nothing.
        zoomAngle.value = clip.value;
        zoomActive.value = 1;
        focusX.value = focalX;
        focusY.value = focalY - canvasTop;
      },
      onUpdate: ({
        scaleChange,
        focalX,
        focalY,
        numberOfPointers,
      }: {
        scaleChange: number;
        focalX: number;
        focalY: number;
        numberOfPointers: number;
      }) => {
        'worklet';
        // The frames while a finger lifts carry one pointer: the focal point
        // snaps to the finger that stayed and the scale collapses (0.47 was
        // observed), which read as a lurch of the earth at the end of every
        // pinch. Only a two-finger frame is a pinch.
        if (numberOfPointers < 2) return;
        const from = zoomAngle.value;
        const to = pinchClip(from, scaleChange);
        const y = focalY - canvasTop;
        const cam = anchorZoom(
          focusX.value,
          focusY.value,
          focalX,
          y,
          cameraLng.value,
          cameraLat.value,
          projScaleFor(from, radius),
          projScaleFor(to, radius),
          centerX,
          centerY,
        );
        zoomAngle.value = to;
        if (cam) {
          cameraLng.value = cam.lng;
          cameraLat.value = cam.lat;
        }
        focusX.value = focalX;
        focusY.value = y;
      },
      onDeactivate: () => {
        'worklet';
        // Pinched back out to the story's own framing: give zoom back to it.
        const release = zoomAngle.value >= storyClip.value - 0.5;
        const duration = reduceMotion ? 0 : ZOOM_RELEASE_MS;
        if (release) zoomActive.value = withTiming(0, { duration, easing: ZOOM_EASING });
        // A JS timer, never an animation callback: `scheduleOnRN` from a
        // completion worklet aborts the app (worklets 0.10).
        scheduleOnRN(onZoomSettle, release ? duration + 50 : 0);
      },
    }),
    [
      cameraLat,
      cameraLng,
      cameraOwner,
      canvasTop,
      centerX,
      centerY,
      clip,
      focusX,
      focusY,
      onZoomSettle,
      radius,
      reduceMotion,
      storyClip,
      turnable,
      viewLat,
      viewLng,
      zoomActive,
      zoomAngle,
    ],
  );

  const tap = useTapGesture(tapConfig);
  const pan = usePanGesture(panConfig);
  const pinch = usePinchGesture(pinchConfig);
  // Competing, not simultaneous: a two-finger pinch and a one-finger drag are
  // different intentions. The pinch turns the earth with the fingers itself.
  const gesture = useCompetingGestures(pinch, pan, tap);

  return (
    <GestureDetector gesture={gesture}>
      {/* Hidden from the accessibility tree, deliberately and for the same
          reason the reader's tap zone is: VoiceOver activates an element at
          its geometric centre, which on a globe is a lottery country. Every
          mark that matters has a row — in the strip, the alert block or the
          instruments sheet — and those rows are the accessible path. */}
      <View
        style={styles.layer}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
