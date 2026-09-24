import { HOUR_MS } from './time';

/**
 * Where a reader lands when they come back to the app (2026-09-23, the
 * user's request: a return should feel smooth, and it should be clear where
 * to pick up).
 *
 * - **A short break keeps your place.** Under an hour away the reader is
 *   mid-day: the story they were on stays in front, and if stories arrived a
 *   toast says how many and takes them there on a tap.
 * - **A long break starts the day again.** An hour or more away — or a launch
 *   — lands on the day's front: its top stories, then the newest, with
 *   `· earlier` marking where the stories already had begin. The river has
 *   moved on by then, and the story left in front is rarely where anyone
 *   wants to resume.
 * - **A launch the reader has already moved in keeps their place.** The
 *   network can answer after the first swipe; pulling the reader back to the
 *   front would be the jump this exists to remove.
 *
 * Either way the reader never sees a story swapped in place: staying is the
 * slug anchor, and the front is reached by a flight (`focusStory`).
 */

export const RESUME_TOP_AFTER_MS = HOUR_MS;

export type ResumeLanding = 'front' | 'toast' | 'stay';

export function resumeLanding({
  awayMs,
  coldStart,
  added,
  readerMoved,
}: {
  awayMs: number;
  coldStart: boolean;
  /** Stories in the feed now that were not when the reader left. */
  added: number;
  /** For a launch: the reader has swiped or jumped since it opened. */
  readerMoved: boolean;
}): ResumeLanding {
  if (coldStart) {
    if (!readerMoved) return 'front';
    return added > 0 ? 'toast' : 'stay';
  }
  if (awayMs >= RESUME_TOP_AFTER_MS) return 'front';
  return added > 0 ? 'toast' : 'stay';
}

/**
 * New stories the reader has not read, between the head of the river and the
 * story in front, and the first of them — the dock's `‹ 3 new` pill and the
 * return toast both go there, so the two cannot send the reader to different
 * stories. New stories still ahead of the reader are not counted: they will
 * reach them.
 *
 * **When every story is new, none is counted** (2026-09-24). After a day
 * away, or on a first launch, the whole river is new, and `‹ 15 new` only
 * counted the stories left of the reader's place on the track — a number
 * that said nothing the track does not, on a pill that would never go. New
 * means new beside what the reader already had.
 */
export function unreadNewBehind(
  fresh: readonly boolean[] | undefined,
  read: readonly boolean[] | undefined,
  index: number,
): { count: number; first: number } {
  let count = 0;
  let first = -1;
  if (!fresh?.some((isFresh) => !isFresh)) return { count, first };
  for (let i = 0; i < index; i++) {
    if (!fresh?.[i] || read?.[i]) continue;
    if (first < 0) first = i;
    count++;
  }
  return { count, first };
}
