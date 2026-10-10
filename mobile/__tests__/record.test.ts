import type { Chokepoint, Indicator, TrendsSnapshot } from '@shared/types';
import { currencyCard, indicatorCard, straitCardFor } from '../lib/cards/markets';
import {
  CURRENCY_RECORD,
  RATE_RECORD,
  RECORD_MIN_RUN,
  recordLine,
  seriesRecord,
  TRAFFIC_RECORD,
} from '../lib/cards/record';

// The newest reading against the chart it sits on: a record, and since when.

const NOW = Date.UTC(2026, 9, 10);

/** Daily labels ending on Oct 9 2026, `n` of them, every calendar day. */
const days = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 9) - (n - 1 - i) * 86400_000);
    return `${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[d.getUTCMonth()]} ${d.getUTCDate()}`;
  });

/** A series that sits at `level` and ends on `last`, `n` long. */
const flatThen = (n: number, level: number, last: number): number[] => [
  ...Array.from({ length: n - 1 }, () => level),
  last,
];

describe('seriesRecord', () => {
  it('finds a high, and the last observation that was at least as high', () => {
    const periods = ['Oct 1', 'Oct 2', 'Oct 3', 'Oct 4', 'Oct 5'];
    expect(seriesRecord([9, 4, 5, 6, 7], periods)).toEqual({
      extreme: 'high',
      since: 'Oct 1',
      run: 3,
    });
    expect(seriesRecord([9, 8, 7, 6, 5], periods)).toEqual({ extreme: 'low', since: null, run: 4 });
    expect(seriesRecord([1, 2, 3, 4, 5], periods)).toEqual({
      extreme: 'high',
      since: null,
      run: 4,
    });
    expect(seriesRecord([3, 9, 9, 9, 4], periods)).toEqual({
      extreme: 'low',
      since: 'Oct 1',
      run: 3,
    });
  });

  it('counts no tie: a reading that matches an old high has not passed it', () => {
    const periods = ['Oct 1', 'Oct 2', 'Oct 3', 'Oct 4'];
    expect(seriesRecord([5, 5, 5, 5], periods)).toBeNull();
    // Equal to yesterday's is no record either way.
    expect(seriesRecord([1, 2, 7, 7], periods)).toBeNull();
    // It stands clear of the two days since the 2nd, which matched it.
    expect(seriesRecord([1, 7, 3, 7], periods)).toEqual({
      extreme: 'high',
      since: 'Oct 2',
      run: 1,
    });
  });

  it('answers nothing for a series it cannot read', () => {
    expect(seriesRecord([], [])).toBeNull();
    expect(seriesRecord([5], ['Oct 1'])).toBeNull();
    expect(seriesRecord([1, 2], ['Oct 1'])).toBeNull();
    expect(seriesRecord([1, 2, Number.NaN], ['a', 'b', 'c'])).toBeNull();
    // A gap inside the run: "since" would skip a day nobody measured.
    expect(seriesRecord([9, Number.NaN, 2, 3], ['a', 'b', 'c', 'd'])).toBeNull();
  });
});

