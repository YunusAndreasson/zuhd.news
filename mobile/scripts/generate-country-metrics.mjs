/**
 * Bake each 110m country's spherical area and label centroid. Run with node.
 *
 * `components/globe/shared.ts` computed these at module load — `geoArea` over
 * every ring and, for a country in several parts, the area of each part to
 * pick the mainland for the label — on the JS thread before the globe's first
 * frame. Nothing in it depends on anything but the topology, so it is a file
 * now; `__tests__/country-metrics.test.ts` holds the file to what the code
 * would compute, so it cannot go stale without a test saying so.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { geoArea, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';

const topology = JSON.parse(
  readFileSync(new URL('../../shared/data/countries-110m.json', import.meta.url)),
);
const countries = feature(topology, topology.objects.countries);

/** The centroid of the largest part, so the label sits on the mainland. */
function labelCentroid(f) {
  const g = f.geometry;
  if (g?.type !== 'MultiPolygon' || g.coordinates.length <= 1) return geoCentroid(f);
  let bestArea = -Infinity;
  let bestPoly = null;
  for (const poly of g.coordinates) {
    const a = geoArea({ type: 'Polygon', coordinates: poly });
    if (a > bestArea) {
      bestArea = a;
      bestPoly = poly;
    }
  }
  return geoCentroid({ type: 'Polygon', coordinates: bestPoly });
}

const metrics = {};
for (const f of countries.features) {
  const name = f.properties?.name;
  if (!name) continue;
  const [lng, lat] = labelCentroid(f);
  metrics[name] = [geoArea(f), lng, lat];
}
const out = new URL('../assets/geo/country-metrics.json', import.meta.url);
writeFileSync(out, JSON.stringify(metrics));
console.log(`${Object.keys(metrics).length} countries -> ${out.pathname}`);
