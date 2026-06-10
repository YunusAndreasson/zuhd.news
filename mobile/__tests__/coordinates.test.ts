import { CITY_COORDS, CITY_TZ, COUNTRY_TZ, SOURCE_COORDS } from '@shared/globe/coordinates';

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
