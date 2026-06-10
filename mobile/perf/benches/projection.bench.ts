/**
 * Mirrors the per-frame projection work done inside
 * `components/globe/MiniGlobe.tsx` `callReproject` (lines 1235–1297) without
 * the Skia render side. Measures d3-geo's projection arithmetic — the
 * dominant JS-thread cost during globe rotation, where the 32ms budget bites.
 *
 * Uses a no-op `GeoContext`: `pg(feature)` still walks every coordinate and
 * projects each point through `proj`, but skips moveTo/lineTo allocations.
 * That isolates projection cost from rendering cost.
 */

import { type GeoContext, geoOrthographic, geoPath } from 'd3-geo';
import { clipAngleForCountry } from '../../components/globe/projection';
import {
  bordersMeshMedium,
  countries,
  countryCentroidPoints,
  iceSheets,
  landMedium,
} from '../../components/globe/shared';
import { bench } from '../bench-utils';

interface Ctx {
  proj: ReturnType<typeof geoOrthographic>;
  pg: ReturnType<typeof geoPath>;
  rotations: Array<readonly [number, number, string | null]>;
}

function noopContext(): GeoContext {
  return {
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    closePath() {},
  };
}

export default bench<Ctx>({
  name: 'projection.callReproject-frame',
  iterations: 400,
  warmup: 50,
  // Hard ceiling: half the 32ms JS-thread budget per frame
  // (MiniGlobe.tsx; mobile/CLAUDE.md). Leaves headroom for everything
  // else on the JS thread (gesture handling, React reconcile, etc).
  budgetP95Ms: 16,
  setup: () => {
    const proj = geoOrthographic().scale(150).translate([150, 150]);
    const pg = geoPath().projection(proj).context(noopContext());

    // Deterministic camera sweep — 60 frames spanning the globe so the
    // benchmark covers low-detail open-ocean frames and dense land frames.
    const sample: Array<readonly [number, number, string | null]> = [];
    const focus: Array<readonly [number, number, string | null]> = [
      [0, 0, null],
      [30, 30, 'Egypt'],
      [-100, 40, 'United States of America'],
      [100, 35, 'China'],
      [10, 50, 'Germany'],
      [-60, -15, 'Brazil'],
      [60, 60, 'Russia'],
      [140, -25, 'Australia'],
      [80, 22, 'India'],
      [40, 33, 'Iraq'],
    ];
    for (let i = 0; i < 60; i++) {
      const f = focus[i % focus.length] ?? focus[0];
      if (f) sample.push(f);
    }
    return { proj, pg, rotations: sample };
  },
  run: ({ proj, pg, rotations }) => {
    // One iteration = one frame. Touch every layer the live frame touches.
    const idx = (Math.random() * rotations.length) | 0;
    const r = rotations[idx];
    if (!r) return;
    const [lng, lat, country] = r;

    const clip = clipAngleForCountry(country);
    const scale = 150 / Math.sin((clip * Math.PI) / 180);

    proj.clipAngle(clip).precision(0).rotate([-lng, -lat, 0]).scale(scale).translate([150, 150]);

    // Land silhouette (settled frame uses landMedium per MiniGlobe.tsx:1316).
    pg(landMedium as never);
    // Country borders mesh (matches landMedium arcs at rest).
    pg(bordersMeshMedium as never);
    // Permanent ice sheets.
    pg(iceSheets);
    // Focused-country highlight — pick the first feature with a matching name.
    if (country) {
      const feat = countries.features.find((f) => f.properties?.name === country);
      if (feat) pg(feat);
    }
    // Centroid projection batch — ~30 labels' worth per frame.
    for (let i = 0; i < 30; i++) {
      const pt = countryCentroidPoints[i];
      if (pt) proj(pt);
    }
  },
});
