import { useEffect, useEffectEvent, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Runs a callback when the app returns to the foreground after being away
 * for longer than `staleMs` milliseconds.
 * Optionally runs `onBackground` when the app enters the background.
 *
 * "Away" is measured from the moment the app leaves the active state. On iOS
 * that includes `inactive` — control center, notification shade, share sheets
 * and permission dialogs go inactive → active without ever reaching
 * `background`, so timing from the last `background` event would count the
 * whole foreground session as time away and fire spuriously.
 */
export function useAppResume(onResume: () => void, staleMs: number, onBackground?: () => void) {
  const lastActiveRef = useRef(Date.now());

  const handleResume = useEffectEvent(() => {
    const away = Date.now() - lastActiveRef.current;
    // Re-arm before firing: consecutive `active` events must not re-fire off
    // the same stale timestamp.
    lastActiveRef.current = Date.now();
    if (away > staleMs) onResume();
  });

  const handleAway = useEffectEvent((toBackground: boolean) => {
    lastActiveRef.current = Date.now();
    if (toBackground) onBackground?.();
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        handleAway(state === 'background');
      } else if (state === 'active') {
        handleResume();
      }
    });
    return () => sub.remove();
  }, []);
}
