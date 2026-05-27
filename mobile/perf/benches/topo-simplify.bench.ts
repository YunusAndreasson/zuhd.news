/**
 * Bench the one-time topology simplification done at module load in
 * `components/globe/shared.ts` (presimplify + two `simplify()` passes +
 * `feature()` extraction). Runs once per app boot — regression shows up
 * as cold-start lag, not per-frame jank, but it scales with topology
 * size so source swaps (e.g. 110m → 50m) catch here loudly.
 */

import countriesTopo from '@shared/data/countries-110m.json';
import { feature } from 'topojson-client';
import { presimplify, simplify } from 'topojson-simplify';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { bench } from '../bench-utils';

interface TopoWithObjects extends Topology {
  objects: Record<string, GeometryCollection>;
}

export default bench({
  name: 'topo.simplify-module-load',
  iterations: 40,
  warmup: 5,
  run: () => {
    const data = countriesTopo as unknown as TopoWithObjects;
    const obj = data.objects.countries;
    if (!obj) return;
    feature(data, obj);
    const pre = presimplify(data);
    const s50 = simplify(pre, 0.5) as unknown as TopoWithObjects;
    const s15 = simplify(pre, 0.15) as unknown as TopoWithObjects;
    const landS50 = s50.objects.land;
    const landS15 = s15.objects.land;
    if (landS50) feature(s50, landS50);
    if (landS15) feature(s15, landS15);
  },
});
