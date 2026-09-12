import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  usePinchGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { MiniGlobeRef, TapResult } from '../globe/MiniGlobe';

/**
 * The earth, as something you can touch.
 *
 * The globe canvas is `pointerEvents="none"` — it always has been — and a
 * sibling view collects the touches and asks the renderer what is under them.
 * That much is unchanged from the article reader's `GlobeTapZone`. What is new
 * is the other two gestures.
 *
 * ## Why drag and pinch exist now
 *
 * The camera used to be the scroll position and nothing else, which was right
 * when the globe was a backdrop: it was ground under the story you were
 * reading, and there was nothing to look for on it. As the home screen it
 * visibly promises to be a map, and a map that cannot be turned is a picture
 * of a map. A drag hands the camera to the finger until the next list scroll
 * takes it back — see `cameraOwner` in `MiniGlobe`.
 *
 * ## Why it runs at 30fps and that is correct
 *
 * The rotation feeds the same reprojection pipeline the scroll does, under the
 * same 32 ms throttle and the same latest-only backpressure. A projection is
 * ~5 ms p95 on the JS thread and the comment above the throttle records what
 * happened at 16 ms: d3-geo plus `setState` could not finish inside a frame
 * and the thread was overwhelmed. Sixty is not available at any price worth
 * paying, and a drag that tracks at thirty reads as weight, not as lag.
 *
 * ## Degrees per pixel
 *
 * Scaled by the clip angle so the earth turns under the finger at roughly the
 * same surface speed whatever the zoom — dragging an inch at 10° of clip moves
 * a much smaller arc than an inch at 90°. Latitude is clamped short of the
 * poles: an orthographic projection at ±90° has no defined "up", and the
 * graticule tears.
 */

/** Degrees of rotation per point of drag at full (90°) clip. */
const DEG_PER_PX = 0.28;
/** Past this the pole is under the cursor and the projection has no up. */
const MAX_LAT = 82;
/** The widest clip, and the reference the drag speed is scaled against. */
const MAX_CLIP = 90;
/** How far a pinch must travel before it steps a zoom level. Generous: a
 *  level change is a 260 ms animation, and one per accidental two-finger
 *  wobble would make the earth lurch. */
const PINCH_STEP = 1.35;

interface GlobeGestureLayerProps {
  globeRef: React.RefObject<MiniGlobeRef | null>;
  /** Distance from the top of the window to the top of the globe canvas. */
  canvasTop: number;
  cameraOwner: SharedValue<number>;
  cameraLat: SharedValue<number>;
  cameraLng: SharedValue<number>;
  /**
   * The clip angle currently in effect, in degrees. A plain number: it only
   * scales the drag, and it changes at most three times in a session.
   */
  clip: number;
  onTap: (result: TapResult) => void;
  /** One discrete zoom level in (`1`) or out (`-1`). */
  onZoomStep: (direction: 1 | -1) => void;
  onImpact: () => void;
  enabled?: boolean;
}

export const GlobeGestureLayer = memo(function GlobeGestureLayer({
  globeRef,
  canvasTop,
  cameraOwner,
  cameraLat,
  cameraLng,
  clip,
  onTap,
  onZoomStep,
  onImpact,
  enabled = true,
}: GlobeGestureLayerProps) {
  const handleTap = useCallback(
    (x: number, y: number) => {
      const localY = y - canvasTop;
      const result = globeRef.current?.hitTest(x, localY);
      // Nothing under the finger: no pulse. The ring is a confirmation that
      // something was found, and drawing it over empty ocean would claim
      // there had been.
      if (!result) return;
      globeRef.current?.showPulse(x, localY);
      onImpact();
      onTap(result);
    },
    [canvasTop, globeRef, onImpact, onTap],
  );

  const tapConfig = useMemo(
    () => ({
      enabled,
      onDeactivate: ({ x, y, canceled }: { x: number; y: number; canceled: boolean }) => {
        'worklet';
        if (canceled) return;
        scheduleOnRN(handleTap, x, y);
      },
    }),
    [enabled, handleTap],
  );

  const panConfig = useMemo(
    () => ({
      enabled,
      // Enough travel that a slightly imprecise tap is still a tap.
      minDist: 6,
      onActivate: () => {
        'worklet';
        cameraOwner.value = 1;
      },
      onUpdate: ({ changeX, changeY }: { changeX: number; changeY: number }) => {
        'worklet';
        // At a tight clip the visible arc is small, so the same finger travel
        // should turn the earth less. `clip / MAX_CLIP` is that ratio.
        const scale = (DEG_PER_PX * clip) / MAX_CLIP;
        let lng = cameraLng.value - changeX * scale;
        // Keep longitude in (−180, 180] so the slerp that resumes on the next
        // scroll does not take the long way round.
        if (lng > 180) lng -= 360;
        if (lng < -180) lng += 360;
        cameraLng.value = lng;
        const lat = cameraLat.value + changeY * scale;
        cameraLat.value = lat > MAX_LAT ? MAX_LAT : lat < -MAX_LAT ? -MAX_LAT : lat;
      },
    }),
    [cameraLat, cameraLng, cameraOwner, clip, enabled],
  );

  // One step per gesture. `armed` reopens on the next pinch, so a long
  // two-finger drag cannot walk through every level.
  const armed = useSharedValue(true);
  const pinchConfig = useMemo(
    () => ({
      enabled,
      onActivate: () => {
        'worklet';
        armed.value = true;
      },
      onUpdate: ({ scale }: { scale: number }) => {
        'worklet';
        if (!armed.value) return;
        if (scale > PINCH_STEP) {
          armed.value = false;
          scheduleOnRN(onZoomStep, 1);
        } else if (scale < 1 / PINCH_STEP) {
          armed.value = false;
          scheduleOnRN(onZoomStep, -1);
        }
      },
    }),
    [armed, enabled, onZoomStep],
  );

  const tap = useTapGesture(tapConfig);
  const pan = usePanGesture(panConfig);
  const pinch = usePinchGesture(pinchConfig);
  // Competing, not simultaneous: a two-finger pinch and a one-finger drag are
  // different intentions and letting both run turns a zoom into a lurch.
  const gesture = useCompetingGestures(pinch, pan, tap);

  return (
    <GestureDetector gesture={gesture}>
      {/* Hidden from the accessibility tree, deliberately and for the same
          reason the reader's tap zone is: VoiceOver activates an element at
          its geometric centre, which on a globe is a lottery country. Every
          mark that matters has a row — in the strip, the NOW block or the
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
