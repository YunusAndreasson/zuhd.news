#!/usr/bin/env node
// Fetch Natural Earth physical vectors and convert to TopoJSON under data/.
//
// Sources are the canonical Natural Earth CDN (CC0 public domain). We run
// everything through mapshaper to drop attributes we don't use and re-encode
// as TopoJSON with quantization.
//
// Current output:
//   data/lakes-50m.json     (~180 KB) — lakes + reservoirs with names; drawn
//                                        as bg-coloured holes, named ones labeled
//   data/rivers-50m.json    (~177 KB) — rivers + lake centerlines with names
//                                        and scalerank; pre-filtered at build
//                                        to scalerank ≤ 5 (ranks 6+ never
//                                        rendered or labeled at any zoom)
//   data/capitals-50m.json  (~11 KB)  — admin-0 capitals keyed by ISO-2, slim
//                                        {name,lat,lng} lookup
//   data/seas-50m.json      (~5 KB)   — regional seas/bays/gulfs (ranks ≤ 2,
//                                        oceans filtered), inner-visual-center
//                                        points as {name,lat,lng,rank,kind}
//
// `countries-50m.json` and `countries-110m.json` were originally copied
// from the `world-atlas` npm package (v2.0.2, Natural Earth 4.1.0). Each
// file already bundles a `land` object alongside the `countries` object
// sharing the same arc set, so country borders and the land silhouette
// stay perfectly aligned at any zoom. This script doesn't regenerate
// those — see https://github.com/topojson/world-atlas if/when we want
// to bump them.
//
// Usage:
//   node scripts/fetch-geo-vectors.mjs
//
// Requires: curl, unzip, npx (mapshaper is fetched on demand).

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const TMP_DIR = '/tmp/zuhd-ne-fetch';

const TOPOJSON_LAYERS = [
  {
    out: 'lakes-50m.json',
    url: 'https://naciscdn.org/naturalearth/50m/physical/ne_50m_lakes.zip',
    shp: 'ne_50m_lakes.shp',
    layer: 'lakes',
    fields: 'name',
  },
  {
    out: 'rivers-50m.json',
    url: 'https://naciscdn.org/naturalearth/50m/physical/ne_50m_rivers_lake_centerlines.zip',
    shp: 'ne_50m_rivers_lake_centerlines.shp',
    layer: 'rivers',
    fields: 'name,scalerank',
    // Drop ranks 6+ at build time. Both consumers (MiniGlobe via
    // detail-geo, LocationsBlock) hard-filter to scalerank<=5 at render
    // time, so high-rank tributaries are pure parse-and-discard cost.
    // Filtering here cuts the file ~36% (275 KB → 177 KB).
    filter: 'scalerank<=5',
  },
];

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function prepTmp() {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
}

function fetchTopojson({ out, url, shp, layer, fields, filter }) {
  console.log(`\n→ ${out}`);
  prepTmp();
  const zipPath = join(TMP_DIR, 'src.zip');
  run(`curl -sSL -o "${zipPath}" "${url}"`);
  run(`unzip -o -q "${zipPath}" -d "${TMP_DIR}"`);
  const outPath = join(TMP_DIR, out);
  const filterArg = filter ? `-filter '${filter}' ` : '';
  run(
    `npx --yes mapshaper "${join(TMP_DIR, shp)}" ${filterArg}-filter-fields ${fields} -rename-layers ${layer} -o format=topojson quantization=1e5 "${outPath}"`,
  );
  renameSync(outPath, join(DATA_DIR, out));
  console.log(`  ✓ wrote data/${out}`);
}

function fetchCapitals() {
  const out = 'capitals-50m.json';
  console.log(`\n→ ${out}`);
  prepTmp();
  const zipPath = join(TMP_DIR, 'capitals.zip');
  run(
    `curl -sSL -o "${zipPath}" "https://naciscdn.org/naturalearth/50m/cultural/ne_50m_populated_places_simple.zip"`,
  );
  run(`unzip -o -q "${zipPath}" -d "${TMP_DIR}"`);
  const jsonPath = join(TMP_DIR, 'capitals.json');
  run(
    `npx --yes mapshaper "${join(TMP_DIR, 'ne_50m_populated_places_simple.shp')}" -filter 'adm0cap===1' -filter-fields name,latitude,longitude,iso_a2 -o format=json "${jsonPath}"`,
  );
  const rows = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const lookup = {};
  for (const r of rows) {
    if (!r.iso_a2 || r.iso_a2 === '-99') continue;
    lookup[r.iso_a2] = { name: r.name, lat: r.latitude, lng: r.longitude };
  }
  writeFileSync(join(DATA_DIR, out), JSON.stringify(lookup));
  console.log(`  ✓ wrote data/${out} (${Object.keys(lookup).length} capitals)`);
}

function fetchSeas() {
  const out = 'seas-50m.json';
  console.log(`\n→ ${out}`);
  prepTmp();
  const zipPath = join(TMP_DIR, 'seas.zip');
  run(
    `curl -sSL -o "${zipPath}" "https://naciscdn.org/naturalearth/50m/physical/ne_50m_geography_marine_polys.zip"`,
  );
  run(`unzip -o -q "${zipPath}" -d "${TMP_DIR}"`);
  const geoPath = join(TMP_DIR, 'seas.geojson');
  // `-points inner` emits the inner-visual-center of each polygon — more
  // label-friendly than a bbox centroid for crescent-shaped seas.
  run(
    `npx --yes mapshaper "${join(TMP_DIR, 'ne_50m_geography_marine_polys.shp')}" -filter 'scalerank<=2 && featurecla!=="ocean"' -points inner -filter-fields name,scalerank,featurecla -o format=geojson "${geoPath}"`,
  );
  const g = JSON.parse(readFileSync(geoPath, 'utf8'));
  const rows = g.features.map((f) => ({
    name: f.properties.name,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    rank: f.properties.scalerank,
    kind: f.properties.featurecla,
  }));
  writeFileSync(join(DATA_DIR, out), JSON.stringify(rows));
  console.log(`  ✓ wrote data/${out} (${rows.length} seas)`);
}

for (const spec of TOPOJSON_LAYERS) fetchTopojson(spec);
fetchCapitals();
fetchSeas();
rmSync(TMP_DIR, { recursive: true, force: true });
