import { COUNTRY_AUGMENTED, type CountryAugmented } from '../constants/country-augmented';
import { COUNTRY_DATA, type CountryData } from '../constants/country-data';

export type MetricKey =
  | 'population'
  | 'gdp'
  | 'gdpPerCapita'
  | 'military'
  | 'militaryPctGdp'
  | 'area'
  | 'populationDensity'
  | 'lifeExpectancy'
  | 'internetPct'
  | 'co2PerCapita'
  | 'urbanPct'
  | 'fertilityRate'
  | 'migrantPct';

export const METRICS: Record<MetricKey, { label: string }> = {
  population: { label: 'population' },
  gdp: { label: 'gdp' },
  gdpPerCapita: { label: 'gdp per capita' },
  military: { label: 'military spending' },
  militaryPctGdp: { label: 'military % of gdp' },
  area: { label: 'area' },
  populationDensity: { label: 'population density' },
  lifeExpectancy: { label: 'life expectancy' },
  internetPct: { label: 'internet access' },
  co2PerCapita: { label: 'co₂ per capita' },
  urbanPct: { label: 'urbanization' },
  fertilityRate: { label: 'fertility rate' },
  migrantPct: { label: 'foreign-born share' },
};

/** Parse values like "44M", "$17B", "652K km²", "66.0 yr", "18%", "1.8",
 *  "250 /km²", "47.3 t" → numeric. The leading number is what matters; unit
 *  suffix (K/M/B/T) is resolved; trailing units ("km²", "yr", "t", "/km²") are
 *  simply ignored because the regex anchors on the number. */
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

/** Pull the raw string for a given metric, crossing the data/augmented split.
 *  Kept in one place so consumers don't have to know which file owns what. */
export function getMetricValue(name: string, data: CountryData, metric: MetricKey): string | null {
  // Fields native to CountryData.
  if (
    metric === 'population' ||
    metric === 'gdp' ||
    metric === 'gdpPerCapita' ||
    metric === 'military' ||
    metric === 'militaryPctGdp' ||
    metric === 'area' ||
    metric === 'lifeExpectancy' ||
    metric === 'internetPct'
  ) {
    const v = data[metric];
    return typeof v === 'string' ? v : null;
  }
  // Augmented fields (World Bank + derived).
  const aug: CountryAugmented | undefined = COUNTRY_AUGMENTED[name];
  if (!aug) return null;
  const v = aug[metric as keyof CountryAugmented];
  return typeof v === 'string' ? v : null;
}

const rankingCache = new Map<MetricKey, RankingEntry[]>();

export function getRanking(metric: MetricKey): RankingEntry[] {
  const cached = rankingCache.get(metric);
  if (cached) return cached;
  const entries: RankingEntry[] = [];
  for (const [name, data] of Object.entries(COUNTRY_DATA)) {
    const raw = getMetricValue(name, data, metric);
    if (raw == null) continue;
    const numeric = parseStat(raw);
    if (numeric == null) continue;
    entries.push({ name, flag: data.flag, value: raw, numeric });
  }
  entries.sort((a, b) => b.numeric - a.numeric);
  rankingCache.set(metric, entries);
  return entries;
}
