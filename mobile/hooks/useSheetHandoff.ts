import { type RefObject, useCallback, useEffect, useRef } from 'react';

const HANDOFF_TIMEOUT_MS = 700;

/** Wait for the first platform sheet to dismiss before presenting the next.
 * The fallback handles a source sheet that was already closed and emits no
 * dismissal. Only the latest requested destination is retained. */
export function useSheetHandoff() {
  const pending = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSheetHandOff = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    next?.();
  }, []);
  const handOffSheet = useCallback(
    (from: RefObject<{ dismiss: () => void } | null>, next: () => void) => {
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(runSheetHandOff, HANDOFF_TIMEOUT_MS);
      from.current?.dismiss();
    },
    [runSheetHandOff],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      pending.current = null;
    },
    [],
  );
  return { handOffSheet, runSheetHandOff };
}
