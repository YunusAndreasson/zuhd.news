import { useEffect, useEffectEvent, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Runs a callback when the app returns to the foreground after being
 * backgrounded for longer than `staleMs` milliseconds.
 * Optionally runs `onBackground` when the app enters the background.
 */
export function useAppResume(
  onResume: () => void,
  staleMs: number,
  onBackground?: () => void,
) {
  const lastActiveRef = useRef(Date.now());

  const handleResume = useEffectEvent(() => {
    const away = Date.now() - lastActiveRef.current;
    if (away > staleMs) onResume();
  });

  const handleBackground = useEffectEvent(() => {
    lastActiveRef.current = Date.now();
    onBackground?.();
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        handleBackground();
      }
      if (state === 'active') {
        handleResume();
      }
    });
    return () => sub.remove();
  }, []);
}
