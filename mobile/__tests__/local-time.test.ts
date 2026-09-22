import { formatLocalTime } from '../components/globe/projection';

// `formatLocalTime` keeps one Intl formatter per zone rather than calling
// `toLocaleTimeString`, which builds a new one each time (~9 ms on Android).
// The label must not change with it.
describe('formatLocalTime', () => {
  it('prints what toLocaleTimeString printed', () => {
    for (const tz of ['Asia/Kolkata', 'America/New_York', 'Europe/London', 'Asia/Riyadh']) {
      const expected = new Date().toLocaleTimeString('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
      });
      expect(formatLocalTime(tz)).toBe(expected);
    }
  });

  it('returns null for a zone the platform rejects, every time', () => {
    expect(formatLocalTime('Not/AZone')).toBeNull();
    expect(formatLocalTime('Not/AZone')).toBeNull();
  });
});
