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
  const previousStateRef = useRef(AppState.currentState);
  const awayStartedAtRef = useRef<number | null>(
    AppState.currentState === 'active' ? null : Date.now(),
  );

  const handleResume = useEffectEvent(() => {
    const awayStartedAt = awayStartedAtRef.current;
    // Re-arm before firing: consecutive `active` events must not re-fire from
    // the same transition.
    awayStartedAtRef.current = null;
    if (awayStartedAt !== null && Date.now() - awayStartedAt > staleMs) onResume();
  });

  const handleBackground = useEffectEvent(() => {
    onBackground?.();
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const previousState = previousStateRef.current;

      // Start the clock only once when leaving active. iOS commonly emits
      // active -> inactive -> background; resetting it on both transitions
      // undercounts the actual time away.
      if (previousState === 'active' && state !== 'active') {
        awayStartedAtRef.current = Date.now();
      }
      if (state === 'background' && previousState !== 'background') {
        handleBackground();
      }
      if (state === 'active' && previousState !== 'active') {
        handleResume();
      }
      previousStateRef.current = state;
    });
    return () => sub.remove();
  }, []);
}
