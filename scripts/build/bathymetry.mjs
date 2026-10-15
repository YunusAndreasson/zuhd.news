// Writes `shared/data/bathymetry-10m.geojson`: the sea floor's depth bands,
// from Natural Earth 1:10m, simplified for the map. Run by hand and checked
// in, like the glyphs: `node scripts/build/bathymetry.mjs`.
//
// Each Natural Earth band is the area deeper than its depth, so the bands nest:
// 6000 inside 4000 inside 2000. Four of the twelve are kept: the shelf edge,
// the ridges, the abyss and the trenches. Each band the map paints is a pass
// over the sea, and a fifth cost frames on a drag for a slope too thin to read
// (`DEPTH_TONES` in `_map/style.ts`). Natural Earth is public domain.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { simplifyRing } from './basemap.js'
import { ROOT } from '../lib/paths.js'

/** natural-earth-vector at a fixed commit, so a rerun writes the same file. */
const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson'
const BANDS = [
  ['K_200', 200],
  ['I_2000', 2000],
  ['G_4000', 4000],
  ['E_6000', 6000],
]
/**
 * Degrees. About 5.5 km, two pixels at zoom 5 where the tiles stop: a depth
 * band is a ground under the coast, never an edge anyone reads closely.
 */
const TOLERANCE = 0.05
/** Square degrees, about 1,200 km² at the equator: a seamount or a hole too small to read. */
const MIN_AREA = 0.1

const area = (ring) => {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return Math.abs(a / 2)
}
const r2 = (n) => Math.round(n * 100) / 100

const features = []
let before = 0
let after = 0
for (const [file, d] of BANDS) {
  const res = await fetch(`${SOURCE}/ne_10m_bathymetry_${file}.geojson`)
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  const fc = await res.json()
  const polygons = []
  for (const f of fc.features) {
    const g = f.geometry
    for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
      const rings = []
      for (const [i, ring] of poly.entries()) {
        before += ring.length
        const thin = simplifyRing(ring, TOLERANCE).map(([x, y]) => [r2(x), r2(y)])
        // An outer ring too small to see takes its holes with it.
        if (thin.length < 4 || area(thin) < MIN_AREA) {
          if (i === 0) break
          continue
        }
        rings.push(thin)
        after += thin.length
      }
      if (rings.length) polygons.push(rings)
    }
  }
  features.push({ type: 'Feature', properties: { d }, geometry: { type: 'MultiPolygon', coordinates: polygons } })
  console.log(`${file}: ${polygons.length} polygons`)
}

const out = join(ROOT, 'shared', 'data', 'bathymetry-10m.geojson')
writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }))
console.log(`${before} vertices to ${after}, written to ${out}`)
