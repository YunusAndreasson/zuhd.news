import { type GeoPermissibleObjects, geoOrthographic, geoPath } from 'd3-geo';
import { createCapCuller } from '../components/globe/cap-cull';
import {
  ANTARCTIC_CIRCLE,
  ARCTIC_CIRCLE,
  GRATICULE_LINES,
  getNightCircles,
} from '../components/globe/projection';
import {
  bordersMeshMedium,
  bordersMeshSimplified,
  countries,
  iceSheets,
  landMedium,
  landSimplified,
} from '../components/globe/shared';

/** Every path command d3 emits, in order — the culled stream must match it exactly. */
function commands(object: GeoPermissibleObjects, lng: number, lat: number, clip: number) {
  const out: string[] = [];
  const proj = geoOrthographic()
    .clipAngle(clip)
    .precision(0)
    .rotate([-lng, -lat, 0])
    .scale(300 / Math.sin((clip * Math.PI) / 180))
    .translate([200, 200]);
  geoPath(proj, {
    beginPath() {},
    moveTo: (x, y) => out.push(`M${x},${y}`),
    lineTo: (x, y) => out.push(`L${x},${y}`),
    arc: (x, y, r) => out.push(`A${x},${y},${r}`),
    closePath: () => out.push('Z'),
  })(object);
  return out;
}

const CAMERAS: [number, number][] = [];
for (const lat of [-82, -45, 0, 30, 51.5, 82]) {
  for (const lng of [-180, -120, -60, -0.13, 39.8, 100, 179.5]) CAMERAS.push([lng, lat]);
}
const CLIPS = [10, 25, 47, 70, 90];

describe('createCapCuller', () => {
  const layers: [string, GeoPermissibleObjects][] = [
    ['landMedium', landMedium],
    ['landSimplified', landSimplified],
    ['iceSheets', iceSheets],
    ['bordersMeshMedium', bordersMeshMedium],
    ['bordersMeshSimplified', bordersMeshSimplified],
    ['every country', countries],
    ['arctic circle', ARCTIC_CIRCLE],
    ['antarctic circle', ANTARCTIC_CIRCLE],
    ['graticule', GRATICULE_LINES],
  ];

  it.each(layers)('%s: draws exactly what the full geometry draws', (_, layer) => {
    const culler = createCapCuller(layer as GeoJSON.GeoJSON);
    for (const [lng, lat] of CAMERAS) {
      for (const clip of CLIPS) {
        const full = commands(layer, lng, lat, clip);
        const culled = commands(culler.visible(lng, lat, clip), lng, lat, clip);
        expect(culled).toEqual(full);
      }
    }
  });

  it('drops most of the planet when the view is tight', () => {
    const culler = createCapCuller(landMedium);
    const view = culler.visible(-0.13, 51.5, 25) as GeoJSON.MultiPolygon;
    expect(culler.partCount).toBe(124);
    // London at 25°: Europe's neighbourhood and the continents whose caps
    // reach it, not the Pacific islands.
    expect(view.coordinates.length).toBeLessThan(culler.partCount / 3);
  });

  it('never culls a part wider than a hemisphere', () => {
    const band: GeoJSON.LineString = {
      type: 'LineString',
      coordinates: [
        [-170, 0],
        [-60, 0],
        [50, 0],
        [160, 0],
      ],
    };
    const culler = createCapCuller(band);
    expect((culler.visible(-15, -89, 10) as GeoJSON.MultiLineString).coordinates).toHaveLength(1);
  });

  it('culls whole meridians, which no hemisphere-sized cap can', () => {
    const culler = createCapCuller(GRATICULE_LINES);
    expect(culler.partCount).toBe(17);
    const view = culler.visible(-0.13, 51.5, 25) as GeoJSON.MultiLineString;
    // London at 25°: the 0° and ±30° meridians and the 30°N and 60°N
    // parallels can reach the view; the rest of the grid cannot.
    expect(view.coordinates.length).toBeLessThan(8);
  });

  it('reuses its output between calls', () => {
    const culler = createCapCuller(bordersMeshMedium);
    expect(culler.visible(0, 0, 30)).toBe(culler.visible(120, 40, 30));
  });
});

describe('getNightCircles', () => {
  it('returns the same polygons until the sun moves', () => {
    const a = getNightCircles(12, 4);
    expect(getNightCircles(12, 4)).toBe(a);
    const b = getNightCircles(12.25, 4);
    expect(b).not.toBe(a);
    expect(b.night.coordinates[0]?.length).toBeGreaterThan(10);
    expect(b.twilight.coordinates[0]?.[0]).not.toEqual(b.night.coordinates[0]?.[0]);
  });
});
