import { getGlobeGeography } from '../components/globe/geography';
import { countryOfPlace, findCountry } from '../components/globe/projection';

// The globe asks where every story is again on each arrival and each return
// to the app. A place's country is the polygon walk's answer, and is walked
// for once.
describe('countryOfPlace', () => {
  const places: [number, number, string | null][] = [
    [30.05, 31.25, null], // Cairo
    [40.71, -74.0, null], // New York harbour, by a nudge
    [1.35, 103.82, null], // Singapore
    [0, 0, null], // open ocean: no country
    [31.5, 34.47, 'Gaza'], // named by an override
    [31.5, 34.47, null], // the same point, unnamed
  ];

  it('answers as findCountry does, with the same object', () => {
    for (const [lat, lng, location] of places) {
      expect(countryOfPlace(lat, lng, location)).toBe(findCountry(lat, lng, location));
    }
  });

  it('walks the polygons for a place once', () => {
    const countryAt = jest.spyOn(getGlobeGeography('overview'), 'countryAt');
    try {
      const first = countryOfPlace(59.33, 18.07);
      expect(first?.properties?.name).toBe('Sweden');
      const asked = countryAt.mock.calls.length;
      expect(asked).toBeGreaterThan(0);
      expect(countryOfPlace(59.33, 18.07)).toBe(first);
      // No country is an answer too, and is not asked for twice.
      expect(countryOfPlace(-48, -120)).toBeNull();
      const afterOcean = countryAt.mock.calls.length;
      expect(countryOfPlace(-48, -120)).toBeNull();
      expect(countryAt.mock.calls.length).toBe(afterOcean);
      expect(afterOcean).toBeGreaterThan(asked);
    } finally {
      countryAt.mockRestore();
    }
  });

  // A place named by an override is not the point it stands on.
  it('keeps a named place apart from the same point unnamed', () => {
    expect(countryOfPlace(55.75, 37.62, 'Jenin')?.properties?.name).toBe('Palestine');
    expect(countryOfPlace(55.75, 37.62)?.properties?.name).toBe('Russia');
    expect(countryOfPlace(55.75, 37.62, 'JENIN')?.properties?.name).toBe('Palestine');
  });
});
