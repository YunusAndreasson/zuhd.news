/**
 * Diagnostic: break the per-frame work into sub-steps so we can see where
 * the budget is actually going. Sum of sub-steps should ≈ full frame.
 * Run with `--filter breakdown` for a focused view.
 */

import { type GeoContext, geoOrthographic, geoPath } from 'd3-geo';
import {
  bordersMeshMedium,
  countries,
  countryCentroidPoints,
  iceSheets,
  landMedium,
  landSimplified,
} from '../../components/globe/shared';
import { bench } from '../bench-utils';

const noop: GeoContext = {
  beginPath() {},
  moveTo() {},
  lineTo() {},
  arc() {},
  closePath() {},
};

const focus = 'Germany';
const focusFeat = countries.features.find((f) => f.properties?.name === focus) ?? null;

function mkCtx() {
  const proj = geoOrthographic().scale(150).translate([150, 150]);
  const pg = geoPath().projection(proj).context(noop);
  proj.clipAngle(45).precision(0).rotate([-10, -50, 0]).scale(212).translate([150, 150]);
  return { proj, pg };
}

const ITER = 400;
const WARM = 50;

export const a = bench({
  name: 'breakdown.A.proj-setup-only',
  iterations: ITER,
  warmup: WARM,
  setup: mkCtx,
  run: ({ proj }) => {
    proj.clipAngle(45).precision(0).rotate([-10, -50, 0]).scale(212).translate([150, 150]);
  },
});

export const b = bench({
  name: 'breakdown.B.land-medium',
  iterations: ITER,
  warmup: WARM,
  setup: mkCtx,
  run: ({ pg }) => {
    pg(landMedium as never);
  },
});

export const c = bench({
  name: 'breakdown.C.land-simplified',
  iterations: ITER,
  warmup: WARM,
  setup: mkCtx,
  run: ({ pg }) => {
    pg(landSimplified as never);
  },
});

export const d = bench({
  name: 'breakdown.D.borders-mesh',
  iterations: ITER,
  warmup: WARM,
  setup: mkCtx,
  run: ({ pg }) => {
    pg(bordersMeshMedium as never);
  },
});

export const e = bench({
  name: 'breakdown.E.ice-sheets',
  iterations: ITER,
  warmup: WARM,
  setup: mkCtx,
  run: ({ pg }) => {
    pg(iceSheets);
  },
});

export const f = bench({
  name: 'breakdown.F.country-highlight',
  iterations: ITER,
  warmup: WARM,
  setup: mkCtx,
  run: ({ pg }) => {
    if (focusFeat) pg(focusFeat);
  },
});

export const g = bench({
  name: 'breakdown.G.30-centroids',
  iterations: ITER,
  warmup: WARM,
  setup: mkCtx,
  run: ({ proj }) => {
    for (let i = 0; i < 30; i++) {
      const pt = countryCentroidPoints[i];
      if (pt) proj(pt);
    }
  },
});

export default a;
