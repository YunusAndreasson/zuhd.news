/**
 * Historical comparison of full, medium, and simplified border meshes. The
 * app ships only the medium and simplified variants; the full mesh is built
 * locally here so benchmark coverage adds no startup work to production.
 */

import countriesTopo from '@shared/data/countries-110m.json';
import { type GeoContext, geoOrthographic, geoPath } from 'd3-geo';
import { mesh } from 'topojson-client';
import { presimplify, simplify } from 'topojson-simplify';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { bench } from '../bench-utils';

interface TopoWithObjects extends Topology {
  objects: Record<string, GeometryCollection>;
}

const noop: GeoContext = {
  beginPath() {},
  moveTo() {},
  lineTo() {},
  arc() {},
  closePath() {},
};

const topo = countriesTopo as unknown as TopoWithObjects;
const countriesFull = topo.objects.countries;
const pre = presimplify(topo);
const s50 = simplify(pre, 0.5) as unknown as TopoWithObjects;
const s15 = simplify(pre, 0.15) as unknown as TopoWithObjects;
const countries50 = s50.objects.countries;
const countries15 = s15.objects.countries;
if (!countriesFull || !countries50 || !countries15) throw new Error('missing countries topology');
const bordersFull = mesh(topo, countriesFull, (a, b) => a !== b);
const bordersSimp = mesh(s50, countries50, (a, b) => a !== b);
const bordersMed = mesh(s15, countries15, (a, b) => a !== b);

function mkPg() {
  const proj = geoOrthographic().scale(150).translate([150, 150]);
  proj.clipAngle(45).precision(0).rotate([-10, -50, 0]).scale(212).translate([150, 150]);
  return geoPath().projection(proj).context(noop);
}

const ITER = 400;
const WARM = 50;

export const full = bench({
  name: 'borders.full',
  iterations: ITER,
  warmup: WARM,
  setup: mkPg,
  run: (pg) => {
    pg(bordersFull as never);
  },
});

export const medium = bench({
  name: 'borders.medium-0.15',
  iterations: ITER,
  warmup: WARM,
  setup: mkPg,
  run: (pg) => {
    pg(bordersMed as never);
  },
});

export const simp = bench({
  name: 'borders.simplified-0.5',
  iterations: ITER,
  warmup: WARM,
  setup: mkPg,
  run: (pg) => {
    pg(bordersSimp as never);
  },
});

export default full;
