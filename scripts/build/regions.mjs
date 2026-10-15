// Writes `shared/data/regions-50m.geojson`: the land's physical names, ranges,
// deserts, plateaus, basins and plains, as label points. Run by hand and
// checked in, like the glyphs: `node scripts/build/regions.mjs`.
//
// From Natural Earth's 1:50m geography regions (public domain), edited:
//
// - Terrain only. Islands, capes and coasts are the coastline's to show, and
//   continents are not news. Peninsulas are out too: several are a country's
//   name again (India, Korea) and one is a claim (Crimea).
// - Nothing south of 60°S, where the names are the claims of the states that
//   drew them (Queen Maud Land, Marie Byrd Land).
// - Natural Earth's capitals and abbreviations are spelled out (`MTS.`,
//   `CORD.`), and `RENAME` fixes the rest by hand.
//
// Each point carries `tier` (1 at world view, 3 only close in, from Natural
// Earth's own label zoom) and `rot`, the angle of a long shape's axis, so a
// range's name runs along it.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../lib/paths.js'

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_50m_geography_regions_polys.geojson'

/** What each kept class is called on the map's data, by Natural Earth's `FEATURECLA`. */
const KINDS = {
  'Range/mtn': 'range',
  Desert: 'desert',
  Plateau: 'plateau',
  Basin: 'basin',
  Plain: 'plain',
  Geoarea: 'area',
  Delta: 'delta',
  Valley: 'valley',
  Lowland: 'plain',
  Tundra: 'plain',
  Foothills: 'range',
  Gorge: 'valley',
  Wetlands: 'plain',
}

/**
 * Names that are not the land's: a region filed as a desert (Punjab), a
 * state's name again (Alaska), a peninsula filed as a plateau, a name too
 * generic to place (Coastal Plain), and a Danish name inside what this map
 * calls Kalaallit Nunaat.
 */
const DROP = new Set([
  'PUNJAB',
  'ALASKA',
  'PENÍNSULA IBÉRICA',
  'COASTAL PLAIN',
  'CENTRAL LOWLAND',
  'Central Highlands',
  'KNUD RASMUSSEN LAND',
])

/** Spellings no rule can reach. */
const RENAME = {
  'CAUCASUS MTS.': 'Caucasus',
  'S. Nevada': 'Sierra Nevada',
  'CORDILLERA  REAL': 'Cordillera Real',
  'KARAKORAM RA.': 'Karakoram',
  'ELBURZ MTS.': 'Alborz',
  'APPENNINI': 'Apennines',
  'KJØLEN MOUNTAINS': 'Scandinavian Mountains',
  'RUB’ AL KHALI': 'Rub’ al Khali',
  'DESIERTO DE ATACAMA': 'Atacama Desert',
  'PLANALTO CENTRAL': 'Planalto Central',
  'PLANALTO DO MATO GROSSO': 'Planalto do Mato Grosso',
  'ALTI-PLANICIE MEXICANA': 'Mexican Plateau',
  'CHAÎNE ANNAMITIQUE': 'Annamite Range',
  'LES LAURENTIDES': 'Laurentians',
  'SIKHOTE-ALIN’ RANGE': 'Sikhote-Alin',
  'Sarïr Kalanshiyu ar Ramli al Kabi': 'Kalansho Sand Sea',
  'SUDD': 'Sudd',
  'Mesopotamia': 'Mesopotamia',
}

const ABBREV = [
  [/\bMTS?\.(?=\s|$)/gi, 'Mountains'],
  [/\bRA\.(?=\s|$)/gi, 'Range'],
  [/\bPLAT\.(?=\s|$)/gi, 'Plateau'],
  [/\bCORD\.(?=\s|$)/gi, 'Cordillera'],
]
const SMALL = new Set(['of', 'de', 'del', 'do', 'da', 'du', 'al', 'ar', 'the', 'n', 'oua'])

