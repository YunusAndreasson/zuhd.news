import {
  isCurrentObservation,
  isIsoDate,
  observationDate,
  observationLabel,
  oldestObservation,
} from '../lib/data-freshness';

describe('data freshness', () => {
  it('validates real ISO calendar dates rather than merely parseable strings', () => {
    expect(isIsoDate('2026-09-01')).toBe(true);
    expect(isIsoDate('2026-09-01T08:15:00Z')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('Sep 1')).toBe(false);
  });

  it('only calls an observation current inside the three-day grace window', () => {
    const now = new Date('2026-09-01T12:00:00Z');
    expect(isCurrentObservation('2026-08-29', now)).toBe(true);
    expect(isCurrentObservation('2026-08-28', now)).toBe(false);
    expect(isCurrentObservation('2026-08-23', now)).toBe(false);
  });

  it('lets a source that publishes in arrears pass its own window', () => {
    const now = new Date('2026-09-01T12:00:00Z');
    expect(isCurrentObservation('2026-08-25', now, 10)).toBe(true);
    expect(isCurrentObservation('2026-08-22', now, 10)).toBe(true);
    expect(isCurrentObservation('2026-08-21', now, 10)).toBe(false);
  });

  it('labels the actual observation and uses the oldest input for derived data', () => {
    expect(observationLabel('2026-08-23')).toBe('data through Aug 23');
    // The card's kicker line prints the date alone; the phrase is the sheets'.
    expect(observationDate('2026-08-23')).toBe('Aug 23');
    expect(observationDate(undefined)).toBe('');
    expect(oldestObservation('2026-09-01', '2026-08-25')).toBe('2026-08-25');
  });
});
