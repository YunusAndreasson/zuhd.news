// Project-wide date formatting for chart axes and tick labels.
//
// **Convention: months are always 3-letter abbreviations** (JAN, FEB, MAR…) —
// never the full month name. The reader scans charts at a glance; "FEBRUARY"
// burns visual cycles where "FEB" lands instantly. Years use 2-digit form
// when paired with a month ("MAR '26") and 4-digit when standing alone
// ("2026"). Day-of-month uses the unpadded number ("MAR 15", not "MAR 05").
//
// Use `formatTickLabel(date, ticks)` whenever you draw a time-axis label.
// Formatting is UTC because chart periods are date-only observations, not
// local appointments. The output is already uppercase — pass it straight to
// a labelXs Text.

import { utcFormat } from 'd3-time-format';
import { DAY_MS, HOUR_MS } from './time';

/** The month abbreviations every period label is written in — `Sep 12`,
 *  `Sep 2026` — as the pipeline's `formatPeriod` writes them and the cards
 *  read them back. English, not the device's: they are the payload's words. */
export const MONTH_ABBR: readonly string[] =
  'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

const fmtYear = utcFormat('%Y');
const fmtMonthYear = utcFormat("%b '%y");
const fmtMonthDay = utcFormat('%b %-d');

const fmtMonth = utcFormat('%b');

/**
 * Pick a compact, human-scannable label for a tick date based on the span
 * covered by the surrounding tick set. Output is uppercase — ready to drop
 * into a labelXs caption with no further toUpperCase().
 *
 * Rules:
 *   span ≥ 2 years   → "2024"
 *   span ≥ 60 days   → "MAR", or "MAR '26" where the ticks cross a year
 *   else             → "MAR 15"
 *
 * A quarter of daily closes is three ticks in one year: `AUG '26 · SEP '26 ·
 * OCT '26` printed the one thing the three share and crowded the row.
 */
export function formatTickLabel(d: Date, ticks: Date[]): string {
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  const span = first && last ? Math.abs(+last - +first) : 0;
  if (span >= 365 * DAY_MS * 2) return fmtYear(d).toUpperCase();
  if (span >= 60 * DAY_MS) {
    const oneYear = first && last && first.getUTCFullYear() === last.getUTCFullYear();
    return (oneYear ? fmtMonth(d) : fmtMonthYear(d)).toUpperCase();
  }
  return fmtMonthDay(d).toUpperCase();
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_LABEL = /^([A-Z][a-z]{2}) (\d{1,2})$/;
const MONTH_LABEL = /^([A-Z][a-z]{2}) (\d{4})$/;

/**
 * Each period as a day number (days since the epoch), or null where the label
 * is not a day. The last label is placed in `year`, and the year steps back
 * whenever the month increases going backwards (a series running Dec → Jan).
 */
export function periodDays(periods: readonly string[], year: number): (number | null)[] {
  const out: (number | null)[] = new Array(periods.length).fill(null);
  let y = year;
  let laterMonth: number | null = null;
  for (let i = periods.length - 1; i >= 0; i--) {
    const label = periods[i] ?? '';
    const iso = ISO_DAY.exec(label);
    if (iso) {
      out[i] = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) / DAY_MS;
      y = Number(iso[1]);
      laterMonth = Number(iso[2]) - 1;
      continue;
    }
    const day = DAY_LABEL.exec(label);
    if (!day) return out;
    const month = MONTH_ABBR.indexOf(day[1] as string);
    if (month < 0) return out;
    if (laterMonth !== null && month > laterMonth) y -= 1;
    laterMonth = month;
    out[i] = Date.UTC(y, month, Number(day[2])) / DAY_MS;
  }
  return out;
}

/**
 * A series' period labels as UTC dates, or null when one cannot be read.
 *
 * Read by the feeds' own shapes, never by the engine's parser. The daily
 * series are labelled `Jul 18` and the monthly ones `Oct 2024`; Node reads
 * both and Hermes reads neither, so the tests passed while on a phone every
 * chart fell back to even spacing and two end labels, with no time axis.
 *
 * A day label carries no year: the last is placed in this year, or in last
 * year where that would put it in the future (a December series read in
 * January), and the rest are counted back from it (`periodDays`).
 */
export function periodDates(periods: readonly string[], now: number = Date.now()): Date[] | null {
  if (periods.length === 0) return null;
  const year = new Date(now).getUTCFullYear();
  let days = periodDays(periods, year);
  const last = days[days.length - 1];
  if (last != null && last * DAY_MS > now + DAY_MS) days = periodDays(periods, year - 1);
  if (days.every((day) => day !== null)) return days.map((day) => new Date((day ?? 0) * DAY_MS));
  const dates: Date[] = [];
  for (const period of periods) {
    const date = parseFlexibleDate(period);
    if (!date) return null;
    dates.push(date);
  }
  return dates;
}

/**
 * Parse a chart period/year string into a UTC Date. Accepts a bare year
 * ("1979" → Jan 1), a year-month ("2026-04" or "Oct 2024" → the 1st), or anything
 * `Date` itself parses (e.g. full ISO). Returns null on unparseable input.
 * Single source of truth for the "year / year-month / ISO" convention shared
 * by TrendBlock's axis and TimelineBlock's events.
 */
export function parseFlexibleDate(s: string): Date | null {
  if (/^\d{4}$/.test(s)) return new Date(`${s}-01-01T00:00:00Z`);
  if (/^\d{4}-\d{2}$/.test(s)) return new Date(`${s}-01T00:00:00Z`);
  // `Oct 2024`, the monthly series' own label, which Hermes does not parse.
  const month = MONTH_LABEL.exec(s);
  if (month) {
    const index = MONTH_ABBR.indexOf(month[1] as string);
    if (index >= 0) return new Date(Date.UTC(Number(month[2]), index, 1));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Compact "time ago" string from an ISO timestamp. Buckets by the largest
 * coarser-than-hour unit so glance reading lands instantly:
 *   < 1h     → "just now"
 *   < 24h    → "Nh ago"
 *   < 7d     → "Nd ago"
 *   < 30d    → "Nw ago"
 *   < 365d   → "Nmo ago"
 *   else     → "Ny ago"
 *
 * Returns `''` for unparseable input — callers can `&& relativeTime(...)`
 * to drop the segment without a guard.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diffMs = Math.abs(now - t);
  const diffHours = Math.floor(diffMs / HOUR_MS);
  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}
