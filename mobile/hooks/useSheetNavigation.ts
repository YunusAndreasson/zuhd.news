import { useCallback, useRef, useState } from 'react';

/** Which way the last change of page went: forward, back, or none (the
 *  root, as the sheet opens). A new object for every change, so a transition
 *  can run once for each. */
export interface SheetMove {
  direction: 1 | -1 | 0;
}

/**
 * Stack-based navigation for multi-page bottom sheets. Each page is an
 * opaque string key — the consuming component renders the matching content.
 *
 * `reset()` is called on sheet dismiss so the next open starts at the root.
 */
export interface SheetNavigation<T extends string> {
  /** Top of stack — `null` means root (no page pushed). */
  current: T | null;
  /** Full navigation stack, root-first. */
  stack: T[];
  push: (page: T) => void;
  /** Pop one level. Returns false at the root or during a back transition. */
  pop: () => boolean;
  /** Jump back to root. */
  reset: () => void;
  depth: number;
  move: SheetMove;
}

interface State<T extends string> {
  stack: T[];
  move: SheetMove;
}

const AT_REST: SheetMove = { direction: 0 };
// Match a rapid press burst even after the parent page has drawn its own Back.
const BACK_PRESS_BURST_MS = 350;

export function useSheetNavigation<T extends string>(): SheetNavigation<T> {
  const [{ stack, move }, setState] = useState<State<T>>({ stack: [], move: AT_REST });
  const backUntil = useRef(-Infinity);
  const push = useCallback(
    (page: T) => setState((s) => ({ stack: [...s.stack, page], move: { direction: 1 } })),
    [],
  );
  const pop = useCallback(() => {
    const now = performance.now();
    if (!stack.length) return false;
    const withinBurst = now < backUntil.current;
    backUntil.current = now + BACK_PRESS_BURST_MS;
    if (withinBurst) return false;
    setState((s) =>
      s.stack === stack ? { stack: stack.slice(0, -1), move: { direction: -1 } } : s,
    );
    return true;
  }, [stack]);
  const reset = useCallback(() => {
    backUntil.current = -Infinity;
    setState((s) => (s.stack.length > 0 ? { stack: [], move: AT_REST } : s));
  }, []);
  return {
    current: stack.at(-1) ?? null,
    stack,
    push,
    pop,
    reset,
    depth: stack.length,
    move,
  };
}
