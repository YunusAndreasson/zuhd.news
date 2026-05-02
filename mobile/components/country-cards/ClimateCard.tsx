import type { ClimateCardData } from '../../lib/country-cards';
import { getGlobalBenchmarks } from '../../lib/country-cards';
import { TrajectoryChart } from '../charts/TrajectoryChart';
import { CardShell } from './CardShell';

interface ClimateCardProps {
  data: ClimateCardData;
}

export function ClimateCard({ data }: ClimateCardProps) {
  const sign = data.warmingC >= 0 ? '+' : '−';
  const headline = `${sign}${Math.abs(data.warmingC).toFixed(1)}°C`;
  const headlineTone =
    data.warmingC >= 2 ? 'unfavorable' : data.warmingC >= 1.5 ? 'dome' : 'emphasis';

  // Subtitle picks the strongest "disappearing threshold" story we have:
  // a vanished frost or a step change in hot days reads more concretely
  // than the °C number alone.
  const hotDelta = data.hotDaysRecent - data.hotDaysBaseline;
  const coldDelta = data.coldNightsRecent - data.coldNightsBaseline;
  let subtitle: string;
  if (data.coldNightsBaseline >= 5 && data.coldNightsRecent === 0) {
    subtitle = `Frost nights gone — averaged ${data.coldNightsBaseline}/year in 1981–2000.`;
  } else if (Math.abs(hotDelta) >= 10) {
    const dir = hotDelta > 0 ? '+' : '−';
    subtitle = `${dir}${Math.abs(hotDelta)} days above 35°C per year vs 1981–2000.`;
  } else if (coldDelta < -2) {
    subtitle = `${Math.abs(coldDelta)} fewer frost nights per year vs 1981–2000.`;
  } else {
    subtitle = `Annual mean temperature since 1980, vs 1981–2000 baseline.`;
  }

  const startYear = data.sparklineStartYear;
  const endYear = startYear + data.anomalies.length - 1;

  // Climate anomalies are stored as a dense annual array; align the global
  // anomaly baseline to the country's start year so both lines share an
  // x-axis. (Drops leading global years if country starts later.)
  const globalAnoms = getGlobalBenchmarks().climate?.anomalies ?? [];
  const globalStart = getGlobalBenchmarks().climate?.sparklineStartYear ?? startYear;
  const sliceFrom = Math.max(0, startYear - globalStart);
  const comparisonValues = globalAnoms.slice(sliceFrom, sliceFrom + data.anomalies.length);

  return (
    <CardShell
      eyebrow="climate change"
      headline={headline}
      headlineTone={headlineTone}
      subtitle={subtitle}
      source="Open-Meteo · ERA5"
    >
      <TrajectoryChart
        values={data.anomalies}
        startYear={startYear}
        endYear={endYear}
        comparison={
          comparisonValues.length > 0 ? { values: comparisonValues, label: 'world' } : undefined
        }
        thresholds={[
          { value: 0, label: '1981–2000', tone: 'neutral' },
          { value: 1.5, label: 'Paris 1.5°', tone: 'warn' },
          { value: 2, label: 'IPCC 2°', tone: 'crit' },
        ]}
        formatY={(n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}°`}
        accessibilityLabel={`Annual temperature anomaly ${headline} versus 1981–2000 baseline. ${subtitle} Comparison line shows world median.`}
      />
    </CardShell>
  );
}
