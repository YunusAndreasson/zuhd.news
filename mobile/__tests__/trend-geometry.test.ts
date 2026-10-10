import {
  buildTrendLinePath,
  buildTrendXLayout,
  trendLineVertices,
} from '../components/blocks/trend-geometry';
import { formatTickLabel, parseFlexibleDate, periodDates } from '../lib/date-format';

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

  // The feeds' own labels. Node's `Date` reads `Jul 18` (as 2001) and Hermes
  // reads none of these, so on a phone every daily and monthly chart fell back
  // to even spacing with no ticks. These are read by shape, with the year
  // counted back from the last label.
  const NOW = Date.UTC(2026, 9, 10);

  it('reads a daily series labelled by day, in the year it was observed', () => {
    const days = periodDates(['Jul 18', 'Aug 30', 'Oct 4'], NOW);
    expect(days?.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-07-18',
      '2026-08-30',
      '2026-10-04',
    ]);
  });

  it('counts the year back across a new year, and never places the last day in the future', () => {
    expect(
      periodDates(['Dec 30', 'Dec 31', 'Jan 2'], Date.UTC(2027, 0, 5))?.map((d) =>
        d.toISOString().slice(0, 10),
      ),
    ).toEqual(['2026-12-30', '2026-12-31', '2027-01-02']);
    // A December series read in the first days of January.
    expect(
      periodDates(['Dec 29', 'Dec 30'], Date.UTC(2027, 0, 2))?.map((d) =>
        d.toISOString().slice(0, 10),
      ),
    ).toEqual(['2026-12-29', '2026-12-30']);
  });

  it('reads a monthly series labelled by month and year', () => {
    expect(parseFlexibleDate('Oct 2024')?.toISOString()).toBe('2024-10-01T00:00:00.000Z');
    expect(
      periodDates(['Oct 2024', 'Jul 2026'], NOW)?.map((d) => d.toISOString().slice(0, 7)),
    ).toEqual(['2024-10', '2026-07']);
    expect(periodDates(['Jul 18', 'not a day'], NOW)).toBeNull();
    expect(periodDates([], NOW)).toBeNull();
  });

  it('gives a quarter of daily closes a time axis of months', () => {
    const periods: string[] = [];
    for (let t = Date.UTC(2026, 6, 12); t <= Date.UTC(2026, 9, 4); t += 86_400_000) {
      const d = new Date(t);
      periods.push(
        `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCDate()}`,
      );
    }
    const layout = buildTrendXLayout({
      periods,
      seriesLengths: [periods.length],
      left: 0,
      right: 360,
      now: NOW,
    });
    expect(layout.mode).toBe('time');
    // One year throughout, so the ticks do not repeat it.
    expect(layout.ticks?.map((tick) => tick.label)).toEqual(['AUG', 'SEP', 'OCT']);
    const first = layout.ticks?.[0];
    // Aug 1 is 20 of the series' 84 days in.
    expect(first?.x).toBeCloseTo((20 / 84) * 360, 0);
  });

  it("keeps its time axis when the last label repeats for the day's live reading", () => {
    const layout = buildTrendXLayout({
      periods: ['Oct 8', 'Oct 9', 'Oct 10', 'Oct 10'],
      seriesLengths: [4],
      left: 0,
      right: 250,
      now: NOW,
    });
    expect(layout.mode).toBe('time');
    // Two and a half days across: the live reading sits half a day on.
    expect(layout.positions).toEqual([0, 100, 200, 250]);
  });

  it('keeps the year on ticks that cross one', () => {
    const periods = [
      'Oct 2024',
      'Jan 2025',
      'Apr 2025',
      'Jul 2025',
      'Oct 2025',
      'Jan 2026',
      'Apr 2026',
      'Jul 2026',
    ];
    const layout = buildTrendXLayout({
      periods,
      seriesLengths: [8],
      left: 0,
      right: 360,
      now: NOW,
    });
    expect(layout.mode).toBe('time');
    expect(layout.ticks?.every((tick) => /^[A-Z]{3} '\d{2}$/.test(tick.label))).toBe(true);
  });

  it('uses literal straight segments for lines', () => {
    const line = buildTrendLinePath([
      { x: 0, y: 10 },
      { x: 20, y: 5 },
      { x: 90, y: 15 },
    ]);

    expect(line).toBe('M0,10L20,5L90,15');
    expect(line).not.toMatch(/[CQ]/);
  });

  it('draws a held value as steps: level to the next observation, changed there', () => {
    // A rate cut between the second observation and the third. Joined
    // straight, the cut drew as a slide across the whole of that month.
    const held = [
      { x: 0, y: 10 },
      { x: 20, y: 10 },
      { x: 40, y: 30 },
      { x: 60, y: 30 },
    ];
    expect(trendLineVertices(held, 'steps')).toEqual([
      { x: 0, y: 10 },
      { x: 20, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 30 },
      { x: 60, y: 30 },
    ]);
    expect(buildTrendLinePath(held, 'steps')).toBe('M0,10L20,10L40,10L40,30L60,30');
    // Without a shape the line is the observations and nothing more.
    expect(trendLineVertices(held)).toEqual(held);
  });

  it('formats date-only ticks in UTC at a timezone-sensitive boundary', () => {
    const ticks = [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T00:00:00Z')];

    expect(formatTickLabel(ticks[0] as Date, ticks)).toBe('JAN 1');
  });
});
