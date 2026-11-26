import { clockChanged } from '../lib/clock-change';

it('distinguishes delayed callbacks from a changed clock', () => {
  const before = { wall: 100_000, elapsed: 20_000, offset: 60 };
  const delayed = { wall: 130_000, elapsed: 50_000, offset: 60 };
  expect(clockChanged(before, delayed)).toBe(false);
  expect(clockChanged(before, { ...delayed, wall: delayed.wall + 86_400_000 })).toBe(true);
  expect(clockChanged(before, { ...delayed, wall: delayed.wall - 86_400_000 })).toBe(true);
  expect(clockChanged(before, { ...delayed, offset: -180 })).toBe(true);
});
