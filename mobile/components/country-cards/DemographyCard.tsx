import type { DemographyCardData } from '../../lib/country-cards';
import { alignToYears, getGlobalBenchmarks, latest, near } from '../../lib/country-cards';
import { TrajectoryChart } from '../charts/TrajectoryChart';
import { CardShell } from './CardShell';

interface DemographyCardProps {
  data: DemographyCardData;
}

export function DemographyCard({ data }: DemographyCardProps) {
  const fertLatest = latest(data.fertility);
  const fert1980 = near(data.fertility, 1980);

  if (!fertLatest) {
    return (
      <CardShell eyebrow="demographic curve" headline="—" subtitle="No fertility data available." />
    );
  }

  const headline = fertLatest[1].toFixed(1);
  // Replacement = 2.1 children per woman. Above ⇒ growing; below ⇒ aging.
  let subtitle: string;
  const r = fertLatest[1];
  if (r >= 4.5) subtitle = `High fertility — population still expanding fast.`;
  else if (r >= 2.5) subtitle = `Above replacement — still growing.`;
  else if (r >= 1.9) subtitle = `Near replacement (2.1) — population stabilising.`;
  else if (r >= 1.5) subtitle = `Below replacement — long-term shrinking unless migration offsets.`;
  else subtitle = `Far below replacement — rapid aging ahead.`;

  if (fert1980 && Math.abs(fert1980[1] - r) > 1) {
    const dir = r < fert1980[1] ? 'fell' : 'rose';
    subtitle += ` ${dir} from ${fert1980[1].toFixed(1)} in 1980.`;
  }

  const series = data.fertility ?? [];
  const startYear = series[0]?.[0] ?? 1960;
  const endYear = series[series.length - 1]?.[0] ?? new Date().getFullYear();
  const globalSeries = getGlobalBenchmarks().demography?.fertility ?? [];
  const comparisonValues = alignToYears(globalSeries, startYear, endYear);

  return (
    <CardShell
      eyebrow="demographic curve"
      headline={`${headline} ×`}
      subtitle={subtitle}
      source="World Bank"
    >
      <TrajectoryChart
        values={series.map(([, v]) => v)}
        startYear={startYear}
        endYear={endYear}
        comparison={{ values: comparisonValues, label: 'world' }}
        thresholds={[{ value: 2.1, label: 'replace', tone: 'warn' }]}
        formatY={(n) => `${n.toFixed(1)}×`}
        accessibilityLabel={`Fertility rate ${headline} children per woman. ${subtitle} Replacement is 2.1. Comparison line shows world median.`}
      />
    </CardShell>
  );
}
