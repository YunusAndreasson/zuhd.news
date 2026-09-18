import {
  type GeoPermissibleObjects,
  geoCircle,
  geoContains,
  geoOrthographic,
  geoPath,
} from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { decodeGeographyArc } from '../components/globe/geography-codec';
import { containsPoint, createOrthoLayer, type PathSink } from '../components/globe/ortho-stream';
import { orthoView } from '../components/globe/sphere-circles';
import { countries } from '../components/globe/shared';
import { reachFor, viewAngleFor } from '../lib/globe-camera';
import {
  bordersMeshFull,
  GRATICULE_LINES,
  iceSheets,
  landFull,
} from '../perf/fixtures/globe-geometry';

type Cmd = ['M' | 'L', number, number] | ['Z'];

const TX = 200;
const TY = 300;

/** Every path command d3 emits, in order. */
function d3Commands(
  object: GeoPermissibleObjects,
  lng: number,
  lat: number,
  k: number,
  clip: number,
  precision: number,
): Cmd[] {
  const out: Cmd[] = [];
  const proj = geoOrthographic()
    .clipAngle(clip)
    .precision(precision)
    .rotate([-lng, -lat, 0])
    .scale(k)
    .translate([TX, TY]);
  geoPath(proj, {
    beginPath() {},
    moveTo: (x, y) => out.push(['M', x, y]),
    lineTo: (x, y) => out.push(['L', x, y]),
    arc() {
      throw new Error('unexpected arc');
    },
    closePath: () => out.push(['Z']),
  })(object);
  return out;
}

function recorder(): { sink: PathSink; out: Cmd[] } {
  const out: Cmd[] = [];
  return {
    out,
    sink: {
      moveTo: (x, y) => out.push(['M', x, y]),
      lineTo: (x, y) => out.push(['L', x, y]),
      close: () => out.push(['Z']),
    },
  };
}

/** The first command that differs, described, or null when the two agree. */
function firstDifference(a: Cmd[], b: Cmd[], tolerance: number): string | null {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const p = a[i] as Cmd;
    const q = b[i] as Cmd;
    if (p[0] !== q[0]) return `command ${i}: ${p.join(',')} vs ${q.join(',')}`;
    if (p[0] === 'Z' || q[0] === 'Z') continue;
    if (Math.abs(p[1] - q[1]) > tolerance || Math.abs(p[2] - q[2]) > tolerance) {
      return `command ${i}: ${p.join(',')} vs ${q.join(',')}`;
    }
  }
  if (a.length !== b.length) return `length ${a.length} vs ${b.length}`;
  return null;
}

function expectSame(
  object: GeoPermissibleObjects,
  lng: number,
  lat: number,
  k: number,
  clip: number,
  precision: number,
  tolerance = 1e-6,
) {
  const layer = createOrthoLayer(object as GeoJSON.GeoJSON);
  const { sink, out } = recorder();
  layer.draw(orthoView(lng, lat, k, TX, TY), clip, precision, sink);
  const ref = d3Commands(object, lng, lat, k, clip, precision);
  const diff = firstDifference(out, ref, tolerance);
  if (diff) {
    throw new Error(
      `camera [${lng}, ${lat}] scale ${k} clip ${clip} precision ${precision}: ${diff}`,
    );
  }
  return out.length;
}

