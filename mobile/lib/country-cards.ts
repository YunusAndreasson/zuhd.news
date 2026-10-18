import { type TrajectoryCard, trajectoryCards } from '@shared/countries/country-trajectories';
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

/**
 * The trajectory cards a country has, in the order the sheet pages them:
 * the site's own (`trajectoryCards`), read off the bundled series, so a
 * sentence and a scale are written once for both.
 */
export function countryTrajectories(name: string | null | undefined): TrajectoryCard[] {
  return trajectoryCards(getCountryCardData(name), getGlobalBenchmarks());
}

/**
 * A trajectory card said in one go: what its chart draws, its figure and its
 * sentence, the line it is held against, and where it comes from. Its chart
 * says the first part; the carousel, whose pages a screen reader steps
 * through as one control, says it whole.
 */
export function trajectorySentence(card: TrajectoryCard, { source = false } = {}): string {
  const reference = card.reference
    ? ` A dashed line marks ${card.reference.label}, ${card.reference.value}.`
    : '';
  const from = source && card.source ? ` ${card.source}.` : '';
  return `${card.label}: ${card.headline}. ${card.subtitle}${reference} A thinner line shows the world median.${from}`;
}
