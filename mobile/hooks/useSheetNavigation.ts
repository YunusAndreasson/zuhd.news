import { useCallback, useState } from 'react';

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
  /** Pop one level; no-op at root. */
  pop: () => void;
  /** Jump back to root. */
  reset: () => void;
  depth: number;
}

export function useSheetNavigation<T extends string>(): SheetNavigation<T> {
  const [stack, setStack] = useState<T[]>([]);
  const push = useCallback((page: T) => setStack((s) => [...s, page]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 0 ? s.slice(0, -1) : s)), []);
  const reset = useCallback(() => setStack([]), []);
  return {
    current: stack.at(-1) ?? null,
    stack,
    push,
    pop,
    reset,
    depth: stack.length,
  };
}
