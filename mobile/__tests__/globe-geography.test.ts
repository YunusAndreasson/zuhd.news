import { geoArea, geoOrthographic, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { geographyTier, getGlobeGeography } from '../components/globe/geography';
import { decodeGeographyArc } from '../components/globe/geography-codec';

type CountryTopology = Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
const tiers = ['motion', 'overview', 'regional', 'detail'] as const;

function load(tier: (typeof tiers)[number]): CountryTopology {
  const packed = require(`../assets/geo/countries-${tier}.json`);
  return { ...packed, arcs: packed.arcs.map(decodeGeographyArc) };
}

function commands(geometry: GeoJSON.GeoJSON, lng: number, lat: number, scale: number) {
  const result: number[] = [];
  const projection = geoOrthographic()
    .rotate([-lng, -lat])
    .scale(scale)
    .clipAngle(30)
    .precision(0.25);
  geoPath(projection, {
    beginPath() {},
    moveTo(x, y) {
      result.push(0, x, y);
    },
    lineTo(x, y) {
      result.push(1, x, y);
    },
    closePath() {
      result.push(2);
    },
    arc() {},
  })(geometry);
  return result;
}

it('selects fine resting tiers and a lightweight motion tier', () => {
  expect([200, 500, 501, 2000, 2001, 8000].map((scale) => geographyTier(scale))).toEqual([
    'overview',
    'overview',
    'regional',
    'regional',
    'detail',
    'detail',
  ]);
  expect(geographyTier(1000, true)).toBe('motion');
});

it.each(tiers)('%s keeps country borders and highlight edges on the land topology', (tier) => {
  const topology = load(tier);
  const source = require('@shared/data/countries-10m.json');
  expect(topology.objects.countries.geometries.map((g) => g.id)).toEqual(
    source.objects.countries.geometries.map((g: { id: string }) => g.id),
  );
  const area = geoArea(feature(topology, topology.objects.land));
  expect(area).toBeGreaterThan(3);
  expect(area).toBeLessThan(4);
  expect(topology.transform).toEqual(source.transform);
  expect(topology.arcs).toHaveLength(source.arcs.length);
  const geography = getGlobeGeography(tier);
  expect(getGlobeGeography(tier)).toBe(geography);
  const countries = feature(topology, topology.objects.countries) as GeoJSON.FeatureCollection;
  for (const [lng, lat, name] of [
    [15, 50, 'Norway'],
    [140, 36, 'Japan'],
  ] as const) {
    const country = countries.features.find((f) => f.properties?.name === name)!;
    const scale = tier === 'overview' ? 400 : tier === 'regional' ? 1000 : 3000;
    const layers: [GeoJSON.GeoJSON, GeoJSON.GeoJSON][] = [
      [feature(topology, topology.objects.land), geography.land.visible(lng, lat, 30)],
      [
        mesh(topology, topology.objects.countries, (a, b) => a !== b),
        geography.borders.visible(lng, lat, 30),
      ],
      [country, geography.country(name)!.visible(lng, lat, 30)],
    ];
    for (const [full, culled] of layers) {
      expect(commands(culled, lng, lat, scale).join()).toBe(commands(full, lng, lat, scale).join());
    }
  }
});

it('preserves small islands absent from the old map', () => {
  const topology = load('overview');
  const countries = feature(topology, topology.objects.countries) as GeoJSON.FeatureCollection;
  const singapore = countries.features.find((f) => f.properties?.name === 'Singapore');
  expect(singapore).toBeDefined();
  expect(getGlobeGeography('overview').countryAt(103.82, 1.35)?.properties?.name).toBe('Singapore');
  expect(commands(singapore!, 104, 1, 3000).length).toBeGreaterThan(10);
});

it('keeps the polar and antimeridian land finite and correctly clipped', () => {
  for (const tier of ['overview', 'regional'] as const) {
    const topology = load(tier);
    const geography = getGlobeGeography(tier);
    for (const [lng, lat] of [
      [179.5, -17],
      [0, -82],
      [-180, 65],
    ]) {
      const full = commands(feature(topology, topology.objects.land), lng!, lat!, 400);
      const culled = commands(geography.land.visible(lng!, lat!, 30), lng!, lat!, 400);
      expect(culled.every(Number.isFinite)).toBe(true);
      expect(culled.join()).toBe(full.join());
    }
  }
});

it.each([
  ['overview', 0.001],
  ['regional', 0.00025],
  ['detail', 0.00006],
] as const)('%s stays within its source-coordinate simplification tolerance', (tier, tolerance) => {
  const source = require('@shared/data/countries-10m.json') as CountryTopology;
  const generated = load(tier);
  function units(arc: number[][]) {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx!;
      y += dy!;
      const lng =
        ((x * source.transform!.scale[0] + source.transform!.translate[0]) * Math.PI) / 180;
      const lat =
        ((y * source.transform!.scale[1] + source.transform!.translate[1]) * Math.PI) / 180;
      return [Math.cos(lat) * Math.cos(lng), Math.cos(lat) * Math.sin(lng), Math.sin(lat)];
    });
  }
  let maxError = 0;
  // Deterministic sample across the original shared arcs, including long coastlines.
  for (let index = 0; index < source.arcs.length; index += 97) {
    const original = units(source.arcs[index]!);
    const simplified = units(generated.arcs[index]!);
    for (let i = 0; i < original.length; i += Math.max(1, Math.floor(original.length / 50))) {
      const p = original[i]!;
      let nearest = Infinity;
      for (let j = 1; j < simplified.length; j++) {
        const a = simplified[j - 1]!;
        const b = simplified[j]!;
        const v = b.map((n, k) => n - a[k]!);
        const d = p.map((n, k) => n - a[k]!);
        const length2 = v.reduce((n, x) => n + x * x, 0);
        const t = length2
          ? Math.max(0, Math.min(1, d.reduce((n, x, k) => n + x * v[k]!, 0) / length2))
          : 0;
        nearest = Math.min(nearest, Math.hypot(...d.map((x, k) => x - t * v[k]!)));
      }
      maxError = Math.max(maxError, nearest);
    }
  }
  expect(maxError).toBeLessThanOrEqual(tolerance + 1e-12);
});
