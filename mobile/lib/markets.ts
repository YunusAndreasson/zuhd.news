import type { MarketExchange } from '@shared/types';

/**
 * Market arithmetic, dependency-free so it can be tested without a renderer.
 *
 * The mobile app never colours a market by direction, so everything here is
 * about turning the snapshot into words and shapes: whether the exchange is
 * open right now, and how to say a signed percentage without a hue.
 */

export type SessionState = 'open' | 'closed' | 'unknown';

/** Which of the three market glyphs an exchange gets. Declared here rather
 *  than beside the paths in `components/globe/disaster-glyphs.ts`, because that
 *  module builds Skia objects at import time and this bucket is needed in the
 *  sheets and the tests, where no Skia runtime exists. */
export type MarketDirection = 'up' | 'down' | 'flat';

/** Percent moves inside this band round to `flat`. Not zero: an index that
 *  closed 0.02% up did not do anything a reader should see a direction for,
 *  and drawing one implies a precision the mark does not have. */
export const MARKET_FLAT_BAND_PCT = 0.05;

export function marketDirection(changePct: number): MarketDirection {
  if (!Number.isFinite(changePct)) return 'flat';
  if (changePct > MARKET_FLAT_BAND_PCT) return 'up';
  if (changePct < -MARKET_FLAT_BAND_PCT) return 'down';
  return 'flat';
}

/** `"10:00"` → minutes past midnight. Returns null for anything else, so a
 *  malformed session bound degrades to `unknown` rather than to a confident
 *  wrong answer about whether a market is trading. */
function parseClock(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Is this exchange inside its trading session right now?
 *
 * Read in the exchange's OWN timezone and against its OWN trading days, which
 * is the whole reason `days` is per-exchange in the payload rather than derived
 * from a region: Riyadh runs Sunday–Thursday while Dubai moved to Monday–Friday
 * in 2022, so any Gulf-wide rule is wrong about half the Gulf.
 *
 * Holidays are NOT modelled — a national-day or Christmas closure still reads
 * as "Open". That mis-states the state and never the number, since the sheet
 * prints the actual date of the close it is quoting, which is the field a
 * reader can check. Better a known gap than a fabricated calendar.
 */
export function sessionState(
  exchange: Pick<MarketExchange, 'tz' | 'sessionStart' | 'sessionEnd' | 'days'>,
  now: Date = new Date(),
): SessionState {
  const start = parseClock(exchange.sessionStart);
  const end = parseClock(exchange.sessionEnd);
  if (start === null || end === null) return 'unknown';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: exchange.tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
  } catch {
    // An unknown IANA zone on an older ICU build. Say so rather than guessing.
    return 'unknown';
  }
  const lookup = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  const weekday = lookup('weekday');
  const hour = Number(lookup('hour'));
  const minute = Number(lookup('minute'));
  if (weekday === undefined || !Number.isFinite(hour) || !Number.isFinite(minute)) return 'unknown';
  const dayIndex = WEEKDAY_INDEX[weekday];
  if (dayIndex === undefined) return 'unknown';
  if (!exchange.days.includes(dayIndex)) return 'closed';
  // `hour12: false` yields 24 for midnight in some ICU versions.
  const minutes = (hour % 24) * 60 + minute;
  return minutes >= start && minutes < end ? 'open' : 'closed';
}

/**
 * A signed percentage as text — the one place the number gets a direction in
 * words rather than in a shape.
 *
 * Uses a real minus sign (U+2212), not a hyphen: at caption size a hyphen
 * beside a numeral reads as punctuation, and this app sets numbers in oldstyle
 * and tabular figures precisely because it expects them to be read.
 */
export function formatChangePct(changePct: number): string {
  if (!Number.isFinite(changePct)) return '—';
  const rounded = Math.abs(changePct) < 0.005 ? 0 : changePct;
  if (rounded === 0) return '0.00%';
  const sign = rounded > 0 ? '+' : '−';
  return `${sign}${Math.abs(rounded).toFixed(2)}%`;
}

/** Index level with thousands separators and two decimals — the convention
 *  every exchange quotes its own index in. */
export function formatLevel(level: number): string {
  if (!Number.isFinite(level)) return '—';
  return level.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ISO timestamp → "1 August 2026". The close's own date, printed so a reader
 *  can tell a stale quote from a fresh one without trusting the session state
 *  above (which does not model holidays). */
export function formatAsOf(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
