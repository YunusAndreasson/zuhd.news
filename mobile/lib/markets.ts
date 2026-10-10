import { displayNameFromCode } from '@shared/countries/iso';
import { formatNumber, formatSignedPct } from './cards/format';
import type { SwipeCard } from './cards/rank';
import { recordLine } from './cards/record';
import type { CardDelta } from './cards/types';

import {
  MONTH_DAYS,
  settledLength,
  spanMove,
  WEEK_DAYS,
  WEEK_WINDOW,
  weekMove,
  yearOf,
} from './cards/week';
import { periodDays } from './date-format';
import { DAY_MS } from './time';

/** Published /api/markets.json contract. Every exchange, not only scored highlights. */
export interface Exchange {
  id: string;
  name: string;
  indexName: string;
  city: string;
  iso2: string;
  lat: number;
  lng: number;
  level: number;
  changePct: number;
  asOf: string;
  sourceLabel: string;
  blurb: string;
  standing?: string;
  recent?: string;
  stale?: boolean;
  /** The currency the index is priced in, as an ISO code. */
  currency?: string;
  /** Its country's output in current US dollars: what the market's week
   *  weighs in `world stocks` (`stocksSummary`, `lib/world-summary.ts`).
   *  Absent from a build before the pipeline carried it. */
  gdp?: number;
  series: { periods: string[]; values: number[]; dates?: string[] };
  relatedArticles?: { slug: string; title: string; date?: string }[];
  /** That currency against the dollar over the past forty days, a day's rate for a
   *  day's date: not published on the exchange, put here from the snapshot's
   *  one table by `exchangesOf`, so a card is built from its exchange alone. */
  fx?: ExchangeRates;
}
/** Units of a currency to one US dollar on each of `dates` (`YYYY-MM-DD`,
 *  ascending); null on a day it has no rate. */
export interface ExchangeRates {
  dates: string[];
  perUsd: (number | null)[];
}
export interface MarketsSnapshot {
  generated: string;
  exchanges: Exchange[];
  /** Every exchange's currency over one row of dates. Optional: a build
   *  before it carried none, and the cards print no dollar line. */
  fx?: { dates: string[]; perUsd: Record<string, (number | null)[]> };
}

/**
 * The snapshot's exchanges, each with its own currency's rates beside it.
 *
 * `fx` is read here and nowhere validated: it is an extra, and a snapshot of
 * thirty good exchanges is not refused because a rate table came malformed. A
 * table that is not the shape above, or a currency whose row is not as long
 * as the dates, is left off, and that exchange prints no dollar line.
 */