/** Deterministic pseudo-random cameras. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// Off round numbers: a graticule vertex exactly on the horizon is visible or
// not by the last bit of two different roundings, and nothing on screen
// depends on which.
const CAMERAS: [number, number][] = [
  [0.1, 0.2],
  [0.3, 81.7],
  [-0.2, -81.6],
  [-179.9, 10.1],
  [179.4, -29.3],
  [39.8, 21.4],
  [-0.13, 51.5],
  [100.2, 35.1],
  [-99.7, 40.4],
  [140.3, -24.6],
  [60.4, 59.6],
  [-59.6, -15.3],
];
{
  const rand = lcg(19);
  for (let i = 0; i < 10; i++) CAMERAS.push([rand() * 360 - 180, rand() * 164 - 82]);
}

type CountryTopology = Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
function loadTier(tier: 'motion' | 'overview' | 'regional'): CountryTopology {
  const packed = require(`../assets/geo/countries-${tier}.json`);
  return { ...packed, arcs: packed.arcs.map(decodeGeographyArc) };
}

describe('createOrthoLayer', () => {
  it('draws the 110m fixtures exactly as d3 does, at every clip and precision', () => {
    const layers: [string, GeoPermissibleObjects][] = [
      ['land', landFull],
      ['borders', bordersMeshFull],
      ['ice', iceSheets],
      ['countries', countries],
      ['graticule', GRATICULE_LINES],
    ];
    for (const [, layer] of layers) {
      for (const [lng, lat] of CAMERAS) {
        for (const clip of [90, 70, 47, 25, 10]) {
          for (const precision of [0, 0.25]) {
            const k = 300 / Math.sin((clip * Math.PI) / 180);
            expectSame(layer, lng, lat, k, clip, precision);
          }
        }
      }
    }
  });

  it('draws the tiers the globe draws, culled to the view', () => {
    for (const tier of ['motion', 'overview'] as const) {
      const topology = loadTier(tier);
      const land = feature(topology, topology.objects.land);
      const borders = mesh(topology, topology.objects.countries, (a, b) => a !== b);
      const countryFC = feature(topology, topology.objects.countries) as GeoJSON.FeatureCollection;
      const named = (n: string) =>
        countryFC.features.find((f) => f.properties?.name === n) as GeoJSON.Feature;
      const layers: GeoPermissibleObjects[] = [
        land,
        borders,
        named('Russia'),
        named('Norway'),
        named('Japan'),
        named('Kazakhstan'),
      ];
      const cameras = tier === 'motion' ? CAMERAS : CAMERAS.slice(0, 8);
      for (const layer of layers) {
        for (const [lng, lat] of cameras) {
          for (const clip of [90, 40, 25]) {
            const k = 180 / Math.sin((clip * Math.PI) / 180);
            for (const precision of [0, 0.25]) {
              expectSame(layer, lng, lat, k, clip, precision);
            }
          }
        }
      }
    }
  });

  it('fills the disc when the view lies inside a polygon, holes and all', () => {
    const topology = loadTier('overview');
    const land = feature(topology, topology.objects.land);
    // Zoomed past the screen: the clip is the view angle, well inside Eurasia
    // (Siberia), inside the Caspian (a hole in the land), and inside Africa.
    const k = 180 / Math.sin((10 * Math.PI) / 180);
    const clip = viewAngleFor(k, reachFor(TX, TY, 411, 700));
    expect(clip).toBeLessThan(90);
    for (const [lng, lat] of [
      [95, 62],
      [50.5, 42],
      [20, 5],
      [-100, 45],
      [135, -25],
    ] as [number, number][]) {
      for (const precision of [0, 0.25]) {
        const n = expectSame(land, lng, lat, k, clip, precision);
        expect(n).toBeGreaterThan(3);
      }
    }
  });

  it('handles rings that cross the limb many times and rings around a pole', () => {
    // Antarctica's ring runs along −90° and the antimeridian; the polar
    // circles cross the limb at most twice but sit around the poles.
    const arctic = geoCircle().center([0, 90]).radius(23.44)();
    const antarctic = geoCircle().center([0, -90]).radius(23.44)();
    const wide = geoCircle().center([20, 10]).radius(120)();
    for (const ring of [arctic, antarctic, wide]) {
      for (const [lng, lat] of CAMERAS) {
        for (const clip of [90, 60, 30]) {
          const k = 300 / Math.sin((clip * Math.PI) / 180);
          expectSame(ring, lng, lat, k, clip, 0.25);
        }
      }
    }
    for (const [lng, lat] of [
      [0, -82],
      [0, -90],
      [180, -70.5],
      [0, 90],
      [-180, 65],
    ] as [number, number][]) {
      for (const clip of [90, 45, 20]) {
        expectSame(iceSheets, lng, lat, 300 / Math.sin((clip * Math.PI) / 180), clip, 0.25);
      }
    }
  });

  it('cuts lines that dip through a small clip circle with both ends outside', () => {
    const line: GeoJSON.LineString = {
      type: 'LineString',
      coordinates: [
        [-40, 0],
        [40, 0],
        [40, 30],
        [-40, 30],
        [-40, 60],
        [40, 60],
      ],
    };
    const polygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-40, -5],
          [40, -5],
          [40, 5],
          [-40, 5],
          [-40, -5],
        ],
      ],
    };
    for (const [lng, lat] of [
      [0.1, 0.2],
      [0.3, 30.2],
      [-0.2, 45.3],
      [10.1, 15.2],
      [-30.4, 0.2],
    ] as [number, number][]) {
      for (const clip of [12, 20, 35]) {
        const k = 300 / Math.sin((clip * Math.PI) / 180);
        expectSame(line, lng, lat, k, clip, 0);
        expectSame(line, lng, lat, k, clip, 0.25);
        expectSame(polygon, lng, lat, k, clip, 0);
        expectSame(polygon, lng, lat, k, clip, 0.25);
      }
    }
  });

  it('answers containment as d3 does, holes, poles and backwards rings included', () => {
    const topology = loadTier('overview');
    const land = feature(
      topology,
      topology.objects.land,
    ) as unknown as GeoJSON.Feature<GeoJSON.MultiPolygon>;
    const polygons: GeoJSON.Polygon[] = land.geometry.coordinates.map((coordinates) => ({
      type: 'Polygon',
      coordinates,
    }));
    // Eurasia, with the Caspian as a hole, is the widest.
    polygons.sort((a, b) => b.coordinates[0]!.length - a.coordinates[0]!.length);
    polygons.push(geoCircle().center([20, 10]).radius(120)());
    polygons.push({
      type: 'Polygon',
      coordinates: [
        [
          [-40, -5],
          [40, -5],
          [40, 5],
          [-40, 5],
          [-40, -5],
        ],
      ],
    });
    const rand = lcg(5);
    const points: [number, number][] = [
      [50.5, 42],
      [95, 62],
      [0, -90],
      [0, 90],
      [-150, -40],
      [60, 40],
      [180, 0],
    ];
    for (let i = 0; i < 60; i++) points.push([rand() * 360 - 180, rand() * 180 - 90]);
    for (const polygon of polygons.slice(0, 12)) {
      for (const [lng, lat] of points) {
        expect(containsPoint(polygon, lng, lat)).toBe(geoContains(polygon, [lng, lat]));
      }
    }
  });

  it('culls the same parts the cap culler does and reuses its result', () => {
    const layer = createOrthoLayer(landFull as GeoJSON.GeoJSON);
    expect(layer.partCount).toBe(124);
    const view = layer.visible(-0.13, 51.5, 25) as GeoJSON.MultiPolygon;
    expect(view.coordinates.length).toBeLessThan(layer.partCount / 3);
    expect(layer.visible(0, 0, 30)).toBe(layer.visible(120, 40, 30));
  });

  it('draws the same thing again from the same layer', () => {
    const layer = createOrthoLayer(landFull as GeoJSON.GeoJSON);
    const first = recorder();
    layer.draw(orthoView(39.8, 21.4, 300, TX, TY), 90, 0.25, first.sink);
    const second = recorder();
    layer.draw(orthoView(39.8, 21.4, 300, TX, TY), 90, 0.25, second.sink);
    expect(second.out).toEqual(first.out);
    expect(first.out.length).toBeGreaterThan(1000);
  });
});
