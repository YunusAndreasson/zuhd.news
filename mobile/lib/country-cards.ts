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

export interface ComplexityCardData {
  /** Economic Complexity Index (HS92), Harvard Growth Lab. Roughly z-scored:
   *  positive = export basket more sophisticated than the world median. */
  eci?: YearValue[];
  /** Country rank within the year's ECI ranking (1 = most complex). Stored
   *  alongside the value so the card can show a focal `#N` headline without
   *  re-deriving rank from the eci series at runtime. */
  eciRank?: YearValue[];
}

export interface CountryCardData {
  economy?: EconomyCardData;
  demography?: DemographyCardData;
  complexity?: ComplexityCardData;
}

/** Global benchmark series — median across all countries, per year.
 *  Computed once at fetch time so cards can render a comparison line
 *  without recomputing on every render. */
export interface GlobalBenchmarks {
  economy?: { gdpPerCapita?: YearValue[]; inflation?: YearValue[]; n: number };
  demography?: { fertility?: YearValue[]; n: number };
  complexity?: { eci?: YearValue[]; n: number };
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

function iso2FromCountryName(name: string | null | undefined): string | null {
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

/** Align a YearValue series to a [startYear, endYear] range, returning a
 *  dense `(number | null)[]` with one entry per year — null for a year the
 *  series does not have. */
function alignToYears(
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

/** A country's line and the world's, as `TrajectoryChart` draws them. */
export interface Trajectory {
  values: (number | null)[];
  startYear: number;
  endYear: number;
  comparison: { values: (number | null)[]; label: string };
}

/**
 * A country's series against the world median, both on one axis: a value for
 * every year from the country's first to its last, null where either has
 * none. Null for a country with no series.
 *
 * `TrajectoryChart` spaces a line by index, so both lines have to be
 * year-aligned for either to sit on its decade ticks. Each card aligned the
 * world's and passed the country's raw: dense everywhere but Luxembourg's
 * fertility, 63 values over 65 years, whose line ran up to two years ahead of
 * the axis. Missing years are a gap in the line, which is how the chart draws
 * one.
 */
export function trajectoryOf(
  series: YearValue[] | undefined,
  world: YearValue[] | undefined,
): Trajectory | null {
  const first = series?.[0];
  const last = series?.[series.length - 1];
  if (!first || !last) return null;
  const [startYear] = first;
  const [endYear] = last;
  return {
    values: alignToYears(series, startYear, endYear),
    startYear,
    endYear,
    comparison: { values: alignToYears(world, startYear, endYear), label: 'world' },
  };
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
