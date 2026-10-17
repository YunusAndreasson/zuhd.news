import { subsolarPoint } from '@shared/sun';
import { getSunPosition, invalidateSunCaches } from '../components/globe/projection';

// The globe's terminator, city lights and prayer lines all stand on one sun:
// the web's. A second approximation here put the terminator up to ~4° of
// longitude from the prayer lines solved against the first.
describe('getSunPosition', () => {
  afterEach(() => {
    jest.useRealTimers();
    invalidateSunCaches();
  });

  const at = (iso: string) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(iso));
    invalidateSunCaches();
    return getSunPosition();
  };

  it.each([
    '2026-03-20T12:00:00Z',
    '2026-06-21T03:30:00Z',
    '2026-11-03T18:45:00Z',
    '2026-12-21T23:59:00Z',
  ])('is the shared sun at %s', (iso) => {
    const [lng, lat] = at(iso);
    const sun = subsolarPoint(new Date(iso));
    expect(lng).toBe(sun.lng);
    expect(lat).toBe(sun.lat);
  });

  it('stands over the tropics at the solstices', () => {
    expect(at('2026-06-21T12:00:00Z')[1]).toBeCloseTo(23.44, 1);
    expect(at('2026-12-21T12:00:00Z')[1]).toBeCloseTo(-23.44, 1);
  });

  it('carries the equation of time: early November the sun runs ~16 minutes fast', () => {
    // At 12:00 UTC the sun has already crossed Greenwich and stands ~4° west of it.
    const [lng] = at('2026-11-03T12:00:00Z');
    expect(lng).toBeGreaterThan(-4.5);
    expect(lng).toBeLessThan(-3.5);
  });
});
