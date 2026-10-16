import {
  periodPreposition,
  type ScrubSource,
  scrubReading,
  spokenScrubReading,
  stepIndex,
} from '../components/blocks/trend-readout';
import type { CardDelta } from '../lib/cards/types';

const up: CardDelta = { direction: 'up', magnitude: '3.1%', window: 'since' };
const brent: ScrubSource = {
  series: [{ label: 'Brent', values: [124.24, 124.16, 128.1] }],
  primaryValues: [124.24, 124.16, 128.1],
  periods: ['Sep 18', 'Sep 19', 'Sep 20'],
  unit: '$',
  moveSince: (i) => (i < 2 ? up : undefined),
};

it('reads a point at the precision its source publishes', () => {
  // At one decimal both days read 124.2: two different days, one number.
  expect(scrubReading(brent, 0)?.values).toEqual(['$124.24']);
  expect(scrubReading(brent, 1)?.values).toEqual(['$124.16']);
  expect(scrubReading(brent, 1)).toMatchObject({ period: 'Sep 19', move: up });
});

it('reads each series by name on a chart of several', () => {
  const two: ScrubSource = {
    series: [
      { label: 'Brent', values: [80, 82] },
      { label: 'WTI', values: [76, 78] },
    ],
    primaryValues: [80, 82],
    periods: ['Sep 1', 'Sep 2'],
  };
  expect(scrubReading(two, 1)?.values).toEqual(['Brent: 82', 'WTI: 78']);
});

it('has no move at the newest point, and no reading off the line', () => {
  expect(scrubReading(brent, 2)?.move).toBeUndefined();
  expect(scrubReading(brent, -1)).toBeNull();
  expect(scrubReading(brent, 3)).toBeNull();
});

it('says a reading as a sentence, a cited story included', () => {
  const reading = scrubReading(brent, 1);
  if (!reading) throw new Error('no reading');
  expect(spokenScrubReading(reading)).toBe('$124.16 on Sep 19, up 3.1% since');
  expect(spokenScrubReading(reading, { cited: true })).toBe(
    '$124.16 on Sep 19, up 3.1% since, a cited story',
  );
});

it('says a day "on" and a month, a year or a quarter "in"', () => {
  expect(periodPreposition('Sep 20')).toBe('on');
  expect(periodPreposition('Oct 2024')).toBe('in');
  expect(periodPreposition('2024')).toBe('in');
  expect(periodPreposition('Q3 2024')).toBe('in');
});

it('steps one point at a time and stops at either end', () => {
  expect(stepIndex(1, 'increment', 3)).toBe(2);
  expect(stepIndex(2, 'increment', 3)).toBe(2);
  expect(stepIndex(1, 'decrement', 3)).toBe(0);
  expect(stepIndex(0, 'decrement', 3)).toBe(0);
});
