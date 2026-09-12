import { useCallback, useState } from 'react';
import { hapticTick } from '../lib/haptics';

interface ZoomLevel {
  label: string;
  /** `null` defers to the scroll-adaptive projection; numeric values force
   *  that clip angle (lower = more zoom). */
  clip: number | null;
}

/** Cycle order when tapping the zoom pill.
 *  No 0.5× — orthographic can't show more than a hemisphere, and the
 *  adaptive 1× clip is already 90° for any country ≥ 0.03 sr, so a
 *  clip: 90 preset would be identical to 1× for most articles. */
const ZOOM_LEVELS: ZoomLevel[] = [
  { label: 'zoom', clip: null },
  { label: 'zoom', clip: 18 },
  { label: 'zoom', clip: 10 },
];

const DEFAULT_INDEX = 0;

interface ZoomCycle {
  /** Label + clip for the current zoom level. */
  current: ZoomLevel;
  /** Advance to the next zoom level (wraps). */
  toggle: () => void;
  /**
   * Move one level in or out, clamped rather than wrapped.
   *
   * This is what a pinch drives. A pinch does *not* write a continuous clip
   * angle: `MiniGlobe` fades between the scroll-adaptive projection and a
   * fixed override through two shared values and a 260 ms animation, and
   * feeding that a new target every frame would mean either re-rendering a
   * 3,500-line component sixty times a second or building a second path into
   * the zoom state machine. Snapping to the levels that already exist gets
   * the gesture for the cost of one call, and the transition is the same
   * animation the control uses.
   *
   * Clamped, not wrapped, because wrapping under a continuous gesture means
   * pinching out past the last level jumps you back to the first.
   */
  step: (direction: 1 | -1) => void;
}

/** Owns the zoom-level state that drives MiniGlobe's projection clip. */
export function useZoomCycle(): ZoomCycle {
  const [index, setIndex] = useState(DEFAULT_INDEX);
  const current = ZOOM_LEVELS[index] ?? { label: 'zoom', clip: null };
  const toggle = useCallback(() => {
    hapticTick();
    setIndex((i) => (i + 1) % ZOOM_LEVELS.length);
  }, []);
  const step = useCallback((direction: 1 | -1) => {
    setIndex((i) => {
      const next = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, i + direction));
      if (next !== i) hapticTick();
      return next;
    });
  }, []);
  return { current, toggle, step };
}
