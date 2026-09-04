import { scaleUtc } from 'd3-scale';
import { curveLinear, area as d3Area, line as d3Line } from 'd3-shape';
import { formatTickLabel, parseFlexibleDate } from '../../lib/date-format';

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
  bandLengths?: [number, number];
  left: number;
  right: number;
  maxTicks?: number;
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
  bandLengths,
  left,
  right,
  maxTicks = 4,
}: TrendXLayoutOptions): TrendXLayout {
  const lengths = bandLengths ? [...seriesLengths, ...bandLengths] : seriesLengths;
  const pointCount = Math.max(0, ...lengths);
  const fallback = (): TrendXLayout => ({
    mode: 'index',
    positions: indexPositions(pointCount, left, right),
    ticks: null,
  });

  if (
    pointCount < 2 ||
    !periods ||
    periods.length !== pointCount ||
    lengths.some((length) => length !== pointCount)
  ) {
    return fallback();
  }

  const dates: Date[] = [];
  for (const period of periods) {
    const date = parseFlexibleDate(period);
    if (!date) return fallback();
    const previous = dates[dates.length - 1];
    if (previous && date.getTime() <= previous.getTime()) return fallback();
    dates.push(date);
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

/** Literal point-to-point interpolation for discrete observations. */
export function buildTrendLinePath(points: TrendPoint[]): string {
  return (
    d3Line<TrendPoint>()
      .x((point) => point.x)
      .y((point) => point.y)
      .curve(curveLinear)(points) ?? ''
  );
}

export function buildTrendAreaPath(
  points: Array<{ x: number; low: number; high: number }>,
): string {
  return (
    d3Area<{ x: number; low: number; high: number }>()
      .x((point) => point.x)
      .y0((point) => point.low)
      .y1((point) => point.high)
      .curve(curveLinear)(points) ?? ''
  );
}
