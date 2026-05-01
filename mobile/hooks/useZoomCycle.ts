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
}

/** Owns the zoom-level state that drives MiniGlobe's projection clip. */
export function useZoomCycle(): ZoomCycle {
  const [index, setIndex] = useState(DEFAULT_INDEX);
  const current = ZOOM_LEVELS[index] ?? { label: 'zoom', clip: null };
  const toggle = useCallback(() => {
    hapticTick();
    setIndex((i) => (i + 1) % ZOOM_LEVELS.length);
  }, []);
  return { current, toggle };
}
