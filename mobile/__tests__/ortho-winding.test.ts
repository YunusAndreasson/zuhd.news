import type * as D3Geo from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { decodeGeographyArc } from '../components/globe/geography-codec';
import { ringWoundOutward } from '../components/globe/ortho-stream';

// A layer asked d3 for every polygon's area to learn which way its outer ring
// turns. It answers from the unit vectors it already holds now, and asks d3
// only for a ring too thin to read. Count how often, so the test fails if the
// short path stops being the one taken — it would still pass by being d3.
jest.mock('d3-geo', () => {
  const actual = jest.requireActual<typeof D3Geo>('d3-geo');
  return { ...actual, geoArea: jest.fn(actual.geoArea) };
});
const { geoArea: askedOfD3 } = jest.requireMock<{ geoArea: jest.Mock }>('d3-geo');
const { geoArea, geoCircle } = jest.requireActual<typeof D3Geo>('d3-geo');

const TAU = 2 * Math.PI;

type CountryTopology = Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
function outerRings(tier: 'motion' | 'overview' | 'regional'): GeoJSON.Position[][] {
  const packed = require(`../assets/geo/countries-${tier}.json`);
  const topology: CountryTopology = { ...packed, arcs: packed.arcs.map(decodeGeographyArc) };
  const rings: GeoJSON.Position[][] = [];
  const take = (geometry: GeoJSON.Geometry | null) => {
    if (geometry?.type === 'Polygon') rings.push(geometry.coordinates[0]!);
    if (geometry?.type === 'MultiPolygon') for (const p of geometry.coordinates) rings.push(p[0]!);
  };
  const land = feature(topology, topology.objects.land) as unknown as GeoJSON.Feature;
  take(land.geometry);
  const countries = feature(topology, topology.objects.countries) as GeoJSON.FeatureCollection;
  for (const country of countries.features) take(country.geometry);
  return rings;
}

/** d3's reading: a ring it takes for the rest of the sphere. */
const d3Outward = (ring: GeoJSON.Position[]) =>
  geoArea({ type: 'Polygon', coordinates: [ring] }) > TAU;

describe('ringWoundOutward', () => {
  it.each(['motion', 'overview', 'regional'] as const)(
    'reads every %s ring the way d3 does, wound either way',
    (tier) => {
      const rings = outerRings(tier);
      expect(rings.length).toBeGreaterThan(500);
      askedOfD3.mockClear();
      let asked = 0;
      let disagreements = 0;
      for (const ring of rings) {
        for (const wound of [ring, [...ring].reverse()]) {
          const ours = ringWoundOutward(wound);
          // Null is a ring as wide as a hemisphere: the layer never culls it,
          // and never asks.
          if (ours === null) continue;
          asked++;
          if (ours !== d3Outward(wound)) disagreements++;
        }
      }
      expect(disagreements).toBe(0);
      expect(asked).toBeGreaterThan(rings.length);
      // Under 2% of rings are thin enough to be d3's to answer.
      expect(askedOfD3.mock.calls.length).toBeLessThan(asked * 0.02);
    },
  );

  it('reads circles of every size short of a hemisphere, anywhere on the sphere', () => {
    for (const [lng, lat] of [
      [0, 0],
      [179.9, 12],
      [-120, 89],
      [33, -88],
      [-75.5, 44.4],
    ] as const) {
      for (const radius of [0.01, 1, 20, 60, 85]) {
        const ring = geoCircle().center([lng, lat]).radius(radius)().coordinates[0]!;
        for (const wound of [ring, [...ring].reverse()]) {
          expect(ringWoundOutward(wound)).toBe(d3Outward(wound));
        }
      }
    }
  });

  it('leaves a ring with no area to d3', () => {
    const sliver: GeoJSON.Position[] = [
      [10, 10],
      [20, 10.0000001],
      [10, 10],
    ];
    askedOfD3.mockClear();
    expect(ringWoundOutward(sliver)).toBe(d3Outward(sliver));
    expect(askedOfD3).toHaveBeenCalledTimes(1);
  });
});
