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
   *  equality; youth unemployment — lower is better). */
  ascending?: boolean;
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
    description: 'Total resident population.',
    source: 'REST Countries · UN data',
    sourceUrl: 'https://restcountries.com/',
  },
  gdp: {
    label: 'gdp',
    description: 'Nominal gross domestic product, current US dollars.',
    source: 'World Bank · latest available',
    sourceUrl: WB('NY.GDP.MKTP.CD'),
  },
  gdpPerCapita: {
    label: 'gdp per capita',
    description: 'Nominal GDP divided by population, current US dollars.',
    source: 'World Bank · latest available',
    sourceUrl: WB('NY.GDP.PCAP.CD'),
  },
  military: {
    label: 'military spending',
    description: 'Annual military expenditure, current US dollars.',
    source: 'SIPRI via World Bank',
    sourceUrl: WB('MS.MIL.XPND.CD'),
  },
  militaryPctGdp: {
    label: 'military % of gdp',
    description: 'Military expenditure as a share of GDP.',
    source: 'SIPRI via World Bank',
    sourceUrl: WB('MS.MIL.XPND.GD.ZS'),
  },
  area: {
    label: 'area',
    description: 'Total land area in square kilometres.',
    source: 'REST Countries',
    sourceUrl: 'https://restcountries.com/',
  },
  populationDensity: {
    label: 'population density',
    description: 'Derived: population divided by land area.',
    source: 'zuhd — derived from population and area',
  },
  lifeExpectancy: {
    label: 'life expectancy',
    description: 'Life expectancy at birth, total years.',
    source: 'World Bank · latest available',
    sourceUrl: WB('SP.DYN.LE00.IN'),
  },
  internetPct: {
    label: 'internet access',
    description: 'Share of the population using the internet.',
    source: 'ITU via World Bank',
    sourceUrl: WB('IT.NET.USER.ZS'),
  },
  co2PerCapita: {
    label: 'co₂ per capita',
    description: 'Tonnes of CO₂-equivalent emitted per person, excluding land use.',
    source: 'World Bank · Climate Watch',
    sourceUrl: WB('EN.GHG.CO2.PC.CE.AR5'),
  },
  urbanPct: {
    label: 'urbanization',
    description: 'Share of population living in urban areas.',
    source: 'World Bank · UN DESA',
    sourceUrl: WB('SP.URB.TOTL.IN.ZS'),
  },
  fertilityRate: {
    label: 'fertility rate',
    description: 'Average births per woman over her lifetime.',
    source: 'World Bank · UN DESA',
    sourceUrl: WB('SP.DYN.TFRT.IN'),
  },
  migrantPct: {
    label: 'foreign-born share',
    description: 'International migrants as a share of total population.',
    source: 'World Bank · UN DESA',
    sourceUrl: WB('SM.POP.TOTL.ZS'),
  },
  remittancePctGdp: {
    label: 'remittances % of gdp',
    description: 'Personal remittances received, as a share of GDP.',
    source: 'World Bank · IMF BOP',
    sourceUrl: WB('BX.TRF.PWKR.DT.GD.ZS'),
  },
  rdPctGdp: {
    label: 'r&d % of gdp',
    description: 'Research and development expenditure as a share of GDP.',
    source: 'UNESCO UIS via World Bank',
    sourceUrl: WB('GB.XPD.RSDV.GD.ZS'),
  },
  researchersPerMillion: {
    label: 'researchers per million',
    description: 'Full-time-equivalent researchers in R&D, per million people.',
    source: 'UNESCO UIS via World Bank',
    sourceUrl: WB('SP.POP.SCIE.RD.P6'),
  },
  scientificArticles: {
    label: 'scientific articles / yr',
    description: 'Scientific and technical journal articles published per year.',
    source: 'NSF / World Bank',
    sourceUrl: WB('IP.JRN.ARTC.SC'),
  },
  highTechExportsPct: {
    label: 'high-tech exports %',
    description: 'High-technology goods as a share of manufactured exports.',
    source: 'World Bank · UN Comtrade',
    sourceUrl: WB('TX.VAL.TECH.MF.ZS'),
  },
  giniIndex: {
    label: 'gini inequality',
    ascending: true,
    description: 'Gini index of income inequality. 0 = perfect equality, 100 = maximum.',
    source: 'World Bank · PovcalNet',
    sourceUrl: WB('SI.POV.GINI'),
  },
  youthUnemploymentPct: {
    label: 'youth unemployment',
    ascending: true,
    description: 'Share of the 15–24 labour force that is unemployed.',
    source: 'ILO via World Bank',
    sourceUrl: WB('SL.UEM.1524.ZS'),
  },
  literacyPct: {
    label: 'adult literacy',
    description: 'Share of people 15+ able to read and write a short statement.',
    source: 'UNESCO UIS via World Bank',
    sourceUrl: WB('SE.ADT.LITR.ZS'),
  },
  democracyIndex: {
    label: 'democracy (v-dem)',
    description: 'V-Dem Liberal Democracy Index. 0 = autocracy, 1 = liberal democracy.',
    source: 'V-Dem via Our World in Data',
    sourceUrl: OWID('liberal-democracy-index'),
  },
  corruptionCpi: {
    label: 'cpi (clean gov)',
    description:
      'Transparency International Corruption Perceptions Index. 0 = highly corrupt, 100 = very clean.',
    source: 'Transparency International via Our World in Data',
    sourceUrl: OWID('corruption-perception-index'),
  },
  pressFreedomScore: {
    label: 'press freedom',
    ascending: true,
    description:
      'Reporters Without Borders Press Freedom score. 0 = most free, 100 = no press freedom.',
    source: 'RSF via Our World in Data',
    sourceUrl: OWID('press-freedom-index-rsf'),
  },
  hdi: {
    label: 'human development',
    description:
      'UNDP Human Development Index. Composite of health, education, and income; 0–1, higher is better.',
    source: 'UNDP via Our World in Data',
    sourceUrl: OWID('human-development-index'),
  },
  refugeesHosted: {
    label: 'refugees hosted',
    description: 'Refugees and asylum-seekers hosted, by country of asylum.',
    source: 'UNHCR via Our World in Data',
    sourceUrl: OWID('refugee-population-by-country-or-territory-of-asylum'),
  },
  refugeesProduced: {
    label: 'refugees produced',
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
