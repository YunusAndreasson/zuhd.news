import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  usePinchGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ANIMATION, EASING, WHITE } from '../../constants/theme';
import {
  anchorZoom,
  dragDelta,
  flingVelocity,
  MAX_LAT,
  pinchClip,
  pinchHandsBack,
  projScaleFor,
  takeCamera,
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
 *   turn the earth. A pinch holds where it is left — out to the whole planet
 *   too — and only one that ends back near the story's own framing hands zoom
 *   back to it (`pinchHandsBack`).
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

interface GlobeGestureLayerProps {
  globeRef: React.RefObject<MiniGlobeRef | null>;
  /** Distance from the top of the window to the top of the globe canvas. */
  canvasTop: number;
  /** The gesture surface starts below the header and ends at the moving sheet. */
  topChromeHeight: number;
  sheetPeekHeight: number;
  sheetFullHeight: number;
  sheetProgress: SharedValue<number>;
  cameraOwner: SharedValue<number>;
  cameraLat: SharedValue<number>;
  cameraLng: SharedValue<number>;
  /** Where the globe last drew the camera, whoever owned it. */
  viewLat: SharedValue<number>;
  viewLng: SharedValue<number>;
  /** `MiniGlobe`'s zoom override: 0 follows the story, 1 holds `zoomAngle`. */
  zoomActive: SharedValue<number>;
  zoomAngle: SharedValue<number>;
  /** Stop a flight *and* let go of the zoom it was holding
   *  (`useCameraFlight.cancelFlight`). A finger — one or two — stops a
   *  flight through this, never by stopping its tween alone. */
  cancelFlight: () => void;
  requestEpoch: SharedValue<number>;
  /** The clip in effect at the last projection, in degrees. */
  clip: SharedValue<number>;
  /** The clip the story in front would take on its own. */
  storyClip: SharedValue<number>;
  /** The globe disc, in canvas points. */
  radius: number;
  centerX: number;
  centerY: number;
  reduceMotion: boolean;
  onTap: (result: TapResult, epoch?: number) => void;
  /** A pinch has ended; redraw at full detail once `delayMs` has passed. */
  onZoomSettle: (delayMs: number) => void;
  onImpact: () => void;
  enabled?: boolean;
  /**
   * A story is open over the globe, and what shows of the earth is the strip
   * above it — on most phones the story's own place is under the sheet. Nothing
   * is hit-tested and nothing rotates, so the reader never turns the earth out
   * from under the story they are reading: a tap anywhere on it puts the story
   * back down.
   */
  collapseMode?: boolean;
  onCollapse?: () => void;
}

export const GlobeGestureLayer = memo(function GlobeGestureLayer({
  globeRef,
  canvasTop,
  topChromeHeight,
  sheetPeekHeight,
  sheetFullHeight,
  sheetProgress,
  cameraOwner,
  cameraLat,
  cameraLng,
  viewLat,
  viewLng,
  zoomActive,
  zoomAngle,
  cancelFlight,
  requestEpoch,
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
  // **Open and closed reach the gestures as shared values, not config**
  // (2026-09-24, profiled). Every open and close of the story changes
  // `enabled`/`collapseMode`, and a config that changes identity is pushed to
  // the native side whole — three of them, one per gesture:
  // `setGestureHandlerConfig` was 23 ms of an open's commit on the emulator.
  // RNGH 3 takes `enabled` as a `SharedValue` and updates it on the UI thread
  // with no push; the tap reads collapse mode from a ref, on JS, where it runs.
  const turnableSV = useSharedValue(turnable);
  const tapEnabledSV = useSharedValue(enabled || collapseMode);
  const collapseRef = useRef(collapseMode);
  useEffect(() => {
    turnableSV.value = turnable;
    tapEnabledSV.value = enabled || collapseMode;
    collapseRef.current = collapseMode;
  }, [turnable, enabled, collapseMode, turnableSV, tapEnabledSV]);
  // Header buttons and the story have their own gesture owners. Restrict the
  // native hit surface itself so their touches never reach the globe's pan,
  // pinch or tap recognizers (including the pan's flight-cancelling onBegin).
  const boundsStyle = useAnimatedStyle(() => {
    const progress = Math.max(0, Math.min(1, sheetProgress.value));
    return {
      top: topChromeHeight,
      bottom: sheetPeekHeight + (sheetFullHeight - sheetPeekHeight) * progress,
    };
  });

  const handleTap = useCallback(
    (x: number, y: number, epoch: number) => {
      if (epoch !== requestEpoch.value) return;
      if (collapseRef.current) {
        onCollapse?.();
        return;
      }
      // Tap coordinates are window-relative, independent of which native
      // view RNGH attaches to through its display:contents detector.
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
      onTap(result, epoch);
    },
    [canvasTop, globeRef, onCollapse, onImpact, onTap, requestEpoch],
  );

  const tapConfig = useMemo(
    () => ({
      enabled: tapEnabledSV,
      onDeactivate: ({
        absoluteX,
        absoluteY,
        canceled,
      }: {
        absoluteX: number;
        absoluteY: number;
        canceled: boolean;
      }) => {
        'worklet';
        if (canceled) return;
        scheduleOnRN(handleTap, absoluteX, absoluteY, requestEpoch.value);
      },
    }),
    [tapEnabledSV, handleTap, requestEpoch],
  );

  const panConfig = useMemo(
    () => ({
      enabled: turnableSV,
      // Enough travel that a slightly imprecise tap is still a tap.
      minDistance: 6,
      // One finger. Competing gestures go to whichever activates first, and a
      // pan with no pointer cap took every two-finger touch before the pinch
      // could — observed on the emulator: a pinch logged `pan activate` and
      // never `pinch activate`. A second finger now fails the pan; the pinch
      // turns the earth with two fingers itself.
      maxPointers: 1,
      onBegin: () => {
        'worklet';
        // A finger on the earth stops a glide or a flight, as it does on the
        // web. Stopping the flight's tween is not enough on its own: the zoom
        // override is the flight's, and a touch at the top of a long crossing
        // left the globe stranded at the height the curve had risen to until
        // the next pinch or settle. `cancelFlight` eases it back down.
        cancelFlight();
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
    [
      cameraLat,
      cameraLng,
      cameraOwner,
      cancelFlight,
      clip,
      radius,
      reduceMotion,
      turnableSV,
      viewLat,
      viewLng,
    ],
  );

  // The focus the last pinch update held, so the next one can keep that ground
  // under the fingers wherever they have moved.
  const focusX = useSharedValue(0);
  const focusY = useSharedValue(0);
  // A V3 detector's native coordinate view can differ from its styled parent.
  // Touch events expose both spaces, so derive the conversion from the actual
  // detector rather than adding the header's height to the focal point.
  const touchOffsetX = useSharedValue(0);
  const touchOffsetY = useSharedValue(0);
  const pinchConfig = useMemo(
    () => ({
      enabled: turnableSV,
      onTouchesDown: ({
        allTouches,
      }: {
        allTouches: { x: number; y: number; absoluteX: number; absoluteY: number }[];
      }) => {
        'worklet';
        const touch = allTouches[0];
        if (!touch) return;
        touchOffsetX.value = touch.absoluteX - touch.x;
        touchOffsetY.value = touch.absoluteY - touch.y;
      },
      onActivate: ({ focalX, focalY }: { focalX: number; focalY: number }) => {
        'worklet';
        // Through `cancelFlight`, as the pan does: stopping the tween alone
        // left the flight's plan standing, so the deck read a flight still
        // under way. Any zoom release it starts is cancelled just below — the
        // pinch takes the zoom from what is on screen.
        cancelFlight();
        cancelAnimation(cameraLat);
        cancelAnimation(cameraLng);
        cancelAnimation(zoomActive);
        cancelAnimation(zoomAngle);
        takeCamera(cameraOwner, cameraLat, cameraLng, viewLat, viewLng);
        // Start the override at the clip already on screen, so taking zoom
        // from the story — or from a hand-back still easing — moves nothing.
        zoomAngle.value = clip.value;
        zoomActive.value = 1;
        focusX.value = focalX + touchOffsetX.value;
        focusY.value = focalY + touchOffsetY.value - canvasTop;
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
        const x = focalX + touchOffsetX.value;
        const y = focalY + touchOffsetY.value - canvasTop;
        const cam = anchorZoom(
          focusX.value,
          focusY.value,
          x,
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
        focusX.value = x;
        focusY.value = y;
      },
      onDeactivate: () => {
        'worklet';
        // Pinched back out to the story's own framing: give zoom back to it.
        // Anything further out holds, so the whole planet can be looked at
        // with the fingers off the glass.
        const release = pinchHandsBack(zoomAngle.value, storyClip.value);
        // Reanimated snaps the hand-back itself under Reduce Motion; the
        // redraw timer below has to be told.
        const duration = reduceMotion ? 0 : ANIMATION.zoomRelease;
        if (release) {
          zoomActive.value = withTiming(0, {
            duration: ANIMATION.zoomRelease,
            easing: EASING.camera,
          });
        }
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
      touchOffsetX,
      touchOffsetY,
      centerX,
      centerY,
      cancelFlight,
      clip,
      focusX,
      focusY,
      onZoomSettle,
      radius,
      reduceMotion,
      storyClip,
      turnableSV,
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
    <Animated.View
      style={[styles.layer, boundsStyle]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <GestureDetector gesture={gesture}>
        <View style={styles.surface} collapsable={false} />
      </GestureDetector>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0 },
  surface: { flex: 1 },
});
