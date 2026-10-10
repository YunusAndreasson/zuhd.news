import { periodDays } from '../date-format';

/**
 * The seven-day window's own arithmetic, with nothing above it: a series, its
 * labels and a year in, a move out. `week-move.ts` holds what the window is
 * for and reads cards with it; this is apart from that file so a module the
 * cards are built in (`lib/markets.ts`) can measure a week without importing
 * the cards back.
 */

export const WEEK_DAYS = 7;
/** A seven-day move's window, as a chip carries it. A row that prints a move
 *  without its window checks for this one: every other window is printed. */
export const WEEK_WINDOW = `over ${WEEK_DAYS} days`;
/** The longest span a move is read over: a month of days, said as days so the
 *  three windows of a ladder are one unit (`1 day`, `7 days`, `30 days`). */
export const MONTH_DAYS = 30;
export const MONTH_WINDOW = `over ${MONTH_DAYS} days`;
/** One session against the one before it. */
export const DAY_WINDOW = 'over 1 day';
/** The three windows a move is read over, shortest first, as the head of a
 *  table names them: the menu's and a card's. */
export const WINDOW_NAMES = ['1 day', `${WEEK_DAYS} days`, `${MONTH_DAYS} days`] as const;
/** Where the longest window began, as a chart's rule names it. */
export const MONTH_AGO = `${MONTH_DAYS} days ago`;
/**
 * How late the anchor may be. A market closed on the weekend or a holiday has
 * no close exactly seven days back, and the one before it is still that week's
 * open. Past three days the "week" would really be ten, so the reading gets no
 * seven-day move rather than an elastic one.
 */
export const ANCHOR_SLACK_DAYS = 3;

export interface WeekMove {
  /** Signed percentage change from the anchor to the newest observation. */
  pct: number;
  /** The observations from the anchor to the newest. */
  points: number[];
  /** The anchor's own label. */
  from: string;
}

/**
 * A series' move over the past `span` days, or null when it has none: its
 * newest observation against the last one at least that many days before it
 * (`ANCHOR_SLACK_DAYS`). The week is the one every surface prints; the ladder
 * reads a longer span by the same rule (`MONTH_DAYS`).
 */
export function spanMove(
  values: readonly number[],
  periods: readonly string[],
  year: number,
  span: number,
): WeekMove | null {
  const n = values.length;
  if (n < 2 || periods.length !== n) return null;
  const days = periodDays(periods, year);
  const lastDay = days[n - 1];
  const last = values[n - 1];
  if (lastDay == null || typeof last !== 'number' || !Number.isFinite(last)) return null;
  const target = lastDay - span;
  for (let i = n - 2; i >= 0; i--) {
    const d = days[i];
    if (d == null) return null;
    if (d > target) continue;
    if (lastDay - d > span + ANCHOR_SLACK_DAYS) return null;
    const from = values[i];
    if (typeof from !== 'number' || !Number.isFinite(from) || from === 0) return null;
    return {
      pct: ((last - from) / Math.abs(from)) * 100,
      points: values.slice(i),
      from: periods[i] ?? '',
    };
  }
  return null;
}

/**
 * A series' last step as a day's move, or null when it is not one: its newest
 * observation against the one before it, where that is no more than a day and
 * a weekend back. Not `spanMove` over one day: a price quoted now, after the
 * day's own midnight close, has two observations under one date, and the day
 * is measured from that close. A series published weekly has no day.
 */
export function dayMove(
  values: readonly number[],
  periods: readonly string[],
  year: number,
): number | null {
  return dayStep(values, periods, year)?.pct ?? null;
}

/**
 * How many observations a series has once a repeat at its end is set aside.
 * A build can append the newest quote under the last session's own date, and
 * with the market closed that quote is the close again: two readings of one
 * day at one value are one reading, and a day measured between them is
 * `unchanged` on a market that moved.
 */
export function settledLength(values: readonly number[], days: readonly (number | null)[]): number {
  let n = values.length;
  while (
    n >= 2 &&
    days[n - 1] != null &&
    days[n - 1] === days[n - 2] &&
    values[n - 1] === values[n - 2]
  )
    n -= 1;
  return n;
}

/** A day's move with the two readings it is between (`dayMove`), for a series
 *  whose move is their difference: a yield's day is in points, as its week. */
export function dayStep(
  values: readonly number[],
  periods: readonly string[],
  year: number,
): WeekMove | null {
  if (values.length < 2 || periods.length !== values.length) return null;
  const days = periodDays(periods, year);
  const n = settledLength(values, days);
  if (n < 2) return null;
  const lastDay = days[n - 1];
  const before = days[n - 2];
  const last = values[n - 1];
  const from = values[n - 2];
  if (lastDay == null || before == null || lastDay - before > 1 + ANCHOR_SLACK_DAYS) return null;
  if (typeof last !== 'number' || typeof from !== 'number' || !Number.isFinite(last)) return null;
  if (!Number.isFinite(from) || from === 0) return null;
  return {
    pct: ((last - from) / Math.abs(from)) * 100,
    points: [from, last],
    from: periods[n - 2] ?? '',
  };
}

/** The seven-day move of a series, or null when it has none. */
export function weekMove(
  values: readonly number[],
  periods: readonly string[],
  year: number,
): WeekMove | null {
  return spanMove(values, periods, year, WEEK_DAYS);
}

/** The year a series' last label falls in: its card's `asOf`, or `fallback`. */
export function yearOf(asOf: string | undefined, fallback: number): number {
  const m = asOf ? /^(\d{4})/.exec(asOf) : null;
  return m ? Number(m[1]) : fallback;
}
