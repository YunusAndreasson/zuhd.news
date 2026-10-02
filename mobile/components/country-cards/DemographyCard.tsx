import type { DemographyCardData } from '../../lib/country-cards';
import { getGlobalBenchmarks, latest, near, trajectoryOf } from '../../lib/country-cards';
import { TrajectoryChart } from '../charts/TrajectoryChart';
import { CardShell } from './CardShell';

interface DemographyCardProps {
  data: DemographyCardData;
}

export function DemographyCard({ data }: DemographyCardProps) {
  const fertLatest = latest(data.fertility);
  const fert1980 = near(data.fertility, 1980);
  const trajectory = trajectoryOf(data.fertility, getGlobalBenchmarks().demography?.fertility);

  if (!fertLatest || !trajectory) {
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
    const dir = r < fert1980[1] ? 'Fell' : 'Rose';
    subtitle += ` ${dir} from ${fert1980[1].toFixed(1)} in 1980.`;
  }

  return (
    <CardShell
      eyebrow="demographic curve"
      headline={`${headline} ×`}
      subtitle={subtitle}
      source="World Bank"
    >
      <TrajectoryChart
        {...trajectory}
        thresholds={[{ value: 2.1, label: 'replacement' }]}
        formatY={(n) => `${n.toFixed(1)}×`}
        accessibilityLabel={`Fertility rate ${headline} children per woman. ${subtitle} Replacement is 2.1. Comparison line shows world median.`}
      />
    </CardShell>
  );
}
