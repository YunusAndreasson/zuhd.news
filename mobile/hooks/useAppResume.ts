import { useEffect, useEffectEvent, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Runs a callback when the app returns to the foreground after being
 * backgrounded for longer than `staleMs` milliseconds.
 */
export function useAppResume(onResume: () => void, staleMs: number) {
  const lastActiveRef = useRef(Date.now());

  const handleResume = useEffectEvent(() => {
    const away = Date.now() - lastActiveRef.current;
    if (away > staleMs) onResume();
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        lastActiveRef.current = Date.now();
      }
      if (state === 'active') {
        handleResume();
      }
    });
    return () => sub.remove();
  }, []);
}
