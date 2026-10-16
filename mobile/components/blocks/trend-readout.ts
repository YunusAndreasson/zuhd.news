import { dataDecimals } from '@shared/chart/series';
import type { TrendSeries } from '@shared/types';
import { spokenDelta } from '../../lib/cards/format';
import type { CardDelta } from '../../lib/cards/types';
import { formatBlockNumber } from './shared';

/**
 * What a chart's scrub reads at one of its points, said one way for the
 * finger and for a screen reader: the readout box prints it, and the chart's
 * adjustable value speaks it, from the same function.
 */

export interface ScrubSource {
  /** The chart's series, the first being the one its points are drawn for. */
  series: TrendSeries[];
  primaryValues: number[];
  periods?: string[];
  unit?: string;
  /** The move from an observation to the newest. */
  moveSince?: (index: number) => CardDelta | undefined;
}

export interface ScrubReading {
  /** One line per series ("Brent: 82.10 $/bbl"), or the value alone. */
  values: string[];
  period: string;
  move?: CardDelta;
}

export function scrubReading(source: ScrubSource, index: number): ScrubReading | null {
  const value = source.primaryValues[index];
  if (index < 0 || value === undefined) return null;
  // The source's precision, the web chart's rule (`shared/chart/series.ts`).
  const decimals = Math.min(dataDecimals(source.primaryValues), 4);
  const values =
    source.series.length > 1
      ? source.series.flatMap((s) => {
          const v = s.values[index];
          return v === undefined
            ? []
            : [`${s.label}: ${formatBlockNumber(v, source.unit, decimals)}`];
        })
      : [formatBlockNumber(value, source.unit, decimals)];
  return {
    values,
    period: source.periods?.[index] ?? '',
    // What a reader holding a day wants next: how far it has come since.
    move: source.moveSince?.(index),
  };
}

/** A day is "on Sep 20"; a month, year or quarter is "in Sep", "in 2024".
 *  The spoken summary said "3.1 a day in Sep 20" on every daily series. */
export function periodPreposition(period: string): 'on' | 'in' {
  return /^[A-Za-z]{3,9}\.? \d{1,2}$/.test(period.trim()) ? 'on' : 'in';
}

/** The reading as a screen reader says it: "124.24 $/bbl on Sep 20, up 3.1%
 *  since", and that a cited story sits there, which a finger feels as a tick. */
export function spokenScrubReading(reading: ScrubReading, { cited = false } = {}): string {
  const when = reading.period ? ` ${periodPreposition(reading.period)} ${reading.period}` : '';
  const move = reading.move ? `, ${spokenDelta(reading.move)}` : '';
  return `${reading.values.join(', ')}${when}${move}${cited ? ', a cited story' : ''}`;
}

/** One step along the points, stopping at either end. */
export function stepIndex(
  index: number,
  direction: 'increment' | 'decrement',
  count: number,
): number {
  const next = index + (direction === 'increment' ? 1 : -1);
  return Math.max(0, Math.min(count - 1, next));
}
