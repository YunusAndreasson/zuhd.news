// One-shot data edit: merge "Israel" into "Palestine" in the bundled
// Natural Earth TopoJSON (50m and 110m). Result: a single feature named
// "Palestine" covering the whole River-to-Sea territory; "Israel"
// is removed. Re-run safely — already-merged files become a no-op.
//
// Run: `node scripts/merge-palestine.mjs`

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeArcs } from 'topojson-client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FILES = [
  join(ROOT, 'shared/data/countries-110m.json'),
  join(ROOT, 'shared/data/countries-50m.json'),
];

function mergeOne(path) {
  const topo = JSON.parse(readFileSync(path, 'utf8'));
  const geoms = topo.objects.countries.geometries;

  const israel = geoms.filter((g) => g.properties?.name === 'Israel');
  const palestine = geoms.filter((g) => g.properties?.name === 'Palestine');

  if (israel.length === 0) {
    console.log(`${path}: already merged (no Israel feature) — skipping`);
    return;
  }

  // mergeArcs takes the original topology + geometries to dissolve, and
  // returns a single geometry whose arcs are the union of the inputs with
  // shared boundaries (the Green Line) removed.
  const merged = mergeArcs(topo, [...israel, ...palestine]);
  merged.properties = { name: 'Palestine' };

  // Replace: drop Israel + Palestine, append the merged result.
  topo.objects.countries.geometries = [
    ...geoms.filter(
      (g) => g.properties?.name !== 'Israel' && g.properties?.name !== 'Palestine',
    ),
    merged,
  ];

  writeFileSync(path, JSON.stringify(topo));
  console.log(
    `${path}: merged ${israel.length} Israel + ${palestine.length} Palestine → 1 Palestine`,
  );
}

for (const f of FILES) mergeOne(f);
