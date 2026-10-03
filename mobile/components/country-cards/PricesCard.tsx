import type { EconomyCardData } from '../../lib/country-cards';
import {
  formatInflation,
  getGlobalBenchmarks,
  inflationSummary,
  trajectoryOf,
} from '../../lib/country-cards';
import { TrajectoryChart } from '../charts/TrajectoryChart';
import { CardShell } from './CardShell';

interface PricesCardProps {
  data: EconomyCardData;
}

/**
 * Inflation: what a year did to prices, and the decades behind it. The series
 * was bundled for 160 countries from the day the cards shipped and nothing
 * drew it — the economy card's own comment deferred it to "multi-line cards".
 * A second line on the GDP chart would have put two units on one axis; it is
 * its own card.
 */
export function PricesCard({ data }: PricesCardProps) {
  const world = getGlobalBenchmarks().economy?.inflation;
  const summary = inflationSummary(data.inflation, world);
  const trajectory = trajectoryOf(data.inflation, world);
  if (!summary || !trajectory) return null;

  return (
    <CardShell
      eyebrow="prices"
      headline={summary.headline}
      subtitle={summary.subtitle}
      source="World Bank"
    >
      <TrajectoryChart
        {...trajectory}
        formatY={formatInflation}
        accessibilityLabel={`Inflation ${summary.headline}. ${summary.subtitle} Comparison line shows world median.`}
      />
    </CardShell>
  );
}
