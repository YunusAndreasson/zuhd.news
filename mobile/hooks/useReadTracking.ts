import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getSnapshot, markRead } from '../lib/read-store';

export const READ_DWELL_MS = 15_000;

/** Count only an uninterrupted view of the expanded, unobscured article. */
export function useReadTracking(slug: string | null, visible: boolean): void {
  useEffect(() => {
    if (!slug || !visible || getSnapshot().has(slug)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const start = () => {
      cancel();
      if (AppState.currentState === 'active' && !getSnapshot().has(slug)) {
        timer = setTimeout(() => {
          if (AppState.currentState === 'active') markRead(slug);
        }, READ_DWELL_MS);
      }
    };
    const change = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else cancel();
    });
    // Android can lose focus to the notification shade while still active.
    const blur = AppState.addEventListener('blur', cancel);
    const focus = AppState.addEventListener('focus', start);
    start();
    return () => {
      cancel();
      change.remove();
      blur.remove();
      focus.remove();
    };
  }, [slug, visible]);
}
