/**
 * Conflict-event marker cull + project, sized to realistic event counts.
 * MiniGlobe.tsx:1675 narrates "this loop sees ~40 events", but feed
 * intensity varies — bench at 40 and 200 so we know both ends.
 *
 * Two variants:
 *   A. geoDistance cull (current — haversine, ~5 trig ops per event)
 *   B. dot-product cull on precomputed unit vectors (same optimization
 *      already applied to country centroids in shared.ts:166)
 */

import { type GeoContext, geoDistance, geoOrthographic, geoPath } from 'd3-geo';
import { bench } from '../bench-utils';

const noop: GeoContext = {
  beginPath() {},
  moveTo() {},
  lineTo() {},
  arc() {},
  closePath() {},
};

// Pseudo-random but deterministic spread of events across the globe.
function makeEvents(n: number) {
  const out: Array<{ coords: [number, number]; unit: [number, number, number] }> = [];
  const DEG = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const lng = ((i * 137.508) % 360) - 180;
    const lat = ((i * 73.71) % 140) - 70;
    const latR = lat * DEG;
    const lngR = lng * DEG;
    const cosLat = Math.cos(latR);
    out.push({
      coords: [lng, lat],
      unit: [cosLat * Math.cos(lngR), cosLat * Math.sin(lngR), Math.sin(latR)],
    });
  }
  return out;
}

function mkCtx(n: number) {
  const proj = geoOrthographic().scale(150).translate([150, 150]);
  proj.clipAngle(45).precision(0).rotate([-10, -50, 0]).scale(212).translate([150, 150]);
  geoPath().projection(proj).context(noop);
  const events = makeEvents(n);
  const cameraCoords: [number, number] = [10, 50];
  const DEG = Math.PI / 180;
  const camLatR = cameraCoords[1] * DEG;
  const camLngR = cameraCoords[0] * DEG;
  const cosCam = Math.cos(camLatR);
  const camUnit: [number, number, number] = [
    cosCam * Math.cos(camLngR),
    cosCam * Math.sin(camLngR),
    Math.sin(camLatR),
  ];
  const clipRad = 45 * DEG;
  const clipCos = Math.cos(clipRad);
  return { proj, events, cameraCoords, camUnit, clipRad, clipCos };
}

const ITER = 600;
const WARM = 50;

export const a40 = bench({
  name: 'conflict.40-events-geoDistance',
  iterations: ITER,
  warmup: WARM,
  setup: () => mkCtx(40),
  run: ({ proj, events, cameraCoords, clipRad }) => {
    for (const e of events) {
      if (geoDistance(e.coords, cameraCoords) >= clipRad) continue;
      proj(e.coords);
    }
  },
});

export const b40 = bench({
  name: 'conflict.40-events-dotProduct',
  iterations: ITER,
  warmup: WARM,
  setup: () => mkCtx(40),
  run: ({ proj, events, camUnit, clipCos }) => {
    for (const e of events) {
      if (e.unit[0] * camUnit[0] + e.unit[1] * camUnit[1] + e.unit[2] * camUnit[2] <= clipCos) {
        continue;
      }
      proj(e.coords);
    }
  },
});

export const a200 = bench({
  name: 'conflict.200-events-geoDistance',
  iterations: ITER,
  warmup: WARM,
  setup: () => mkCtx(200),
  run: ({ proj, events, cameraCoords, clipRad }) => {
    for (const e of events) {
      if (geoDistance(e.coords, cameraCoords) >= clipRad) continue;
      proj(e.coords);
    }
  },
});

export const b200 = bench({
  name: 'conflict.200-events-dotProduct',
  iterations: ITER,
  warmup: WARM,
  setup: () => mkCtx(200),
  run: ({ proj, events, camUnit, clipCos }) => {
    for (const e of events) {
      if (e.unit[0] * camUnit[0] + e.unit[1] * camUnit[1] + e.unit[2] * camUnit[2] <= clipCos) {
        continue;
      }
      proj(e.coords);
    }
  },
});

export default a40;
