import { COUNTRY_DATA } from '../constants/country-data';

export type MetricKey =
  | 'population'
  | 'gdp'
  | 'gdpPerCapita'
  | 'military'
  | 'area'
  | 'lifeExpectancy'
  | 'internetPct';

export const METRICS: Record<MetricKey, { label: string }> = {
  population: { label: 'population' },
  gdp: { label: 'gdp' },
  gdpPerCapita: { label: 'gdp per capita' },
  military: { label: 'military spending' },
  area: { label: 'area' },
  lifeExpectancy: { label: 'life expectancy' },
  internetPct: { label: 'internet access' },
};

/** Parse values like "44M", "$17B", "652K km²", "66.0 yr", "18%" → numeric. */
export function parseStat(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.match(/^\$?([\d,.]+)\s*([KMBT])?/i);
  if (!m?.[1]) return null;
  const n = Number.parseFloat(m[1].replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  const suffix = m[2]?.toUpperCase();
  const mult =
    suffix === 'T' ? 1e12 : suffix === 'B' ? 1e9 : suffix === 'M' ? 1e6 : suffix === 'K' ? 1e3 : 1;
  return n * mult;
}

export interface RankingEntry {
  name: string;
  flag: string;
  value: string;
  numeric: number;
}

const rankingCache = new Map<MetricKey, RankingEntry[]>();

export function getRanking(metric: MetricKey): RankingEntry[] {
  const cached = rankingCache.get(metric);
  if (cached) return cached;
  const entries: RankingEntry[] = [];
  for (const [name, data] of Object.entries(COUNTRY_DATA)) {
    const raw = data[metric];
    if (typeof raw !== 'string') continue;
    const numeric = parseStat(raw);
    if (numeric == null) continue;
    entries.push({ name, flag: data.flag, value: raw, numeric });
  }
  entries.sort((a, b) => b.numeric - a.numeric);
  rankingCache.set(metric, entries);
  return entries;
}