/** `GREAT RIFT VALLEY` to `Great Rift Valley`, then the abbreviations spelled out. */
const spell = (raw) => {
  if (RENAME[raw]) return RENAME[raw]
  let s = raw.replace(/\s+/g, ' ').trim()
  if (s === s.toUpperCase()) {
    s = s
      .toLowerCase()
      .split(' ')
      .map((w, i) =>
        i > 0 && SMALL.has(w) ? w : w.replace(/(^|[-’'])(\p{L})/gu, (_, p, c) => p + c.toUpperCase()),
      )
      .join(' ')
  }
  for (const [re, to] of ABBREV) s = s.replace(re, to)
  return s
}

/** Shoelace area and centroid of a ring, in degrees. */
const ringStats = (ring) => {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
    a += f
    cx += (ring[j][0] + ring[i][0]) * f
    cy += (ring[j][1] + ring[i][1]) * f
  }
  return { area: Math.abs(a / 2), at: a === 0 ? ring[0] : [cx / (3 * a), cy / (3 * a)] }
}

const inside = ([x, y], ring) => {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/**
 * Where a ring's name stands: its centroid, or where that falls outside a
 * bent shape (the Sahel, the Rift), the middle of the longest stretch of the
 * ring across the centroid's latitude.
 */
const labelPoint = (ring, at) => {
  if (inside(at, ring)) return at
  const y = at[1]
  const xs = []
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi)
  }
  xs.sort((a, b) => a - b)
  let best = null
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]]
  }
  return best ? [(best[0] + best[1]) / 2, y] : at
}

/**
 * The angle of a long ring's axis, in degrees clockwise as MapLibre's
 * `text-rotate` reads it, kept between -45 and 45 so a name never stands on
 * its end; 0 for a shape less than twice as long as it is wide.
 */
const axisAngle = (ring, [, lat0]) => {
  const k = Math.cos((lat0 * Math.PI) / 180)
  const pts = ring.map(([x, y]) => [x * k, y])
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2
    syy += (y - my) ** 2
    sxy += (x - mx) * (y - my)
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const tr = sxx + syy
  const det = sxx * syy - sxy * sxy
  const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  const l2 = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  if (l2 <= 0 || l1 / l2 < 4) return 0
  const deg = Math.round((-theta * 180) / Math.PI)
  return Math.max(-45, Math.min(45, deg))
}

const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`HTTP ${res.status}`)
const fc = await res.json()
const byName = new Map()
for (const f of fc.features) {
  const p = f.properties
  const kind = KINDS[p.FEATURECLA]
  if (!kind || DROP.has(p.NAME)) continue
  const g = f.geometry
  const rings = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((poly) => poly[0])
  const largest = rings.map((r) => ({ r, ...ringStats(r) })).sort((a, b) => b.area - a.area)[0]
  const at = labelPoint(largest.r, largest.at)
  if (at[1] < -60) continue
  const name = spell(p.NAME)
  const tier = p.MIN_LABEL <= 3 ? 1 : p.MIN_LABEL <= 4 ? 2 : 3
  const feature = {
    type: 'Feature',
    // Only a range or a valley runs along its axis: a desert or a plain
    // tilted to its outline reads as a mistake, not a shape.
    properties: { name, kind, tier, rot: kind === 'range' || kind === 'valley' ? axisAngle(largest.r, at) : 0 },
    geometry: { type: 'Point', coordinates: at.map((n) => Math.round(n * 100) / 100) },
  }
  // Natural Earth draws a few twice (the Rift, the Canadian Shield): one name,
  // at the larger shape.
  const seen = byName.get(name)
  if (!seen || largest.area > seen.area) byName.set(name, { feature, area: largest.area })
}

const features = [...byName.values()].map((v) => v.feature).sort((a, b) => a.properties.tier - b.properties.tier)
const out = join(ROOT, 'shared', 'data', 'regions-50m.geojson')
writeFileSync(out, `${JSON.stringify({ type: 'FeatureCollection', features })}\n`)
console.log(`${features.length} names written to ${out}`)
for (const f of features) console.log(`  ${f.properties.tier} ${f.properties.kind.padEnd(7)} ${String(f.properties.rot).padStart(4)}°  ${f.properties.name}`)
