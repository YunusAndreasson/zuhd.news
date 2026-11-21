import type { AwayBucket, HeardPct, StoriesReadCount } from '../constants/analytics';

/**
 * The arithmetic behind analytics properties, kept pure so a test can pin it.
 * Every value is a closed set: a bucket, never the raw figure.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** How long the app was away before a warm open. Under five minutes is not an
 *  open at all (`STALE_THRESHOLD`), so the first bucket starts there. */
export function awayBucket(awayMs: number): AwayBucket {
  if (awayMs < HOUR) return '5m-1h';
  if (awayMs < 6 * HOUR) return '1-6h';
  if (awayMs < 24 * HOUR) return '6-24h';
  return '1d+';
}

/** The share of a briefing heard, in whole quarters down: three quarters and
 *  more is 75, since a briefing heard to its end sends Completed instead. An
 *  unknown length is 0. */
export function heardPct(heardSeconds: number, totalSeconds: number): HeardPct {
  if (!(totalSeconds > 0) || !(heardSeconds > 0)) return 0;
  const quarters = Math.floor((heardSeconds / totalSeconds) * 4);
  if (quarters >= 3) return 75;
  if (quarters === 2) return 50;
  if (quarters === 1) return 25;
  return 0;
}

/** The calendar day of a timestamp, `YYYY-MM-DD` in UTC: the install-date
 *  super property, the same day wherever the reader is. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const READ_COUNTS: readonly number[] = [1, 3, 10];

/** Whether the n-th story newly read in a visit is one worth an event. */
export function isReadMilestone(count: number): count is StoriesReadCount {
  return READ_COUNTS.includes(count);
}
