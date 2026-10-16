import {
  formatTrajectory,
  type TrajectoryCard as Trajectory,
} from '@shared/countries/country-trajectories';
import { useMemo } from 'react';
import { trajectorySentence } from '../../lib/country-cards';
import { TrajectoryChart } from '../charts/TrajectoryChart';
import { CardShell } from './CardShell';

interface TrajectoryCardProps {
  card: Trajectory;
}

/**
 * One of a country's trajectories: its figure, its sentence and its line
 * against the world's median. The words and the series are the site's
 * (`trajectoryCards`), so a country reads the same on its page and here.
 */
export function TrajectoryCard({ card }: TrajectoryCardProps) {
  const { periods, world, reference, domain, format } = card;
  const comparison = useMemo(() => ({ values: world, label: 'world' }), [world]);
  const thresholds = useMemo(() => (reference ? [reference] : undefined), [reference]);
  // A scale every country shares names nothing about this one: its ends are
  // the bounds of a score nobody reads in, under a headline that is the rank.
  const formatY = useMemo(
    () => (domain ? undefined : (v: number) => formatTrajectory(format, v)),
    [domain, format],
  );

  return (
    <CardShell
      eyebrow={card.eyebrow}
      headline={card.headline}
      subtitle={card.subtitle}
      source={card.source}
    >
      <TrajectoryChart
        values={card.values}
        startYear={Number(periods[0])}
        endYear={Number(periods[periods.length - 1])}
        comparison={comparison}
        thresholds={thresholds}
        minY={domain?.[0]}
        maxY={domain?.[1]}
        formatY={formatY}
        accessibilityLabel={trajectorySentence(card)}
      />
    </CardShell>
  );
}