describe('recordLine', () => {
  it('names the day the record has stood since, and prints no number', () => {
    const n = RECORD_MIN_RUN + 5;
    const values = flatThen(n, 5.1, 5.31);
    values[2] = 5.4;
    const periods = days(n);
    expect(recordLine(values, periods, undefined, { now: NOW })).toBe(
      `Highest since ${periods[2]}.`,
    );
    expect(recordLine(values, periods, undefined, { now: NOW })).not.toMatch(/\d\.\d/);
    values[2] = 4.8;
    values[n - 1] = 4.9;
    expect(recordLine(values, periods, undefined, { now: NOW })).toBe(
      `Lowest since ${periods[2]}.`,
    );
  });

  it('says nothing for a record younger than about a month of sessions', () => {
    const n = 40;
    const periods = days(n);
    const values = flatThen(n, 100, 120);
    // Passed nineteen sessions ago: a nineteen-session high.
    values[n - 1 - RECORD_MIN_RUN] = 130;
    expect(recordLine(values, periods, undefined, { now: NOW })).toBeUndefined();
    values[n - 1 - RECORD_MIN_RUN] = 100;
    values[n - 2 - RECORD_MIN_RUN] = 130;
    expect(recordLine(values, periods, undefined, { now: NOW })).toBe(
      `Highest since ${periods[n - 2 - RECORD_MIN_RUN]}.`,
    );
    // And nothing on an ordinary day.
    expect(recordLine(flatThen(n, 100, 100), periods, undefined, { now: NOW })).toBeUndefined();
  });

  it('names the chart’s own span where nothing on it beats the reading', () => {
    // A quarter of calendar days, as an exchange's or a contract's chart holds.
    expect(recordLine(flatThen(92, 100, 120), days(92), undefined, { now: NOW })).toBe(
      'Highest in three months.',
    );
    // A currency's thirty days.
    expect(recordLine(flatThen(31, 100, 90), days(31), undefined, { now: NOW })).toBe(
      'Lowest in a month.',
    );
    // Two years of months.
    const months = Array.from({ length: 25 }, (_, i) => {
      const d = new Date(Date.UTC(2024, 8 + i, 1));
      return `${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    });
    expect(recordLine(flatThen(25, 3, 4), months, undefined, { now: NOW })).toBe(
      'Highest in two years.',
    );
    // Labels that are not dates give no span, and so no line.
    const unread = Array.from({ length: 31 }, (_, i) => `p${i}`);
    expect(recordLine(flatThen(31, 100, 120), unread, undefined, { now: NOW })).toBeUndefined();
  });

  it('takes the subject’s own words', () => {
    const n = 31;
    const periods = days(n);
    const up = flatThen(n, 49, 49.3);
    const down = flatThen(n, 49, 48.7);
    // So many lira to the dollar: a high is the lira's low.
    expect(recordLine(up, periods, RATE_RECORD, { now: NOW })).toBe('Weakest in a month.');
    expect(recordLine(down, periods, RATE_RECORD, { now: NOW })).toBe('Strongest in a month.');
    // Dollars to the euro: the currency's own series.
    expect(recordLine(up, periods, CURRENCY_RECORD, { now: NOW })).toBe('Strongest in a month.');
    expect(recordLine(down, periods, TRAFFIC_RECORD, { now: NOW })).toBe(
      'Fewest ships in a month.',
    );
    expect(recordLine(up, periods, TRAFFIC_RECORD, { now: NOW })).toBe('Most ships in a month.');
  });
});

describe('the record on a card', () => {
  const labels = days(40);
  const indicator = (over: Partial<Indicator> & Pick<Indicator, 'id' | 'values'>): Indicator =>
    ({
      label: over.id,
      source: 'fred',
      sourceLabel: 'FRED',
      periods: labels,
      ...over,
    }) as Indicator;
  const snapshot = (indicators: Indicator[]): TrendsSnapshot => ({
    fetchedAt: '2026-10-10',
    asOf: '2026-10-10',
    indicators,
  });

  it('is a daily reading’s one caption sentence, and absent on an ordinary day', () => {
    const peak = indicator({
      id: 'us-10y',
      unit: '%',
      cadence: 'daily',
      values: flatThen(40, 5.1, 5.31),
    });
    expect(indicatorCard(snapshot([peak]), new Map(), [], 'us-10y', 'money')?.changed).toBe(
      'Highest in a month.',
    );
    const quiet = indicator({
      id: 'us-10y',
      unit: '%',
      cadence: 'daily',
      values: flatThen(40, 5.1, 5.1),
    });
    expect(
      indicatorCard(snapshot([quiet]), new Map(), [], 'us-10y', 'money')?.changed,
    ).toBeUndefined();
  });

  it('is in the currency’s own words, whichever way the currency is quoted', () => {
    const fx = (id: string, label: string, values: number[]) =>
      indicator({ id, label, source: 'oer', unit: 'X / USD', cadence: 'daily', values });
    // More lira to the dollar than on any day charted: the lira's low.
    const lira = fx('fx-try', 'Turkish lira', flatThen(40, 49, 49.3));
    expect(currencyCard(snapshot([lira]), new Map(), [], lira)?.changed).toBe(
      'Weakest in a month.',
    );
    // Fewer euros to the dollar is more dollars to the euro: the euro's high.
    const euro = fx('fx-eur', 'Euro', flatThen(40, 0.9, 0.89));
    expect(currencyCard(snapshot([euro]), new Map(), [], euro)?.changed).toBe(
      'Strongest in a month.',
    );
  });

  it('counts a strait’s ships on the unrounded averages, ending on the published one', () => {
    const strait = (total: number[], last7: number): Chokepoint => ({
      id: 'hormuz',
      name: 'Strait of Hormuz',
      blurb: 'A strait.',
      lat: 0,
      lng: 0,
      topicTags: [],
      primaryField: 'n_total',
      last7Avg: { n_total: last7 },
      baseline90Avg: { n_total: 20 },
      delta7vs90: { n_total: -0.5 },
      series: { periods: days(total.length), total },
      asOf: '2026-10-09',
    });
    // Forty days at 24 a day, then a week at 3: every average but the last is
    // above the published 3.0.
    const shut = strait([...Array.from({ length: 40 }, () => 24), 3, 3, 3, 3, 3, 3, 3], 3);
    expect(straitCardFor(shut, null, new Date(NOW))?.changed).toBe('Fewest ships in a month.');
    // Steady traffic: an average of 2.57 a day draws as 3 on every day, and a
    // published 2.7 is above it, not below a drawn 3.
    const steady = strait(
      Array.from({ length: 47 }, (_, i) => (i % 7 < 4 ? 3 : 2)),
      2.7,
    );
    expect(straitCardFor(steady, null, new Date(NOW))?.changed).toBe('Most ships in a month.');
    expect(straitCardFor(steady, null, new Date(NOW))?.series.values.slice(-3)).toEqual([
      3, 3, 2.7,
    ]);
  });
});
