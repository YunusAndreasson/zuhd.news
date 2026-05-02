import { codeFromTopojsonName } from '@shared/countries/iso';
import cardsRaw from '@shared/data/country-cards.json';

/** Per-year data point from a World Bank or Open-Meteo dataset.
 *  `[year, value]` so it serialises tightly in JSON. */
export type YearValue = [year: number, value: number];

export interface EconomyCardData {
  gdpPerCapita?: YearValue[];
  inflation?: YearValue[];
}

export interface DemographyCardData {
  fertility?: YearValue[];
  population?: YearValue[];
}

export interface TradeCardData {
  /** % merchandise exports to high-income economies (World Bank). */
  highIncomeShare?: YearValue[];
}

export interface CountryCardData {
  economy?: EconomyCardData;
  demography?: DemographyCardData;
  trade?: TradeCardData;
}

/** Global benchmark series — median across all countries, per year.
 *  Computed once at fetch time so cards can render a comparison line
 *  without recomputing on every render. */
export interface GlobalBenchmarks {
  economy?: { gdpPerCapita?: YearValue[]; inflation?: YearValue[]; n: number };
  demography?: { fertility?: YearValue[]; n: number };
  trade?: { highIncomeShare?: YearValue[]; n: number };
}

interface CountryCardsRoot {
  generated: string;
  countries: number;
  byIso2: Record<string, CountryCardData>;
  global?: GlobalBenchmarks;
}

const cards = cardsRaw as unknown as CountryCardsRoot;

export function getGlobalBenchmarks(): GlobalBenchmarks {
  return cards.global ?? {};
}

/** Country-data.ts uses a few names that diverge from the topojson naming
 *  used by `iso.ts`. Map those edge cases here so all callers get an iso2.
 *  Keep this list aligned with the same alias map in `scripts/fetch-country-cards.js`. */
const NAME_ALIAS_TO_ISO2: Record<string, string> = {
  'United States': 'US',
  'Czech Republic': 'CZ',
  'Republic of the Congo': 'CG',
  'DR Congo': 'CD',
  'Democratic Republic of the Congo': 'CD',
  'Ivory Coast': 'CI',
  'East Timor': 'TL',
  Eswatini: 'SZ',
  'Cape Verde': 'CV',
  'São Tomé and Príncipe': 'ST',
  'Vatican City': 'VA',
  Macao: 'MO',
  'Hong Kong': 'HK',
  'South Sudan': 'SS',
  'Bosnia and Herzegovina': 'BA',
  'North Macedonia': 'MK',
  'The Bahamas': 'BS',
  'Saint Kitts and Nevis': 'KN',
  'Saint Lucia': 'LC',
  'Saint Vincent and the Grenadines': 'VC',
  'Antigua and Barbuda': 'AG',
  'Equatorial Guinea': 'GQ',
};

export function iso2FromCountryName(name: string | null | undefined): string | null {
  if (!name) return null;
  return codeFromTopojsonName(name) ?? NAME_ALIAS_TO_ISO2[name] ?? null;
}

export function getCountryCardData(name: string | null | undefined): CountryCardData | null {
  const iso2 = iso2FromCountryName(name);
  if (!iso2) return null;
  return cards.byIso2[iso2] ?? null;
}

/** Latest year/value pair from a YearValue series — convenience for headline numbers. */
export function latest(series: YearValue[] | undefined): YearValue | null {
  if (!series || series.length === 0) return null;
  return series[series.length - 1] ?? null;
}

/** First year/value pair from a YearValue series — convenience for "since X" deltas. */
export function first(series: YearValue[] | undefined): YearValue | null {
  if (!series || series.length === 0) return null;
  return series[0] ?? null;
}

/** Align a YearValue series to a [startYear, endYear] range, returning a
 *  dense `(number | null)[]` with one entry per year. Used to make the
 *  global benchmark comparable to a country's series on the same x-axis
 *  even when the year ranges differ slightly. */
export function alignToYears(
  series: YearValue[] | undefined,
  startYear: number,
  endYear: number,
): (number | null)[] {
  const len = endYear - startYear + 1;
  if (!series || len <= 0) return Array(Math.max(0, len)).fill(null);
  const map = new Map(series);
  const out: (number | null)[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const v = map.get(y);
    out.push(v == null ? null : v);
  }
  return out;
}

/** Year/value pair near a target year (closest match). Used for "vs 1995" comparisons. */
export function near(series: YearValue[] | undefined, year: number): YearValue | null {
  if (!series || series.length === 0) return null;
  let best: YearValue | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const p of series) {
    const d = Math.abs(p[0] - year);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}
