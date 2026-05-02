import type { TradeCardData } from '../../lib/country-cards';
import { alignToYears, getGlobalBenchmarks, latest, near } from '../../lib/country-cards';
import { TrajectoryChart } from '../charts/TrajectoryChart';
import { CardShell } from './CardShell';

interface TradeCardProps {
  data: TradeCardData;
}

export function TradeCard({ data }: TradeCardProps) {
  const recent = latest(data.highIncomeShare);
  const old = near(data.highIncomeShare, 1995);

  if (!recent) {
    return (
      <CardShell
        eyebrow="trade orientation"
        headline="—"
        subtitle="No bilateral trade data available."
      />
    );
  }

  const headline = `${Math.round(recent[1])}%`;

  // The "West" framing is muddied by Asian high-income economies (Japan,
  // Korea, Singapore), but for non-rich countries the direction-of-travel
  // is the East-shift story: ↓ share to high-income = ↑ share to China + co.
  let subtitle: string;
  if (old) {
    const delta = recent[1] - old[1];
    if (delta <= -15)
      subtitle = `Major pivot away from rich economies — was ${Math.round(old[1])}% in 1995.`;
    else if (delta <= -5)
      subtitle = `Drifting away from rich economies — was ${Math.round(old[1])}% in 1995.`;
    else if (delta >= 10)
      subtitle = `Strengthened with rich economies — was ${Math.round(old[1])}% in 1995.`;
    else subtitle = `Roughly steady since the 1990s.`;
  } else {
    subtitle = `Share of merchandise exports to high-income economies.`;
  }

  const series = data.highIncomeShare ?? [];
  const startYear = series[0]?.[0] ?? 1990;
  const endYear = series[series.length - 1]?.[0] ?? new Date().getFullYear();
  // Align global comparison to the same x-axis as the country series.
  const globalSeries = getGlobalBenchmarks().trade?.highIncomeShare ?? [];
  const comparisonValues = alignToYears(globalSeries, startYear, endYear);

  return (
    <CardShell
      eyebrow="trade orientation"
      headline={headline}
      subtitle={subtitle}
      source="World Bank"
    >
      <TrajectoryChart
        values={series.map(([, v]) => v)}
        startYear={startYear}
        endYear={endYear}
        comparison={{ values: comparisonValues, label: 'world' }}
        minY={0}
        maxY={100}
        thresholds={[{ value: 50, label: 'half', tone: 'neutral' }]}
        formatY={(n) => `${Math.round(n)}%`}
        accessibilityLabel={`${headline} of merchandise exports go to high-income economies. ${subtitle} Comparison line shows world median.`}
      />
    </CardShell>
  );
}
