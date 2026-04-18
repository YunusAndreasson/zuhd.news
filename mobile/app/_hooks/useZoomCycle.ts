import { useCallback, useState } from 'react';
import { hapticTick } from '../../lib/haptics';

interface ZoomLevel {
  label: string;
  /** `null` defers to the scroll-adaptive projection; numeric values force
   *  that clip angle (lower = more zoom). */
  clip: number | null;
}

/** Cycle order when tapping the zoom pill. */
const ZOOM_LEVELS: ZoomLevel[] = [
  { label: '1×', clip: null },
  { label: '2×', clip: 15 },
  { label: '3×', clip: 8 },
  { label: '0.5×', clip: 90 },
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
  const current = ZOOM_LEVELS[index] ?? { label: '1×', clip: null };
  const toggle = useCallback(() => {
    hapticTick();
    setIndex((i) => (i + 1) % ZOOM_LEVELS.length);
  }, []);
  return { current, toggle };
}
