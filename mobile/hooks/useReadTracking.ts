import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getSnapshot, markRead } from '../lib/read-store';

/**
 * Long enough to take in a title and start the hook; a story swiped straight
 * past is not read, and the dock's track keeps it at full weight so the
 * reader can see what they skipped.
 *
 * It was 15 s of the *open* story until 2026-09-22, when the track began
 * drawing read stories: the resting card is the title and the hook, most of
 * the day is read that way, and a rule that only counted opened stories
 * would have left the track looking unread after a whole morning of reading.
 */
export const READ_DWELL_MS = 2_000;

/** Count only an uninterrupted view of the story in front, unobscured. */
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
