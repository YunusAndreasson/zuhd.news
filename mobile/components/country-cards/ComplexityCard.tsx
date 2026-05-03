import type { ComplexityCardData } from '../../lib/country-cards';
import { alignToYears, getGlobalBenchmarks, latest, near } from '../../lib/country-cards';
import { TrajectoryChart } from '../charts/TrajectoryChart';
import { CardShell } from './CardShell';

interface ComplexityCardProps {
  data: ComplexityCardData;
}

function fmtSigned(n: number): string {
  // Always sign the ECI value so the reader sees the "+/–" relation to the
  // world median (zero) without having to scan the chart for the threshold
  // line. `0.0` keeps a sign-less form for countries sitting on the median.
  if (n > 0) return `+${n.toFixed(1)}`;
  if (n < 0) return `−${Math.abs(n).toFixed(1)}`;
  return '0.0';
}

export function ComplexityCard({ data }: ComplexityCardProps) {
  const eciLatest = latest(data.eci);
  const rankLatest = latest(data.eciRank);
  const rankOld = near(data.eciRank, 1995);

  if (!eciLatest || !rankLatest) {
    return (
      <CardShell
        eyebrow="economic complexity"
        headline="—"
        subtitle="Not in the Atlas of Economic Complexity rankings."
      />
    );
  }

  // Rank as the focal headline — `#18` is more legible than the raw ECI
  // value. The chart carries the value trajectory; the rank carries the
  // "where do we stand?" snapshot.
  const headline = `#${rankLatest[1]}`;

  // Subtitle: rank movement since ~1995. ECI is a slow-moving structural
  // measure — a multi-decade comparison surfaces real change rather than
  // year-on-year noise.
  let subtitle: string;
  if (rankOld) {
    const delta = rankOld[1] - rankLatest[1]; // positive delta = climbed
    const fromTxt = `from #${rankOld[1]} since ${rankOld[0]}`;
    if (delta >= 20) subtitle = `Major climb in export sophistication — ${fromTxt}.`;
    else if (delta >= 8) subtitle = `Climbing the complexity rankings — ${fromTxt}.`;
    else if (delta <= -20) subtitle = `Slipping in export sophistication — ${fromTxt}.`;
    else if (delta <= -8) subtitle = `Sliding in the complexity rankings — ${fromTxt}.`;
    else if (rankLatest[1] <= 15) subtitle = `Holding a top-tier export basket since the 1990s.`;
    else subtitle = `Roughly steady in the rankings since 1995.`;
  } else {
    subtitle = `Rank within the world's exporters by export basket sophistication.`;
  }

  // ECI value series for the trajectory. Hard-coded y-bounds give every
  // country the same visual scale so users can compare cards across the
  // carousel; the 0 threshold is the world median (z-score zero) labelled
  // for readers who don't know ECI is zero-centred.
  const series = data.eci ?? [];
  const startYear = series[0]?.[0] ?? 1995;
  const endYear = series[series.length - 1]?.[0] ?? new Date().getFullYear();
  const globalSeries = getGlobalBenchmarks().complexity?.eci ?? [];
  const comparisonValues = alignToYears(globalSeries, startYear, endYear);

  return (
    <CardShell
      eyebrow="economic complexity"
      headline={headline}
      subtitle={subtitle}
      source="Harvard Growth Lab"
    >
      <TrajectoryChart
        values={series.map(([, v]) => v)}
        startYear={startYear}
        endYear={endYear}
        comparison={{ values: comparisonValues, label: 'world' }}
        minY={-3}
        maxY={3}
        thresholds={[{ value: 0, label: 'world median', tone: 'neutral' }]}
        formatY={fmtSigned}
        accessibilityLabel={`Ranked ${headline} in economic complexity. ${subtitle} Comparison line shows world median.`}
      />
    </CardShell>
  );
}
