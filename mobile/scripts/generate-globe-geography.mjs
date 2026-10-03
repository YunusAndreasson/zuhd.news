/** Generate shared-arc render tiers from Natural Earth 10m. Run with node. */
import { readFileSync, writeFileSync } from 'node:fs';
import { geoArea, geoBounds } from 'd3-geo';
import { feature, mergeArcs } from 'topojson-client';

const source = JSON.parse(
  readFileSync(new URL('../../shared/data/countries-10m.json', import.meta.url)),
);
// Quantization flipped a handful of subpixel island rings in the 10m
// source (Maldives). Normalize before merging land so they cannot fill the
// ocean, and do it again after simplifying to catch collapsed tiny rings.
function normalize(topology) {
  for (const country of topology.objects.countries.geometries) {
    const polygons = country.type === 'Polygon' ? [country.arcs] : country.arcs;
    for (const rings of polygons) {
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        const area = geoArea(feature(topology, { type: 'Polygon', arcs: [ring] }));
        if ((i === 0 && area > 2 * Math.PI) || (i > 0 && area < 2 * Math.PI)) {
          rings[i] = [...ring].reverse().map((arc) => ~arc);
        }
      }
    }
  }
  topology.objects.land = mergeArcs(topology, topology.objects.countries.geometries);
}
normalize(source);
const radians = Math.PI / 180;
const decoded = source.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    const lng = (x * source.transform.scale[0] + source.transform.translate[0]) * radians;
    const lat = (y * source.transform.scale[1] + source.transform.translate[1]) * radians;
    const c = Math.cos(lat);
    return { x, y, unit: [c * Math.cos(lng), c * Math.sin(lng), Math.sin(lat)] };
  });
});

// Ramer–Douglas–Peucker in unit-sphere XYZ. Orthographic projection cannot
// amplify this chord error beyond projectionScale * tolerance. Simplify each
// shared arc once, so land, borders and country fills always share vertices.
function simplifyArc(points, tolerance) {
  const keep = new Set([0, points.length - 1]);
  // Seed thirds before simplification: closed island arcs retain a valid ring
  // and every final segment is checked against the same error bound.
  if (points.length >= 4 && points[0].x === points.at(-1).x && points[0].y === points.at(-1).y) {
    keep.add(Math.floor((points.length - 1) / 3));
    keep.add(Math.floor(((points.length - 1) * 2) / 3));
  }
  const seeds = [...keep].sort((a, b) => a - b);
  const stack = seeds.slice(1).map((end, i) => [seeds[i], end]);
  while (stack.length) {
    const [start, end] = stack.pop();
    const a = points[start].unit;
    const b = points[end].unit;
    const v = b.map((n, i) => n - a[i]);
    const length2 = v.reduce((sum, n) => sum + n * n, 0);
    let furthest = -1;
    let maxError = tolerance * tolerance;
    for (let i = start + 1; i < end; i++) {
      const d = points[i].unit.map((n, j) => n - a[j]);
      const t = length2
        ? Math.max(0, Math.min(1, d.reduce((sum, n, j) => sum + n * v[j], 0) / length2))
        : 0;
      const error = d.reduce((sum, n, j) => sum + (n - t * v[j]) ** 2, 0);
      if (error > maxError) {
        maxError = error;
        furthest = i;
      }
    }
    if (furthest >= 0) {
      keep.add(furthest);
      stack.push([start, furthest], [furthest, end]);
    }
  }
  let x = 0;
  let y = 0;
  return [...keep]
    .sort((a, b) => a - b)
    .map((i) => {
      const p = points[i];
      const delta = [p.x - x, p.y - y];
      x = p.x;
      y = p.y;
      return delta;
    });
}

// Lossless polyline-style packing of the quantized deltas. Runtime decoding
// restores the original integers; no second quantization changes the coast.
function encodeArc(arc) {
  let result = '';
  for (const point of arc) {
    for (const delta of point) {
      let value = delta < 0 ? ~(delta << 1) : delta << 1;
      while (value >= 32) {
        result += String.fromCharCode((32 | (value & 31)) + 63);
        value >>>= 5;
      }
      result += String.fromCharCode(value + 63);
    }
  }
  return result;
}

// Each country's `geoBounds`, as `[west, south, east, north]` in degrees, in
// the order of `objects.countries.geometries`: the prefilter `countryAt` runs
// before `geoContains` (`components/globe/geography.ts`). Computed on the
// device it was d3's bounds stream over every vertex of every country, 57–59%
// of decoding a tier — 0.9 s of the regional tier on the emulator
// (2026-10-02), for a table that is a function of this file's output. Widened
// by a ten-thousandth of a degree and a step more, so rounding can only let a
// point through to `geoContains`, never keep one from it; west > east is a
// country across the antimeridian, as d3 has it. Null is a country this tier
// kept no polygon of.
const BOUNDS_STEP = 1e4;
function outward([[west, south], [east, north]]) {
  if (![west, south, east, north].every(Number.isFinite)) return null;
  const down = (v, min) => Math.max(min, (Math.floor(v * BOUNDS_STEP) - 1) / BOUNDS_STEP);
  const up = (v, max) => Math.min(max, (Math.ceil(v * BOUNDS_STEP) + 1) / BOUNDS_STEP);
  return [down(west, -180), down(south, -90), up(east, 180), up(north, 90)];
}

for (const [name, tolerance] of [
  ['motion', 0.01],
  ['overview', 0.001],
  ['regional', 0.00025],
  ['detail', 0.00006],
]) {
  const arcs = decoded.map((arc) => simplifyArc(arc, tolerance));
  const output = { ...source, objects: structuredClone(source.objects), arcs };
  if (name === 'motion') {
    for (const country of output.objects.countries.geometries) {
      const polygons = country.type === 'Polygon' ? [country.arcs] : country.arcs;
      const retained = polygons.filter((arcs) => {
        const area = geoArea(feature(output, { type: 'Polygon', arcs }));
        return Math.min(area, 4 * Math.PI - area) > 0.00001;
      });
      country.type = 'MultiPolygon';
      country.arcs = retained;
    }
  }
  normalize(output);
  const bounds = output.objects.countries.geometries.map((country) =>
    outward(geoBounds(feature(output, country))),
  );
  const json = JSON.stringify({ ...output, arcs: output.arcs.map(encodeArc), bounds });
  writeFileSync(new URL(`../assets/geo/countries-${name}.json`, import.meta.url), json);
  console.log(
    `${name}: ${arcs.reduce((n, arc) => n + arc.length, 0)} vertices, ${json.length} bytes`,
  );
}
