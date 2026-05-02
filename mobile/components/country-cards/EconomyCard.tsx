import type { EconomyCardData } from '../../lib/country-cards';
import { alignToYears, getGlobalBenchmarks, latest, near } from '../../lib/country-cards';
import { TrajectoryChart } from '../charts/TrajectoryChart';
import { CardShell } from './CardShell';

interface EconomyCardProps {
  data: EconomyCardData;
}

function fmtUSD(n: number): string {
  if (n >= 100_000) return `$${Math.round(n / 1000)}K`;
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}K`;
  if (n >= 1_000) return `$${Math.round(n).toLocaleString()}`;
  return `$${Math.round(n)}`;
}

export function EconomyCard({ data }: EconomyCardProps) {
  const gdpLatest = latest(data.gdpPerCapita);
  const gdp2000 = near(data.gdpPerCapita, 2000);

  if (!gdpLatest) {
    return (
      <CardShell
        eyebrow="economic momentum"
        headline="—"
        subtitle="No GDP per capita data available."
      />
    );
  }

  const headline = fmtUSD(gdpLatest[1]);
  let subtitle: string;
  if (gdp2000) {
    const ratio = gdpLatest[1] / gdp2000[1];
    if (ratio >= 4) subtitle = `Quadrupled since 2000.`;
    else if (ratio >= 2.5) subtitle = `Tripled since 2000.`;
    else if (ratio >= 1.7) subtitle = `Roughly doubled since 2000.`;
    else if (ratio >= 1.2) subtitle = `Up ${Math.round((ratio - 1) * 100)}% since 2000.`;
    else if (ratio >= 0.85) subtitle = `Roughly flat for two decades.`;
    else subtitle = `Down ${Math.round((1 - ratio) * 100)}% since 2000.`;
  } else {
    subtitle = `GDP per capita, current US$.`;
  }

  // Use GDP per capita as the chart series; inflation rolls in as a soft
  // overlay later if we add multi-line cards. For now keep one signal —
  // the trajectory tells the story without color noise.
  const series = data.gdpPerCapita ?? [];
  const startYear = series[0]?.[0] ?? 1990;
  const endYear = series[series.length - 1]?.[0] ?? new Date().getFullYear();
  const globalSeries = getGlobalBenchmarks().economy?.gdpPerCapita ?? [];
  const comparisonValues = alignToYears(globalSeries, startYear, endYear);

  return (
    <CardShell
      eyebrow="economic momentum"
      headline={headline}
      subtitle={subtitle}
      source="World Bank"
    >
      <TrajectoryChart
        values={series.map(([, v]) => v)}
        startYear={startYear}
        endYear={endYear}
        comparison={{ values: comparisonValues, label: 'world' }}
        formatY={(n) => (n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${Math.round(n)}`)}
        accessibilityLabel={`GDP per capita ${headline}, ${subtitle.toLowerCase()} Comparison line shows world median.`}
      />
    </CardShell>
  );
}
