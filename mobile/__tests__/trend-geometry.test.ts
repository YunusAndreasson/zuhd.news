import {
  buildTrendAreaPath,
  buildTrendLinePath,
  buildTrendXLayout,
} from '../components/blocks/trend-geometry';
import { formatTickLabel } from '../lib/date-format';

describe('trend chart geometry', () => {
  it('positions irregular observations by elapsed UTC time', () => {
    const layout = buildTrendXLayout({
      periods: ['2026-08-01', '2026-08-02', '2026-08-10'],
      seriesLengths: [3],
      left: 0,
      right: 90,
    });

    expect(layout.mode).toBe('time');
    expect(layout.positions[0]).toBeCloseTo(0);
    expect(layout.positions[1]).toBeCloseTo(10);
    expect(layout.positions[2]).toBeCloseTo(90);
  });

  it('keeps readable UTC ticks when D3 proposes tighter intervals', () => {
    const layout = buildTrendXLayout({
      periods: ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'],
      seriesLengths: [4],
      left: 0,
      right: 320,
    });

    expect(layout.ticks?.length).toBeGreaterThanOrEqual(2);
    for (let index = 1; index < (layout.ticks?.length ?? 0); index += 1) {
      const previous = layout.ticks?.[index - 1];
      const current = layout.ticks?.[index];
      expect((current?.x ?? 0) - (previous?.x ?? 0)).toBeGreaterThanOrEqual(64);
    }
  });

  it.each([
    ['missing periods', undefined, [3]],
    ['malformed period', ['2026-08-01', 'not-a-date', '2026-08-10'], [3]],
    ['duplicate period', ['2026-08-01', '2026-08-01', '2026-08-10'], [3]],
    ['descending periods', ['2026-08-02', '2026-08-01', '2026-08-10'], [3]],
    ['period length mismatch', ['2026-08-01', '2026-08-02'], [3]],
    ['series length mismatch', ['2026-08-01', '2026-08-02', '2026-08-10'], [3, 2]],
  ])('falls back to index spacing for %s', (_name, periods, seriesLengths) => {
    const layout = buildTrendXLayout({ periods, seriesLengths, left: 0, right: 90 });

    expect(layout).toEqual({ mode: 'index', positions: [0, 45, 90], ticks: null });
  });

  it('falls back when a confidence band is not aligned', () => {
    const layout = buildTrendXLayout({
      periods: ['2026-08-01', '2026-08-02', '2026-08-10'],
      seriesLengths: [3],
      bandLengths: [3, 2],
      left: 0,
      right: 90,
    });

    expect(layout.mode).toBe('index');
  });

  it('uses literal straight segments for lines and bands', () => {
    const line = buildTrendLinePath([
      { x: 0, y: 10 },
      { x: 20, y: 5 },
      { x: 90, y: 15 },
    ]);
    const area = buildTrendAreaPath([
      { x: 0, low: 10, high: 5 },
      { x: 90, low: 15, high: 8 },
    ]);

    expect(line).toBe('M0,10L20,5L90,15');
    expect(line).not.toMatch(/[CQ]/);
    expect(area).not.toMatch(/[CQ]/);
  });

  it('formats date-only ticks in UTC at a timezone-sensitive boundary', () => {
    const ticks = [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T00:00:00Z')];

    expect(formatTickLabel(ticks[0] as Date, ticks)).toBe('JAN 1');
  });
});
