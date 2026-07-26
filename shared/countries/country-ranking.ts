import { COUNTRY_AUGMENTED, type CountryAugmented } from './country-augmented';
import { COUNTRY_DATA, type CountryData } from './country-data';

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
  | 'migrantPct'
  | 'remittancePctGdp'
  | 'rdPctGdp'
  | 'researchersPerMillion'
  | 'scientificArticles'
  | 'highTechExportsPct'
  | 'giniIndex'
  | 'youthUnemploymentPct'
  | 'literacyPct'
  | 'democracyIndex'
  | 'corruptionCpi'
  | 'pressFreedomScore'
  | 'hdi'
  | 'refugeesHosted'
  | 'refugeesProduced';

export interface MetricMeta {
  label: string;
  /** Flip the sort so "better" lands at rank #1 for metrics where lower is
   *  more desirable (press freedom — RSF puts best at 0; Gini — 0 = perfect
   *  equality; youth unemployment — lower is better).
   *
   *  It also turns the map's land ramp around, so on these three the lightest
   *  countries are the best ones rather than the largest. See `scale` below. */
  ascending?: boolean;
  /**
   * How this metric's values are spaced across the map's land ramp.
   *
   * Required, and deliberately editorial rather than derived. The map used to
   * put every metric on a *percentile* — tone meant rank position, and because
   * percentile is uniform by construction the histogram of tones on screen was
   * identical on all twenty-seven. Only the assignment changed, which is a
   * large part of why switching metrics taught a reader nothing.
   *
   * It also mis-calibrated in opposite directions on the two families of
   * metric. Measured over the built payloads, the light half of the ramp
   * covered 14.5% of the value range on adult literacy (90%→100%, so ten
   * points of literacy took half the visible lightness and Oman looked
   * dramatically unlike Lesotho) and 99.7% of it on GDP (so the whole story —
   * $72B to $27.3T — was crushed into two stops while the dark half carefully
   * separated $1B from $72B).
   *
   * `'linear'` — bounded indices and rates, where the value *is* the position:
   * an HDI of 0.6 sits at 0.6 and two countries seven points apart in literacy
   * look seven points apart. Most of these bunch at one end, and that bunching
   * is the truth about the world — most countries really are highly literate —
   * so the ramp shows it rather than manufacturing spread.
   *
   * `'log'` — counts, money, area, densities, and the rates whose distribution
   * is a long tail (military % of GDP runs 0.1–36.5 with a median of 1.6, so
   * linear puts 99% of countries in one bin and lets Ukraine own the ramp).
   * Ratios are what these are read in: China at 899K articles and Vietnam at
   * 11K should be visibly far apart, and they are not on a percentile.
   *
   * Zeros floor to the smallest positive value in the set — the bottom of the
   * scale, which is where a zero belongs.
   */
  scale: 'linear' | 'log';
  /** One-sentence explanation of the scale / definition. Shown above the
   *  ranking list so the reader can interpret the numbers. */
  description?: string;
  /** Short attribution label: "<publisher> · <year or series>". */
  source?: string;
  /** Canonical page — tapped to open in the browser. Optional. */
  sourceUrl?: string;
}

const WB = (id: string) => `https://data.worldbank.org/indicator/${id}`;
const OWID = (slug: string) => `https://ourworldindata.org/grapher/${slug}`;

