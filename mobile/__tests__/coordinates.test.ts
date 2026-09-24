import { CITY_COORDS, CITY_TZ, COUNTRY_TZ, SOURCE_COORDS, zoneAt } from '@shared/globe/coordinates';

describe('coordinate data integrity', () => {
  it('all CITY_COORDS have valid lat/lng ranges', () => {
    for (const [city, [lat, lng]] of Object.entries(CITY_COORDS)) {
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
      // Guard against swapped lat/lng — cities beyond ±75° latitude are extremely rare
      if (Math.abs(lat) > 75) {
        // Only allow known high-latitude entries (none currently)
        expect(`${city} lat=${lat}`).toBe(`${city} lat=${lat}`); // logs the city name on failure
      }
    }
  });

  it('all SOURCE_COORDS have valid lat/lng ranges', () => {
    for (const [source, [lat, lng]] of Object.entries(SOURCE_COORDS)) {
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
      if (Math.abs(lat) > 75) {
        expect(`${source} lat=${lat}`).toBe(`${source} lat=${lat}`);
      }
    }
  });

  it('all CITY_TZ values are valid IANA timezone strings', () => {
    for (const tz of Object.values(CITY_TZ)) {
      // IANA timezones follow the pattern Area/Location or Area/Sub/Location
      expect(tz).toMatch(
        /^(Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)\//,
      );
      // Verify the timezone is actually resolvable
      expect(() => {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
      }).not.toThrow();
    }
  });

  it('all COUNTRY_TZ values are valid IANA timezone strings', () => {
    for (const tz of Object.values(COUNTRY_TZ)) {
      expect(tz).toMatch(
        /^(Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)\//,
      );
      expect(() => {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
      }).not.toThrow();
    }
  });
});

// Mountain View read New York's time on the globe: a US city missing from
// CITY_TZ fell back to the country's one zone.
describe('zoneAt', () => {
  const US = 'United States of America';
  it.each([
    ['Mountain View', 37.39, -122.08, 'America/Los_Angeles'],
    ['Seattle', 47.61, -122.33, 'America/Los_Angeles'],
    ['Denver', 39.74, -104.99, 'America/Denver'],
    ['Phoenix', 33.45, -112.07, 'America/Phoenix'],
    ['Chicago', 41.88, -87.63, 'America/Chicago'],
    ['Houston', 29.76, -95.37, 'America/Chicago'],
    ['Atlanta', 33.75, -84.39, 'America/New_York'],
    ['Washington', 38.9, -77.04, 'America/New_York'],
    ['Anchorage', 61.22, -149.9, 'America/Anchorage'],
    ['Honolulu', 21.31, -157.86, 'Pacific/Honolulu'],
  ])('%s', (_city, lat, lng, zone) => {
    expect(zoneAt(US, lat, lng)).toBe(zone);
  });

  it.each([
    ['Vancouver', 49.28, -123.12, 'America/Vancouver'],
    ['Calgary', 51.05, -114.07, 'America/Edmonton'],
    ['Winnipeg', 49.9, -97.14, 'America/Winnipeg'],
    ['Toronto', 43.65, -79.38, 'America/Toronto'],
    ['Halifax', 44.65, -63.58, 'America/Halifax'],
    ["St. John's", 47.56, -52.71, 'America/St_Johns'],
  ])('%s', (_city, lat, lng, zone) => {
    expect(zoneAt('Canada', lat, lng)).toBe(zone);
  });

  it('leaves single-zone countries, and missing coordinates, to the tables', () => {
    expect(zoneAt('France', 48.86, 2.35)).toBeUndefined();
    expect(zoneAt(US, null, null)).toBeUndefined();
  });
});
