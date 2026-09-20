import type { SwipeCard } from './cards/rank';
import type { CardDelta } from './cards/types';

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
  series: { periods: string[]; values: number[]; dates?: string[] };
  relatedArticles?: { slug: string; title: string; date?: string }[];
}
export interface MarketsSnapshot {
  generated: string;
  exchanges: Exchange[];
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
    valence: direction === 'up' ? 'favorable' : direction === 'down' ? 'unfavorable' : 'neutral',
  };
}
export function exchangeIsStale(e: Exchange, now = Date.now()): boolean {
  return Boolean(e.stale) || now - Date.parse(e.asOf) > 4 * 86_400_000;
}
export function exchangeCard(e: Exchange): SwipeCard {
  // A build may append a cached quote under today's date. Never imply an
  // observation newer than the provider's as-of date in the chart or ticker.
  const indices = e.series.values
    .map((_, i) => i)
    .filter((i) => !e.series.dates || Date.parse(e.series.dates[i] ?? '') <= Date.parse(e.asOf));
  return {
    id: `mkt:${e.id}`,
    kind: 'reading',
    title: e.indexName,
    kicker: `${e.name} · ${e.city}`,
    asOf: e.asOf,
    reading: e.level.toLocaleString('en-US', { maximumFractionDigits: 2 }),
    readingNote: 'index points',
    delta: exchangeDelta(e),
    changed: exchangeIsStale(e)
      ? 'Older quote · last available observation'
      : 'Latest quoted session',
    why: [e.standing || e.blurb, e.recent].filter(Boolean).join('\n\n'),
    sourceLabel: e.sourceLabel,
    series: {
      values: indices.map((i) => e.series.values[i] as number),
      periods: indices.map((i) => e.series.periods[i] as string),
      label: 'Index points',
      unit: 'points',
    },
    related: e.relatedArticles,
  };
}
