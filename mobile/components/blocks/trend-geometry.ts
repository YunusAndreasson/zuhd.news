import { scaleUtc } from 'd3-scale';
import { curveLinear, line as d3Line } from 'd3-shape';
import { formatTickLabel, periodDates } from '../../lib/date-format';
import { DAY_MS } from '../../lib/time';

export interface TrendPoint {
  x: number;
  y: number;
}

export interface TrendTimeTick {
  x: number;
  label: string;
}

export interface TrendXLayout {
  mode: 'index' | 'time';
  positions: number[];
  ticks: TrendTimeTick[] | null;
}

interface TrendXLayoutOptions {
  periods?: string[];
  seriesLengths: number[];
  left: number;
  right: number;
  maxTicks?: number;
  /** When "now" is, for a day label that carries no year. */
  now?: number;
}

const MIN_TICK_SPACING = 64;

function indexPositions(count: number, left: number, right: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    count <= 1 ? left : left + (i / (count - 1)) * (right - left),
  );
}

/**
 * Build the one horizontal encoding shared by paths, points, annotations and
 * axis ticks. A time scale is only honest when every rendered series and band
 * is aligned to the same complete, strictly increasing period array; malformed
 * payloads retain the previous safe index-spacing fallback.
 */
export function buildTrendXLayout({
  periods,
  seriesLengths,
  left,
  right,
  maxTicks = 4,
  now,
}: TrendXLayoutOptions): TrendXLayout {
  const pointCount = Math.max(0, ...seriesLengths);
  const fallback = (): TrendXLayout => ({
    mode: 'index',
    positions: indexPositions(pointCount, left, right),
    ticks: null,
  });

  if (
    pointCount < 2 ||
    !periods ||
    periods.length !== pointCount ||
    seriesLengths.some((length) => length !== pointCount)
  ) {
    return fallback();
  }

  const dates = periodDates(periods, now);
  if (!dates) return fallback();
  // A daily series can end on the day's live reading under the same label as
  // its last close (`Oct 10`, `Oct 10`): the same day, later, so half a day
  // on. A repeat anywhere else is a malformed series and takes the fallback.
  const final = dates[dates.length - 1];
  const before = dates[dates.length - 2];
  if (final && before && final.getTime() === before.getTime()) {
    dates[dates.length - 1] = new Date(final.getTime() + DAY_MS / 2);
  }
  for (let i = 1; i < dates.length; i++) {
    if ((dates[i] as Date).getTime() <= (dates[i - 1] as Date).getTime()) return fallback();
  }

  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return fallback();

  // Chart periods are date-only editorial observations. UTC keeps their
  // positions and labels identical in every device timezone and across DST.
  const scale = scaleUtc().domain([first, last]).range([left, right]);
  const desiredTickCount = Math.max(
    2,
    Math.min(maxTicks, Math.floor(Math.max(0, right - left) / MIN_TICK_SPACING)),
  );
  const rawTicks = scale.ticks(desiredTickCount);
  let lastTickX = Number.NEGATIVE_INFINITY;
  const spacedTicks = rawTicks.filter((date) => {
    const x = scale(date);
    if (x - lastTickX < MIN_TICK_SPACING) return false;
    lastTickX = x;
    return true;
  });
  const ticks =
    spacedTicks.length >= 2
      ? spacedTicks.map((date) => ({
          x: scale(date),
          label: formatTickLabel(date, spacedTicks),
        }))
      : null;

  return {
    mode: 'time',
    positions: dates.map((date) => scale(date)),
    ticks,
  };
}

/** How a line joins its observations: straight from one to the next, or
 *  `steps` for a value that holds until it is changed. */
export type TrendShape = 'steps';

/**
 * The corners a line turns at, in drawing order.
 *
 * A policy rate is set on a day and stands until the next decision, and a
 * lab's best score stands until its next release. Joined straight, a cut made
 * on one day drew as a month's slide. As `steps` the line runs level from
 * each observation to the next one's day and changes there.
 */
export function trendLineVertices(points: readonly TrendPoint[], shape?: TrendShape): TrendPoint[] {
  if (shape !== 'steps') return [...points];
  const out: TrendPoint[] = [];
  points.forEach((point, i) => {
    const before = points[i - 1];
    if (before && before.y !== point.y) out.push({ x: point.x, y: before.y });
    out.push(point);
  });
  return out;
}

/** Literal point-to-point interpolation for discrete observations. */
export function buildTrendLinePath(points: TrendPoint[], shape?: TrendShape): string {
  return (
    d3Line<TrendPoint>()
      .x((point) => point.x)
      .y((point) => point.y)
      .curve(curveLinear)(trendLineVertices(points, shape)) ?? ''
  );
}
