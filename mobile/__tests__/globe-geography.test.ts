import { geoArea, geoBounds, geoContains, geoOrthographic, geoPath } from 'd3-geo';
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

// `countryAt` tests a point against each country's bounds before it asks
// `geoContains`. The bounds were d3's, computed on the device over every
// vertex of every country each time a tier was decoded; they are a table in
// the asset now, written by the generator. A table that falls behind the arcs
// it was computed from would keep points from the country they are in.
it.each(tiers)('%s carries bounds that hold every country as d3 bounds it', (tier) => {
  const topology = load(tier);
  const baked = (require(`../assets/geo/countries-${tier}.json`) as { bounds: unknown[] }).bounds;
  const countries = feature(topology, topology.objects.countries) as GeoJSON.FeatureCollection;
  expect(baked).toHaveLength(countries.features.length);
  // Widened outward, by rounding to 1e-4 of a degree and one step more.
  const slack = 2.5e-4;
  countries.features.forEach((country, i) => {
    const [[west, south], [east, north]] = geoBounds(country);
    const bbox = baked[i] as [number, number, number, number] | null;
    if (![west, south, east, north].every(Number.isFinite)) {
      expect(bbox).toBeNull();
      return;
    }
    expect(bbox).not.toBeNull();
    const [w, s, e, n] = bbox!;
    // The same side of the antimeridian as d3 has it.
    expect(w > e).toBe(west > east);
    for (const [ours, d3, sign] of [
      [w, west, -1],
      [s, south, -1],
      [e, east, 1],
      [n, north, 1],
    ] as const) {
      const widened = (ours - d3) * sign;
      expect(widened).toBeGreaterThanOrEqual(0);
      expect(widened).toBeLessThanOrEqual(slack);
    }
  });
});

it.each(['overview', 'regional'] as const)(
  '%s finds the country d3 finds, from the table and one country at a time',
  (tier) => {
    const topology = load(tier);
    const countries = feature(topology, topology.objects.countries) as GeoJSON.FeatureCollection;
    const bounds = countries.features.map((country) => geoBounds(country));
    // What `countryAt` was: d3's bounds, then d3's containment, first match.
    const d3CountryAt = (lng: number, lat: number) =>
      countries.features.find((country, i) => {
        const [[west, south], [east, north]] = bounds[i]!;
        const withinLng = west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
        return withinLng && lat >= south && lat <= north && geoContains(country, [lng, lat]);
      })?.properties?.name;
    const points: [number, number][] = [
      [103.82, 1.35],
      [179.5, -17],
      [-179.2, -16.6],
      [0, -82],
      [0, -90],
      [-180, 65],
      [179.9, 66.5],
      [-169.5, 65.5],
      [37.6, 55.75],
      [-76.5, 42.44],
      [28.2, -29.6],
      [12.45, 41.9],
      [-150, -40],
    ];
    let seed = 11;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 400; i++) points.push([rand() * 360 - 180, rand() * 180 - 90]);
    const geography = getGlobeGeography(tier);
    let onLand = 0;
    for (const [lng, lat] of points) {
      const found = geography.countryAt(lng, lat);
      expect(found?.properties?.name).toBe(d3CountryAt(lng, lat));
      if (found) {
        onLand++;
        // One object per country, whichever way it was reached.
        expect(geography.countryNamed(found.properties?.name as string)).toBe(found);
        expect(geography.countryAt(lng, lat)).toBe(found);
      }
    }
    expect(onLand).toBeGreaterThan(80);
  },
);

describe('a tier decoded in parts', () => {
  type Geography = typeof import('../components/globe/geography');
  type OrthoStream = typeof import('../components/globe/ortho-stream');
  /** A copy of the module nothing has read from yet, and a count of the layers it builds. */
  function fresh(run: (geography: Geography, layersBuilt: () => number) => void) {
    jest.isolateModules(() => {
      jest.doMock('../components/globe/ortho-stream', () => {
        const actual = jest.requireActual<OrthoStream>('../components/globe/ortho-stream');
        return { ...actual, createOrthoLayer: jest.fn(actual.createOrthoLayer) };
      });
      const { createOrthoLayer } = require('../components/globe/ortho-stream') as {
        createOrthoLayer: jest.Mock;
      };
      run(require('../components/globe/geography'), () => createOrthoLayer.mock.calls.length);
    });
    jest.dontMock('../components/globe/ortho-stream');
  }

  // `findCountry` asks the overview tier where each story is while the app
  // launches. It decoded the land, the borders and the ice to answer.
  it('answers a lookup without building a layer', () => {
    fresh((geography, layersBuilt) => {
      const overview = geography.getGlobeGeography('overview');
      expect(overview.countryAt(18.07, 59.33)?.properties?.name).toBe('Sweden');
      expect(overview.countryNamed('Japan')?.properties?.name).toBe('Japan');
      expect(layersBuilt()).toBe(0);
      expect(overview.land.partCount).toBeGreaterThan(100);
      expect(layersBuilt()).toBe(1);
      // The highlight is that country alone, not a pass over all of them.
      expect(overview.country('Japan')).toBe(overview.country('Japan'));
      expect(layersBuilt()).toBe(2);
    });
  });

  // The idle prefetch decodes a tier a stage per slot (`warmGlobeGeography`),
  // so no slot holds the whole of it.
  it('warms a stage a call, and says when there is nothing left', () => {
    fresh((geography, layersBuilt) => {
      const built: number[] = [];
      let calls = 0;
      while (!geography.warmGlobeGeography('motion')) {
        built.push(layersBuilt());
        calls++;
        expect(calls).toBeLessThan(10);
      }
      // The asset, its arcs, then one layer a stage: land, borders, ice.
      expect(built).toEqual([0, 0, 1, 2, 3]);
      expect(geography.warmGlobeGeography('motion')).toBe(true);
      // A frame reads what the stages built.
      const motion = geography.getGlobeGeography('motion');
      expect([motion.land, motion.borders, motion.ice].every((layer) => layer.partCount > 0)).toBe(
        true,
      );
      expect(layersBuilt()).toBe(3);
    });
  });

  it('lets a frame take what is left of a half-warmed tier at once', () => {
    fresh((geography, layersBuilt) => {
      expect(geography.warmGlobeGeography('motion')).toBe(false);
      const motion = geography.getGlobeGeography('motion');
      expect(motion.land.partCount).toBeGreaterThan(0);
      expect(motion.ice.partCount).toBeGreaterThan(0);
      expect(layersBuilt()).toBe(2);
      // The stages already read are no work, and the last one still runs.
      let calls = 0;
      while (!geography.warmGlobeGeography('motion')) calls++;
      expect(calls).toBe(4);
      expect(layersBuilt()).toBe(3);
    });
  });
});
