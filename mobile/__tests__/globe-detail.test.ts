import {
  getLakeFillFeatureCollection,
  getLakeLabels,
  getMajorRiverFeatureCollection,
  LAKE_FILL_MIN_AREA,
} from '../components/globe/detail-geo';
import { CAPITALS } from '../components/globe/places';

const lakeNames = () =>
  new Set(
    getLakeFillFeatureCollection().features.map(
      (f) => (f.properties as { name?: string } | null)?.name,
    ),
  );

describe('the detail a resting globe carries', () => {
  it('names the capitals a reader looking at Mali or Australia expects', () => {
    const names = new Set(CAPITALS.map((c) => c.name));
    expect(names.has('Bamako')).toBe(true);
    expect(names.has('Canberra')).toBe(true);
    for (const c of CAPITALS) {
      expect(Math.hypot(...c.unit)).toBeCloseTo(1);
    }
  });

  it('fills the lakes a planet-scale view can resolve, Lake Chad included', () => {
    const names = lakeNames();
    for (const lake of ['Lake Chad', 'Lake Victoria', 'Lake Eyre North', 'Lago Titicaca']) {
      expect(names.has(lake)).toBe(true);
    }
    // And not every pond: the 50m set has 412 polygons.
    expect(getLakeFillFeatureCollection().features.length).toBeLessThan(200);
    expect(LAKE_FILL_MIN_AREA).toBeLessThan(3.2e-5);
  });

  it('names Lake Eyre once, as the whole lake', () => {
    const eyre = getLakeLabels().filter((l) => l.name.startsWith('Lake Eyre'));
    expect(eyre.map((l) => l.name)).toEqual(['Lake Eyre']);
    expect(eyre[0]?.area).toBeGreaterThan(2.5e-4);
  });

  it('draws the rivers a reader looking at Mali or Australia expects', () => {
    // The Niger, the Darling and the Murray are all rank 3 in Natural Earth,
    // which is why the resting globe draws the rank-3 set rather than a
    // lighter rank-2 one: rank 2 has the Nile and the Congo and not the Niger.
    const names = new Set(
      getMajorRiverFeatureCollection().features.map(
        (f) => (f.properties as { name?: string } | null)?.name,
      ),
    );
    for (const river of ['Niger', 'Darling', 'Murray', 'Nile']) {
      expect(names.has(river)).toBe(true);
    }
    const rankTwo = new Set(
      getMajorRiverFeatureCollection(2).features.map(
        (f) => (f.properties as { name?: string } | null)?.name,
      ),
    );
    expect(rankTwo.has('Niger')).toBe(false);
  });
});