export const METRICS: Record<MetricKey, MetricMeta> = {
  population: {
    label: 'population',
    scale: 'log',
    description: 'Total resident population.',
    source: 'REST Countries · UN data',
    sourceUrl: 'https://restcountries.com/',
  },
  gdp: {
    label: 'gdp',
    scale: 'log',
    description: 'Nominal gross domestic product, current US dollars.',
    source: 'World Bank · latest available',
    sourceUrl: WB('NY.GDP.MKTP.CD'),
  },
  gdpPerCapita: {
    label: 'gdp per capita',
    scale: 'log',
    description: 'Nominal GDP divided by population, current US dollars.',
    source: 'World Bank · latest available',
    sourceUrl: WB('NY.GDP.PCAP.CD'),
  },
  military: {
    label: 'military spending',
    scale: 'log',
    description: 'Annual military expenditure, current US dollars.',
    source: 'SIPRI via World Bank',
    sourceUrl: WB('MS.MIL.XPND.CD'),
  },
  militaryPctGdp: {
    label: 'military % of gdp',
    scale: 'log',
    description: 'Military expenditure as a share of GDP.',
    source: 'SIPRI via World Bank',
    sourceUrl: WB('MS.MIL.XPND.GD.ZS'),
  },
  area: {
    label: 'area',
    scale: 'log',
    description: 'Total land area in square kilometres.',
    source: 'REST Countries',
    sourceUrl: 'https://restcountries.com/',
  },
  populationDensity: {
    label: 'population density',
    scale: 'log',
    description: 'Derived: population divided by land area.',
    source: 'zuhd — derived from population and area',
  },
  lifeExpectancy: {
    label: 'life expectancy',
    scale: 'linear',
    description: 'Life expectancy at birth, total years.',
    source: 'World Bank · latest available',
    sourceUrl: WB('SP.DYN.LE00.IN'),
  },
  internetPct: {
    label: 'internet access',
    scale: 'linear',
    description: 'Share of the population using the internet.',
    source: 'ITU via World Bank',
    sourceUrl: WB('IT.NET.USER.ZS'),
  },
  co2PerCapita: {
    label: 'co₂ per capita',
    scale: 'log',
    description: 'Tonnes of CO₂-equivalent emitted per person, excluding land use.',
    source: 'World Bank · Climate Watch',
    sourceUrl: WB('EN.GHG.CO2.PC.CE.AR5'),
  },
  urbanPct: {
    label: 'urbanization',
    scale: 'linear',
    description: 'Share of population living in urban areas.',
    source: 'World Bank · UN DESA',
    sourceUrl: WB('SP.URB.TOTL.IN.ZS'),
  },
  fertilityRate: {
    label: 'fertility rate',
    // Ratio-scale, and linear wasted the ramp on it: 1.0–6.0 with a median near
    // 2.1 put 67 of 142 countries in the darkest fifth, so Italy at 1.2 and
    // France at 1.8 were the same tone and the whole demographic story inside
    // Europe and East Asia disappeared into the floor.
    scale: 'log',
    description: 'Average births per woman over her lifetime.',
    source: 'World Bank · UN DESA',
    sourceUrl: WB('SP.DYN.TFRT.IN'),
  },
  migrantPct: {
    label: 'foreign-born share',
    scale: 'log',
    description: 'International migrants as a share of total population.',
    source: 'World Bank · UN DESA',
    sourceUrl: WB('SM.POP.TOTL.ZS'),
  },
  remittancePctGdp: {
    label: 'remittances % of gdp',
    scale: 'log',
    description: 'Personal remittances received, as a share of GDP.',
    source: 'World Bank · IMF BOP',
    sourceUrl: WB('BX.TRF.PWKR.DT.GD.ZS'),
  },
  rdPctGdp: {
    label: 'r&d % of gdp',
    scale: 'log',
    description: 'Research and development expenditure as a share of GDP.',
    source: 'UNESCO UIS via World Bank',
    sourceUrl: WB('GB.XPD.RSDV.GD.ZS'),
  },
  researchersPerMillion: {
    label: 'researchers per million',
    scale: 'log',
    description: 'Full-time-equivalent researchers in R&D, per million people.',
    source: 'UNESCO UIS via World Bank',
    sourceUrl: WB('SP.POP.SCIE.RD.P6'),
  },
  scientificArticles: {
    label: 'scientific articles / yr',
    scale: 'log',
    description: 'Scientific and technical journal articles published per year.',
    source: 'NSF / World Bank',
    sourceUrl: WB('IP.JRN.ARTC.SC'),
  },
  highTechExportsPct: {
    label: 'high-tech exports %',
    scale: 'log',
    description: 'High-technology goods as a share of manufactured exports.',
    source: 'World Bank · UN Comtrade',
    sourceUrl: WB('TX.VAL.TECH.MF.ZS'),
  },
  giniIndex: {
    label: 'gini inequality',
    scale: 'linear',
    ascending: true,
    description: 'Gini index of income inequality. 0 = perfect equality, 100 = maximum.',
    source: 'World Bank · PovcalNet',
    sourceUrl: WB('SI.POV.GINI'),
  },
  youthUnemploymentPct: {
    label: 'youth unemployment',
    scale: 'log',
    ascending: true,
    description: 'Share of the 15–24 labour force that is unemployed.',
    source: 'ILO via World Bank',
    sourceUrl: WB('SL.UEM.1524.ZS'),
  },
  literacyPct: {
    label: 'adult literacy',
    scale: 'linear',
    description: 'Share of people 15+ able to read and write a short statement.',
    source: 'UNESCO UIS via World Bank',
    sourceUrl: WB('SE.ADT.LITR.ZS'),
  },
  democracyIndex: {
    label: 'democracy (v-dem)',
    scale: 'linear',
    description: 'V-Dem Liberal Democracy Index. 0 = autocracy, 1 = liberal democracy.',
    source: 'V-Dem via Our World in Data',
    sourceUrl: OWID('liberal-democracy-index'),
  },
  corruptionCpi: {
    label: 'cpi (clean gov)',
    scale: 'linear',
    description:
      'Transparency International Corruption Perceptions Index. 0 = highly corrupt, 100 = very clean.',
    source: 'Transparency International via Our World in Data',
    sourceUrl: OWID('corruption-perception-index'),
  },
  pressFreedomScore: {
    label: 'press freedom',
    scale: 'linear',
    ascending: true,
    description:
      'Reporters Without Borders Press Freedom score. 0 = most free, 100 = no press freedom.',
    source: 'RSF via Our World in Data',
    sourceUrl: OWID('press-freedom-index-rsf'),
  },
  hdi: {
    label: 'human development',
    scale: 'linear',
    description:
      'UNDP Human Development Index. Composite of health, education, and income; 0–1, higher is better.',
    source: 'UNDP via Our World in Data',
    sourceUrl: OWID('human-development-index'),
  },
  refugeesHosted: {
    label: 'refugees hosted',
    scale: 'log',
    description: 'Refugees and asylum-seekers hosted, by country of asylum.',
    source: 'UNHCR via Our World in Data',
    sourceUrl: OWID('refugee-population-by-country-or-territory-of-asylum'),
  },
  refugeesProduced: {
    label: 'refugees produced',
    scale: 'log',
    description: 'Refugees and asylum-seekers abroad, by country of origin.',
    source: 'UNHCR via Our World in Data',
    sourceUrl: OWID('refugee-population-by-country-or-territory-of-origin'),
  },
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

  // Population density is arithmetic, not a measurement, and both of its inputs
  // are native fields above. It was only ever *stored* in the augmented table
  // because that is where the generator happened to compute it — so the 32
  // countries missing from that table (the United States, Saudi Arabia, the
  // United Kingdom, South Africa, South Korea…) reported no density at all,
  // while the site held their population and their area the whole time.
  //
  // Derived only when the table has nothing, so every published figure stays
  // byte-identical; checked against the ones it does have — France 66M/544K
  // gives 121, Germany 232, India 424, each matching the stored value exactly.
  if (metric === 'populationDensity' && typeof aug?.populationDensity !== 'string') {
    const pop = parseStat(data.population);
    const area = parseStat(data.area);
    if (pop != null && area != null && area > 0) return `${Math.round(pop / area)} /km²`;
    return null;
  }

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
  const ascending = METRICS[metric].ascending ?? false;
  entries.sort((a, b) => (ascending ? a.numeric - b.numeric : b.numeric - a.numeric));
  rankingCache.set(metric, entries);
  return entries;
}
