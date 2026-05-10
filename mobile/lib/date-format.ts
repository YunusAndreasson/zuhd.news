// Project-wide date formatting for chart axes and tick labels.
//
// **Convention: months are always 3-letter abbreviations** (JAN, FEB, MAR…) —
// never the full month name. The reader scans charts at a glance; "FEBRUARY"
// burns visual cycles where "FEB" lands instantly. Years use 2-digit form
// when paired with a month ("MAR '26") and 4-digit when standing alone
// ("2026"). Day-of-month uses the unpadded number ("MAR 15", not "MAR 05").
//
// Use `formatTickLabel(date, ticks)` whenever you draw a time-axis label.
// The output is already uppercase — pass it straight to a labelXs Text.

import { timeFormat } from 'd3-time-format';

const fmtYear = timeFormat('%Y');
const fmtMonthYear = timeFormat("%b '%y");
const fmtMonthDay = timeFormat('%b %-d');

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Pick a compact, human-scannable label for a tick date based on the span
 * covered by the surrounding tick set. Output is uppercase — ready to drop
 * into a labelXs caption with no further toUpperCase().
 *
 * Rules:
 *   span ≥ 2 years   → "2024"
 *   span ≥ 60 days   → "MAR '26"
 *   else             → "MAR 15"
 */
export function formatTickLabel(d: Date, ticks: Date[]): string {
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  const span = first && last ? Math.abs(+last - +first) : 0;
  if (span >= 365 * DAY_MS * 2) return fmtYear(d).toUpperCase();
  if (span >= 60 * DAY_MS) return fmtMonthYear(d).toUpperCase();
  return fmtMonthDay(d).toUpperCase();
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
  const diffHours = Math.floor(diffMs / 3_600_000);
  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}
