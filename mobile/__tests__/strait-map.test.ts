import { straitMapChange, straitWeekChange } from '../lib/strait-map';
test('straits identify traffic direction and the baseline, not a market price window', () => {
  expect(straitMapChange(-0.45)).toEqual({
    direction: 'down',
    value: '↓45%',
    basis: 'vs 90d',
    label: '↓45% vs 90d',
  });
  expect(straitMapChange(0.42)).toMatchObject({ direction: 'up', label: '↑42% vs 90d' });
  expect(straitMapChange(0.001)).toMatchObject({ direction: 'flat', label: '−0% vs 90d' });
  expect(straitMapChange(undefined)).toBeNull();
  expect(straitMapChange(NaN)).toBeNull();
});

test('the one-line label is the two globe lines joined, so a row and the map agree', () => {
  const change = straitMapChange(-0.57);
  expect(change?.label).toBe(`${change?.value} ${change?.basis}`);
});

test('the globe prints the strip’s seven-day move, so one strait reads one number', () => {
  // The strip said ▼38% (the week) while the label said ↓62% vs 90d (the
  // normal), a few centimetres apart.
  const change = straitWeekChange({
    direction: 'down',
    magnitude: '38%',
    window: 'over 7 days',
    valence: 'unfavorable',
    size: 38,
  });
  expect(change).toMatchObject({ direction: 'down', value: '↓38%', basis: undefined, alarm: true });
  expect(straitWeekChange({ direction: 'up', magnitude: '5%', valence: 'neutral' })).toMatchObject({
    value: '↑5%',
    alarm: false,
  });
});
