import { REPEAT_FAILURE_MS, recoveryFor } from '../lib/error-recovery';

it('offers to try again after a first failure', () => {
  expect(recoveryFor(null, 1_000)).toBe('retry');
});

it('offers a reload when trying again failed the same way', () => {
  const resetAt = 50_000;
  expect(recoveryFor(resetAt, resetAt + 3_000)).toBe('reload');
  expect(recoveryFor(resetAt, resetAt + REPEAT_FAILURE_MS - 1)).toBe('reload');
});

it('treats a failure long after the last try as a new one', () => {
  const resetAt = 50_000;
  expect(recoveryFor(resetAt, resetAt + REPEAT_FAILURE_MS)).toBe('retry');
  expect(recoveryFor(resetAt, resetAt + 60_000)).toBe('retry');
});
