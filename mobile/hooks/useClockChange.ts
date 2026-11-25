import { useEffect, useEffectEvent } from 'react';
import { AppState } from 'react-native';
import { clearArticleDateFormat } from '../lib/article-utils';
import { clockChanged } from '../lib/clock-change';

function readClock() {
  return { wall: Date.now(), elapsed: performance.now(), offset: new Date().getTimezoneOffset() };
}

/** Check the clock while foregrounded, including changes made while the app was away. */
export function useClockChange(onChange: () => void) {
  const changed = useEffectEvent(onChange);
  useEffect(() => {
    let previous = readClock();
    let timer: ReturnType<typeof setInterval> | undefined;
    const check = () => {
      const next = readClock();
      const didChange = clockChanged(previous, next);
      previous = next;
      if (didChange) {
        clearArticleDateFormat();
        changed();
      }
    };
    const update = (state: typeof AppState.currentState) => {
      clearInterval(timer);
      if (state === 'active') {
        check();
        timer = setInterval(check, 2000);
      }
    };
    update(AppState.currentState);
    const sub = AppState.addEventListener('change', update);
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
}