export function exchangesOf(snapshot: MarketsSnapshot | null | undefined): Exchange[] {
  if (!snapshot) return [];
  const table: unknown = snapshot.fx;
  if (!object(table) || !Array.isArray(table.dates) || !object(table.perUsd)) {
    return snapshot.exchanges;
  }
  const dates = table.dates;
  if (!dates.every((d): d is string => typeof d === 'string')) return snapshot.exchanges;
  const rows = table.perUsd;
  return snapshot.exchanges.map((e) => {
    const perUsd = e.currency ? rows[e.currency] : undefined;
    if (
      !Array.isArray(perUsd) ||
      perUsd.length !== dates.length ||
      !perUsd.every((r): r is number | null => r === null || (typeof r === 'number' && r > 0))
    ) {
      return e;
    }
    return { ...e, fx: { dates, perUsd } };
  });
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function isMarketsSnapshot(v: unknown): v is MarketsSnapshot {
  if (
    !object(v) ||
    typeof v.generated !== 'string' ||
    !Number.isFinite(Date.parse(v.generated)) ||
    !Array.isArray(v.exchanges)
  )
    return false;
  const ids = new Set<string>();
  return v.exchanges.every((e) => {
    if (
      !object(e) ||
      !['id', 'name', 'indexName', 'city', 'iso2', 'asOf', 'sourceLabel', 'blurb'].every(
        (k) => typeof e[k] === 'string',
      ) ||
      !e.id ||
      ids.has(String(e.id))
    )
      return false;
    ids.add(String(e.id));
    if (
      !Number.isFinite(e.lat) ||
      Math.abs(Number(e.lat)) > 90 ||
      !Number.isFinite(e.lng) ||
      Math.abs(Number(e.lng)) > 180 ||
      !Number.isFinite(e.level) ||
      Number(e.level) <= 0 ||
      !Number.isFinite(e.changePct) ||
      !Number.isFinite(Date.parse(String(e.asOf)))
    )
      return false;
    if (
      !object(e.series) ||
      !Array.isArray(e.series.values) ||
      !Array.isArray(e.series.periods) ||
      e.series.values.length !== e.series.periods.length ||
      !e.series.values.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
      !e.series.periods.every((s) => typeof s === 'string') ||
      (e.series.dates !== undefined &&
        (!Array.isArray(e.series.dates) ||
          e.series.dates.length !== e.series.values.length ||
          !e.series.dates.every((d) => typeof d === 'string' && Number.isFinite(Date.parse(d)))))
    )
      return false;
    if (
      !['standing', 'recent'].every((k) => e[k] === undefined || typeof e[k] === 'string') ||
      (e.stale !== undefined && typeof e.stale !== 'boolean')
    )
      return false;
    return (
      e.relatedArticles === undefined ||
      (Array.isArray(e.relatedArticles) &&
        e.relatedArticles.every(
          (a) =>
            object(a) &&
            typeof a.slug === 'string' &&
            typeof a.title === 'string' &&
            (a.date === undefined || typeof a.date === 'string'),
        ))
    );
  });
}
export function exchangeDelta(e: Exchange): CardDelta {
  const direction = e.changePct > 0 ? 'up' : e.changePct < 0 ? 'down' : 'flat';
  return {
    direction,
    magnitude: `${Math.abs(e.changePct).toFixed(2)}%`,
    size: Math.abs(e.changePct),
    window: 'vs prior close',
  };
}
export function exchangeIsStale(e: Pick<Exchange, 'stale' | 'asOf'>, now = Date.now()): boolean {
  return Boolean(e.stale) || now - Date.parse(e.asOf) > 4 * DAY_MS;
}
/**
 * Index names that mean something else on this globe. Mexico's index is
 * published as `IPC`, which the map key and the famine marks use for the food-
 * insecurity scale, so "IPC ↑0.62%" over Mexico read as a hunger reading. The
 * index's own full name removes the clash; the published field stays as it is.
 */
const INDEX_DISPLAY_NAMES: Record<string, string> = { IPC: 'S&P/BMV IPC' };

/** Where the atlas name is long for a strip slot, or missing (Hong Kong and
 *  Singapore are not countries in it). */
const MARKET_PLACES: Readonly<Record<string, string>> = {
  US: 'US',
  GB: 'UK',
  AE: 'UAE',
  HK: 'Hong Kong',
  SG: 'Singapore',
};

/**
 * An exchange's country, named as the strip names its market: `Turkey`, `US`,
 * `Hong Kong` (`stripLabel`: `Turkey stocks`). An index's own name is a code
 * a reader can read only if they already know it — `BIST 100`, `TA-125`; the
 * country is not. Null for a code it cannot name, which keeps the index name.
 */
export function stockMarketPlace(iso2: string | undefined): string | null {
  if (!iso2) return null;
  const code = iso2.toUpperCase();
  const short = MARKET_PLACES[code];
  if (short) return short;
  // The atlas hands back the code itself for a country it does not carry.
  const name = displayNameFromCode(code);
  return name === code ? null : name;
}

/** How old a rate may be for a session: a weekend, and a holiday beside it. */
const RATE_SLACK_DAYS = 4;

/**
 * An index's sessions in its own currency and in US dollars, or null where
 * the second cannot be said: the index is priced in dollars, or it has no
 * rates.
 *
 * Each session's level is divided by the rate of its own day, or of the last
 * day before it that has one. Only the newest run of sessions that each have
 * a rate is kept: a move bridged over a gap in the rates would be the index's
 * move at one rate.
 */
function ratedSessions(e: Exchange): { local: number[]; usd: number[]; periods: string[] } | null {
  const { fx, currency } = e;
  if (!fx || !currency || currency === 'USD') return null;
  const dates = e.series.dates;
  if (!dates) return null;
  const asOf = Date.parse(e.asOf);
  const local: number[] = [];
  const usd: number[] = [];
  const periods: string[] = [];
  let at = 0;
  for (let i = 0; i < dates.length; i += 1) {
    const day = Date.parse(dates[i] ?? '');
    const level = e.series.values[i];
    if (!Number.isFinite(day) || day > asOf || typeof level !== 'number') continue;
    // The last rated day on or before the session's.
    while (at + 1 < fx.dates.length && Date.parse(fx.dates[at + 1] ?? '') <= day) at += 1;
    let rated = at;
    while (rated >= 0 && fx.perUsd[rated] == null) rated -= 1;
    const rate = rated >= 0 ? fx.perUsd[rated] : null;
    const ratedDay = rated >= 0 ? Date.parse(fx.dates[rated] ?? '') : Number.NaN;
    if (rate == null || !(ratedDay <= day) || day - ratedDay > RATE_SLACK_DAYS * DAY_MS) {
      local.length = 0;
      usd.length = 0;
      periods.length = 0;
      continue;
    }
    local.push(level);
    usd.push(level / rate);
    periods.push(e.series.periods[i] ?? '');
  }
  return { local, usd, periods };
}

/**
 * An index's past seven days in its own currency and in US dollars, or null
 * where the second cannot be said (`ratedSessions`), or the rates do not
 * reach back a week. Both are read off their lines by the one rule every
 * other week is (`weekMove`).
 */
export function dollarWeek(e: Exchange): { local: number; usd: number } | null {
  const rated = ratedSessions(e);
  if (!rated) return null;
  const year = yearOf(e.asOf, new Date().getUTCFullYear());
  const own = weekMove(rated.local, rated.periods, year);
  const inDollars = weekMove(rated.usd, rated.periods, year);
  return own && inDollars ? { local: own.pct, usd: inDollars.pct } : null;
}

/** An index's move over its last session, seven days and thirty, as signed
 *  percentages: null over a span its sessions do not reach. */
export interface SpanMoves {
  day: number | null;
  week: number | null;
  month: number | null;
}

function spanMoves(values: readonly number[], periods: readonly string[], year: number): SpanMoves {
  // A close repeated under its own date is one session (`settledLength`).
  const n = settledLength(values, periodDays(periods, year));
  const last = values[n - 1];
  const before = values[n - 2];
  return {
    day: last !== undefined && before ? (last / before - 1) * 100 : null,
    week: spanMove(values, periods, year, WEEK_DAYS)?.pct ?? null,
    month: spanMove(values, periods, year, MONTH_DAYS)?.pct ?? null,
  };
}

/** The sessions an index is quoted for. A build may append a cached quote
 *  under today's date: nothing newer than the provider's as-of date is read. */
function quotedSessions(e: Exchange): { values: number[]; periods: string[] } {
  const asOf = Date.parse(e.asOf);
  const dates = e.series.dates;
  const values: number[] = [];
  const periods: string[] = [];
  e.series.values.forEach((level, i) => {
    if (dates && !(Date.parse(dates[i] ?? '') <= asOf)) return;
    values.push(level);
    periods.push(e.series.periods[i] ?? '');
  });
  return { values, periods };
}

/** An index's moves in its own currency (`SpanMoves`). */
export function ownMoves(e: Exchange): SpanMoves {
  const { values, periods } = quotedSessions(e);
  return spanMoves(values, periods, yearOf(e.asOf, new Date().getUTCFullYear()));
}

/**
 * An index's moves in US dollars, each session at its own day's rate, or null
 * where dollars cannot be said (`ratedSessions`). A span the rates do not
 * reach back over is null on its own.
 */
export function dollarMoves(e: Exchange): SpanMoves | null {
  const rated = ratedSessions(e);
  if (!rated) return null;
  return spanMoves(rated.usd, rated.periods, yearOf(e.asOf, new Date().getUTCFullYear()));
}

/**
 * An index's level on each of its sessions, by day number, for a line of
 * several markets (`movePath`): in US dollars where asked, each session at
 * its own day's rate, or null where dollars cannot be said.
 */
export function sessionLevels(
  e: Exchange,
  dollars: boolean,
): { days: (number | null)[]; values: number[] } | null {
  const year = yearOf(e.asOf, new Date().getUTCFullYear());
  if (dollars && e.currency !== 'USD') {
    const rated = ratedSessions(e);
    return rated ? { days: periodDays(rated.periods, year), values: rated.usd } : null;
  }
  const { values, periods } = quotedSessions(e);
  return { days: periodDays(periods, year), values };
}

/**
 * How far apart, in points, an index's week in its own currency and its week
 * in dollars must be before the second is said. Nearer than this the dollar
 * line repeats the chip: a fact appears once.
 */
const DOLLAR_GAP_POINTS = 0.5;

/**
 * The index's week in US dollars, as the card's one caption sentence, where it
 * says something the chip does not (`DOLLAR_GAP_POINTS`).
 *
 * An index rises in a currency that is falling. The lira's own exchange says
 * so in its paragraph ("read the direction, not the number") and nothing on
 * the card measured it: a Borsa Istanbul up 3% in a week the lira lost 2% is
 * up 1% to anyone holding anything else.
 */
export function dollarLine(e: Exchange): string | undefined {
  const week = dollarWeek(e);
  if (!week || Math.abs(week.usd - week.local) < DOLLAR_GAP_POINTS) return undefined;
  return `In US dollars, ${formatSignedPct(week.usd)} ${WEEK_WINDOW}.`;
}

export function exchangeCard(e: Exchange): SwipeCard {
  // Never an observation newer than the provider's as-of date in the chart
  // or ticker (`quotedSessions`).
  const { values, periods } = quotedSessions(e);
  return {
    id: `mkt:${e.id}`,
    kind: 'reading',
    title: INDEX_DISPLAY_NAMES[e.indexName] ?? e.indexName,
    kicker: `${e.name} · ${e.city}`,
    asOf: e.asOf,
    reading: formatNumber(e.level, 2),
    readingNote: 'index points',
    delta: exchangeDelta(e),
    // One caption sentence. The dollar line first: a record in a falling
    // currency is the one it corrects. Then the record, and on an ordinary
    // day what the quote is.
    changed: exchangeIsStale(e)
      ? 'Older quote · last available observation'
      : (dollarLine(e) ?? recordLine(values, periods) ?? 'Latest quoted session'),
    why: [e.standing || e.blurb, e.recent].filter(Boolean).join('\n\n'),
    sourceLabel: e.sourceLabel,
    series: {
      values,
      periods,
      label: 'Index points',
      unit: 'points',
    },
    related: e.relatedArticles,
    // With an account of the move, the build publishes the stories that
    // account was written from here (`citedOr`, `scripts/build.js`), and the
    // card lists them as every other card lists its own. Without one they are
    // tag matches — a story that names the country — and stay ranking input.
    // Until 2026-10-04 they were only ever that: thirty exchanges carried
    // their stories and no card printed one.
    ...(e.recent && e.relatedArticles?.length ? { cited: e.relatedArticles } : {}),
  };
}
