import { getRanking, METRICS, type MetricKey } from '@shared/countries/country-ranking';
import { displayCountryName } from './place-names';
import { leadNames } from './row-leaders';

/**
 * The country rankings, in the groups the menu lists them under. Twenty-seven
 * measures in one column — population beside press freedom beside CO₂ — read
 * as a table of contents with no chapters. A measure the table does not name
 * lands in `other`, so a metric added to `METRICS` is listed, never lost.
 */
const GROUPS: ReadonlyArray<{ label: string; metrics: readonly MetricKey[] }> = [
  {
    label: 'people',
    metrics: [
      'population',
      'populationDensity',
      'lifeExpectancy',
      'fertilityRate',
      'urbanPct',
      'literacyPct',
      'hdi',
    ],
  },
  { label: 'economy', metrics: ['gdp', 'gdpPerCapita', 'giniIndex', 'youthUnemploymentPct'] },
  { label: 'governance', metrics: ['democracyIndex', 'corruptionCpi', 'pressFreedomScore'] },
  { label: 'military', metrics: ['military', 'militaryPctGdp'] },
  {
    label: 'migration',
    metrics: ['migrantPct', 'refugeesHosted', 'refugeesProduced', 'remittancePctGdp'],
  },
  {
    label: 'science & technology',
    metrics: [
      'rdPctGdp',
      'researchersPerMillion',
      'scientificArticles',
      'highTechExportsPct',
      'internetPct',
    ],
  },
  { label: 'land & climate', metrics: ['area', 'co2PerCapita'] },
];

export interface MetricGroup {
  label: string;
  metrics: MetricKey[];
}

export function metricGroups(): MetricGroup[] {
  const named = new Set(GROUPS.flatMap((g) => g.metrics));
  const other = (Object.keys(METRICS) as MetricKey[]).filter((k) => !named.has(k));
  const groups = GROUPS.map((g) => ({
    label: g.label,
    metrics: g.metrics.filter((k) => k in METRICS),
  }));
  if (other.length > 0) groups.push({ label: 'other', metrics: other });
  return groups.filter((g) => g.metrics.length > 0);
}

/**
 * The countries a ranking opens on, for its row in the menu: up to three, and
 * fewer where three names would not fit one line (fertility's third is the
 * Democratic Republic of the Congo). The order is the ranking's own, so a
 * measure where lower is better leads with its best.
 */
export function rankingLeaders(metric: MetricKey): string[] {
  return leadNames(
    getRanking(metric)
      .slice(0, 3)
      .map((entry) => displayCountryName(entry.name) ?? entry.name),
  );
}
