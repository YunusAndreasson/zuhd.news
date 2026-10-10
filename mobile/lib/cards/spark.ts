import { QUIET_SPAN_PCT } from './chart-scale';
import type { MovePath } from './path';
import type { CardDelta } from './types';

/**
 * A small line's geometry: a path in per cent (`movePath`) as points in a box.
 *
 * Drawn to its own range a line that moved half a per cent fills the box as
 * one that moved twenty does, and a quiet month looks like a wild one. So the
 * box is never less than `QUIET_SPAN_PCT` tall, a card chart's own floor
 * (`chartScale`): a calm line lies nearly flat across its middle, and only a
 * month that moved further fills it.
 */

export interface SparkPoint {
  x: number;
  y: number;
}

/** Each day at its place between the first and the last, each value between
 *  the box's floor and ceiling, inset by `pad` for the stroke and the dot. */
export function sparkPoints(
  path: MovePath,
  width: number,
  height: number,
  pad: number,
  floor = QUIET_SPAN_PCT,
): SparkPoint[] {
  const first = path.days[0];
  const last = path.days.at(-1);
  if (first === undefined || last === undefined) return [];
  let low = Math.min(...path.values);
  let high = Math.max(...path.values);
  if (high - low < floor) {
    const centre = (high + low) / 2;
    low = centre - floor / 2;
    high = centre + floor / 2;
  }
  const across = Math.max(1, last - first);
  return path.days.map((day, i) => ({
    x: pad + ((day - first) / across) * (width - 2 * pad),
    y: pad + ((high - (path.values[i] ?? 0)) / (high - low)) * (height - 2 * pad),
  }));
}

/** Half the decimal a chip prints: nearer than this to where it began, the
 *  line went nowhere. */
const FLAT_PCT = 0.05;

/** Which way the line went from its first day to its last: its colour, as a
 *  chip takes one. */
export function sparkDirection(path: MovePath): CardDelta['direction'] {
  const net = (path.values.at(-1) ?? 0) - (path.values[0] ?? 0);
  if (Math.abs(net) < FLAT_PCT) return 'flat';
  return net > 0 ? 'up' : 'down';
}
