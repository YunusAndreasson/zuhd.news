import { awayBucket, heardPct, isReadMilestone, utcDay } from '../lib/analytics-buckets';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('awayBucket', () => {
  it.each([
    [5 * MINUTE + 1, '5m-1h'],
    [HOUR - 1, '5m-1h'],
    [HOUR, '1-6h'],
    [6 * HOUR - 1, '1-6h'],
    [6 * HOUR, '6-24h'],
    [24 * HOUR - 1, '6-24h'],
    [24 * HOUR, '1d+'],
    [30 * 24 * HOUR, '1d+'],
  ])('%d ms away is %s', (ms, bucket) => {
    expect(awayBucket(ms)).toBe(bucket);
  });
});

describe('heardPct', () => {
  it.each([
    [0, 600, 0],
    [149, 600, 0],
    [150, 600, 25],
    [299, 600, 25],
    [300, 600, 50],
    [450, 600, 75],
    [600, 600, 75],
    [700, 600, 75],
  ])('%d s of %d is %d', (heard, total, pct) => {
    expect(heardPct(heard, total)).toBe(pct);
  });

  it('an unknown length, or nothing heard, is 0', () => {
    expect(heardPct(120, 0)).toBe(0);
    expect(heardPct(120, Number.NaN)).toBe(0);
    expect(heardPct(Number.NaN, 600)).toBe(0);
  });
});

describe('utcDay', () => {
  it('is the UTC calendar day, whatever the local one', () => {
    expect(utcDay(Date.UTC(2026, 10, 21, 23, 59))).toBe('2026-11-21');
    expect(utcDay(Date.UTC(2026, 10, 22, 0, 0))).toBe('2026-11-22');
  });
});

describe('isReadMilestone', () => {
  it('is the 1st, 3rd and 10th story, and no other', () => {
    const counts = Array.from({ length: 30 }, (_, i) => i + 1).filter(isReadMilestone);
    expect(counts).toEqual([1, 3, 10]);
  });
});
