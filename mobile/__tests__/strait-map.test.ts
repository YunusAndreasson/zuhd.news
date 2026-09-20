import { straitMapChange } from '../lib/strait-map';
test('straits identify traffic direction and the baseline, not a market price window', () => {
  expect(straitMapChange(-0.45)).toEqual({ direction: 'down', label: '↓45% vs 90d' });
  expect(straitMapChange(0.42)).toEqual({ direction: 'up', label: '↑42% vs 90d' });
  expect(straitMapChange(0.001)).toEqual({ direction: 'flat', label: '−0% vs 90d' });
  expect(straitMapChange(undefined)).toBeNull();
  expect(straitMapChange(NaN)).toBeNull();
});
