import { geoArea } from 'd3-geo';
import baked from '../assets/geo/country-metrics.json';
import {
  countries,
  countryAreas,
  countryCentroids,
  countryLabelCentroid,
} from '../components/globe/shared';

const metrics = baked as unknown as Record<string, [number, number, number]>;

// `scripts/generate-country-metrics.mjs` writes the file; this holds it to what
// `shared.ts` used to compute at launch, for every country in the topology.
describe('country-metrics.json', () => {
  it('carries every named country, and nothing else', () => {
    const names = countries.features.map((f) => f.properties?.name as string).filter(Boolean);
    expect(Object.keys(metrics).sort()).toEqual([...names].sort());
  });

  it('is the area and label centroid the code computes', () => {
    for (const f of countries.features) {
      const name = f.properties?.name as string | undefined;
      if (!name) continue;
      const m = metrics[name];
      expect(m).toBeDefined();
      if (!m) continue;
      expect(m[0]).toBeCloseTo(geoArea(f), 10);
      const [lng, lat] = countryLabelCentroid(f);
      expect(m[1]).toBeCloseTo(lng, 9);
      expect(m[2]).toBeCloseTo(lat, 9);
    }
  });

  it('is what shared.ts exposes', () => {
    expect(countryAreas.France).toBe(metrics.France?.[0]);
    expect(countryCentroids.France).toEqual([metrics.France?.[1], metrics.France?.[2]]);
    // The label sits on the mainland, not in the Bay of Biscay.
    expect(countryCentroids.France?.[0]).toBeGreaterThan(0);
    expect(countryCentroids.France?.[1]).toBeGreaterThan(44);
  });
});
