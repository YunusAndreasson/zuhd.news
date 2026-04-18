#!/usr/bin/env node
// Chokepoints snapshot fetcher for the mobile globe's ambient transit layer.
// Distinct from fetch-trends.js — this writes a single, small JSON consumed
// directly by the mobile client, not the editor Claude. Runs on the same
// systemd cadence as fetch-trends (stage 3.4 of run-cycle.sh).
//
// Output: content/.chokepoints.json
// Shape:  { generated, chokepoints: [{id, name, blurb, lat, lng, last7Avg,
//          baseline90Avg, delta7vs90, series, asOf, topicTags, primaryField}] }
//
// Best-effort: if PortWatch is unreachable the script logs and exits 0,
// leaving any previous .chokepoints.json intact (build.js skips the mirror
// when the file is absent, so a missing snapshot degrades gracefully).

import { writeFileSync } from 'fs'
import { join } from 'path'
import { CHOKEPOINT_BY_ID, CHOKEPOINT_CATALOG } from './lib/chokepoint-metadata.js'
import { fetchAllChokepointsSnapshot } from './lib/trends-sources/portwatch.js'

const ROOT = new URL('..', import.meta.url).pathname
const OUTPUT_PATH = join(ROOT, 'content', '.chokepoints.json')

const started = Date.now()
console.log('Fetching chokepoints snapshot (PortWatch)')

const rows = await fetchAllChokepointsSnapshot()
if (!rows || rows.length === 0) {
  console.error('  ✗ no chokepoint rows returned — leaving previous snapshot in place')
  process.exit(0)
}

const chokepoints = rows.map((r) => {
  const meta = CHOKEPOINT_BY_ID[r.id]
  return {
    id: r.id,
    name: meta.name,
    blurb: meta.blurb,
    lat: meta.lat,
    lng: meta.lng,
    topicTags: meta.topicTags,
    primaryField: meta.primaryField,
    last7Avg: r.last7Avg,
    baseline90Avg: r.baseline90Avg,
    delta7vs90: r.delta7vs90,
    series: r.series,
    asOf: r.asOf,
  }
})

const payload = {
  generated: new Date().toISOString(),
  chokepoints,
}

writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n')

const missing = CHOKEPOINT_CATALOG.length - chokepoints.length
const note = missing > 0 ? ` (${missing} missing)` : ''
console.log(
  `  ✓ wrote ${chokepoints.length}/${CHOKEPOINT_CATALOG.length} chokepoints${note} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
)
