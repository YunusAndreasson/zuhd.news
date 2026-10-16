import { refreshFailedToast } from '../lib/refresh-toast';

const NOW = Date.parse('2026-10-16T18:00:00Z');
beforeEach(() => jest.useFakeTimers({ now: NOW }));
afterEach(() => jest.useRealTimers());

const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

it('names what failed, how old the stories on the screen are, and the retry', () => {
  expect(refreshFailedToast(true, hoursAgo(3))).toBe(
    'No connection · updated 3h ago · tap to try again',
  );
  expect(refreshFailedToast(false, hoursAgo(3))).toBe(
    'Could not refresh · updated 3h ago · tap to try again',
  );
});

it('leaves the age out when the screen holds no build, or one it cannot read', () => {
  expect(refreshFailedToast(true, null)).toBe('No connection · tap to try again');
  expect(refreshFailedToast(false, 'not a date')).toBe('Could not refresh · tap to try again');
});

it('leaves the age out when the stories are this minute’s', () => {
  expect(refreshFailedToast(true, new Date(NOW - 20_000).toISOString())).toBe(
    'No connection · tap to try again',
  );
});

it('dates stories more than a week old', () => {
  const said = refreshFailedToast(true, hoursAgo(24 * 9));
  expect(said).toMatch(/^No connection · updated .+ · tap to try again$/);
  expect(said).not.toContain('ago');
});
