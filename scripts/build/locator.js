// The article's locator: a small globe beside the hook, turned to face where
// the story happened, with the place marked in gold.
//
// Drawn here, at build, as an inline SVG: no script, no request, and no
// layout shift, because the box is in the HTML. The projection is the share
// card's (`buildGlobe` in `lib/og-image.js`: orthographic, rotated to put the
// place at the centre) over the same 1:110m outlines (`getAssets`), but the
// whole hemisphere rather than the card's close crop, since the question here
// is "where in the world". Colour is classes (`.article-locator-*` in
// `style.css`), so the globe follows the reader's scheme.
//
// Small and cheap on purpose. At 112 units across, the 110m coast is a few
// thousand points the eye cannot tell from a few hundred, so the geometry is
// thinned on the sphere and again on the screen (about 5–7 KB an article,
// 2–3 KB compressed). And the build draws some eight hundred of these: a
// polygon wholly on the near side is projected point by point, one wholly on
// the far side is skipped, and only the few that cross the horizon go through
// d3's clip, which at full resolution cost sixty milliseconds a globe. A view
// is drawn once per half degree of centre and reused.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { geoContains, geoDistance, geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import { getAssets } from '../lib/og-image.js'
import { escHtml } from '../lib/html.js'
import { ROOT } from '../lib/paths.js'

/** The viewBox: the CSS sets the drawn size, 112px on a desktop, 84 on a phone. */
const SIZE = 112
const R = SIZE / 2 - 1
const C = SIZE / 2
/** On the sphere: a vertex nearer the last one kept than this is dropped (degrees). */
const THIN_DEG = 0.5
/** On the screen: the same, in viewBox units. */
const TOLERANCE = 1
/** A ring smaller than this (square units) is a speck: an islet at this scale. */
const MIN_AREA = 2
/** The view's centre is rounded to this, so nearby stories share one drawing. */
const CENTRE_STEP = 0.5

const DEG = 180 / Math.PI

/** A ring thinned on the sphere, longitude scaled by latitude. */
const thinRing = (ring) => {
  const kept = [ring[0]]
  for (let i = 1; i < ring.length - 1; i++) {
    const [x, y] = ring[i]
    const [qx, qy] = kept[kept.length - 1]
    if (Math.hypot((x - qx) * Math.cos(y / DEG), y - qy) >= THIN_DEG) kept.push(ring[i])
  }
  kept.push(ring[ring.length - 1])
  return kept.length >= 4 ? kept : ring
}

/**
 * A geometry as polygons ready to draw: thinned, with the cap that holds each
 * (its outer ring's mean direction, and the farthest vertex from it).
 */
const prepare = (geometry) => {
  const polys = geometry?.type === 'Polygon' ? [geometry.coordinates] : (geometry?.coordinates ?? [])
  return polys.map((rings) => {
    const thinned = rings.map(thinRing)
    let [sx, sy, sz] = [0, 0, 0]
    for (const [lng, lat] of thinned[0]) {
      const c = Math.cos(lat / DEG)
      sx += c * Math.cos(lng / DEG)
      sy += c * Math.sin(lng / DEG)
      sz += Math.sin(lat / DEG)
    }
    /** @type {[number, number]} */
    const centre = [Math.atan2(sy, sx) * DEG, Math.atan2(sz, Math.hypot(sx, sy)) * DEG]
    let cap = 0
    for (const p of thinned[0]) cap = Math.max(cap, geoDistance(centre, p) * DEG)
    return { geo: { type: 'Polygon', coordinates: thinned }, centre, cap }
  })
}

/**
 * Each polygon of a 1:50m country with its longitude and latitude box.
 * Natural Earth cuts a polygon at the antimeridian, so a polygon's naive box
 * holds even where its country's (Russia's) spans the world.
 */
const boxed = (geometry) => {
  const polys = geometry?.type === 'Polygon' ? [geometry.coordinates] : (geometry?.coordinates ?? [])
  return polys.map((coordinates) => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const [x, y] of coordinates[0] ?? []) {
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
    return { polygon: { type: 'Polygon', coordinates }, box: [x0, y0, x1, y1] }
  })
}

let assets = null
const load = () => {
  if (assets) return assets
  const { countries } = getAssets()
  const topo = JSON.parse(readFileSync(join(ROOT, 'shared', 'data', 'countries-110m.json'), 'utf8'))
  // `land` is a GeometryCollection, so `feature` gives a FeatureCollection.
  const land = /** @type {any} */ (feature(topo, topo.objects.land)).features.flatMap((f) => prepare(f.geometry))
  // Which country a place is in is asked of the 1:50m outlines, as a country
  // page's hazards are: at 1:110m a coastal town falls in the sea. The shape
  // drawn is the 110m one where it exists, which is most of the world.
  const topo50 = JSON.parse(readFileSync(join(ROOT, 'shared', 'data', 'countries-50m.json'), 'utf8'))
  const countries50 = /** @type {any} */ (feature(topo50, topo50.objects.countries)).features.map((f) => ({
    id: String(f.id ?? f.properties?.name),
    geometry: f.geometry,
    polygons: boxed(f.geometry),
  }))
  const shapes110 = new Map(countries.map((c) => [String(c.id ?? c.properties?.name), c.geometry]))
  assets = { land, countries50, shapes110, shapes: new Map(), views: new Map() }
  return assets
}

/** The 1:50m country a point stands in, asked only of polygons whose box holds it. */
const countryAt = (countries50, [lng, lat]) => {
  for (const country of countries50) {
    for (const { polygon, box } of country.polygons) {
      if (lng < box[0] || lng > box[2] || lat < box[1] || lat > box[3]) continue
      if (geoContains(polygon, [lng, lat])) return country
    }
  }
  return null
}

const areaOf = (pts) => {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1])
  }
  return Math.abs(a / 2)
}

const r1 = (n) => Math.round(n * 10) / 10
const num = (n) => {
  const s = String(r1(n))
  return s.startsWith('0.') ? s.slice(1) : s.startsWith('-0.') ? `-${s.slice(2)}` : s
}

/** Screen rings to a compact path: thinned, specks dropped, relative steps. */
const serialise = (rings) => {
  let d = ''
  for (const ring of rings) {
    if (ring.length < 3 || areaOf(ring) < MIN_AREA) continue
    const kept = [ring[0]]
    for (const p of ring.slice(1)) {
      const q = kept[kept.length - 1]
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= TOLERANCE) kept.push(p)
    }
    if (kept.length < 3) continue
    let [px, py] = [r1(kept[0][0]), r1(kept[0][1])]
    const start = `M${num(px)} ${num(py)}`
    const steps = []
    for (const p of kept.slice(1)) {
      const [x, y] = [r1(p[0]), r1(p[1])]
      const dx = r1(x - px)
      const dy = r1(y - py)
      if (dx || dy) steps.push(`${num(dx)}${dy < 0 ? '' : ' '}${num(dy)}`)
      ;[px, py] = [x, y]
    }
    // Tighter than a space: a minus sign separates two numbers on its own.
    d += `${start}l${steps.join(' ').replace(/ -/g, '-')}z`
  }
  return d
}

/** Polygons as one path: near ones projected directly, crossing ones clipped. */
const pathOf = (polygons, projection, centre) => {
  /** @type {Array<Array<[number, number]>>} */
  const rings = []
  let ring = null
  const ctx = {
    moveTo(x, y) {
      ring = [[x, y]]
      rings.push(ring)
    },
    lineTo(x, y) {
      ring?.push([x, y])
    },
    closePath() {
      ring = null
    },
    arc() {},
    beginPath() {},
  }
  const clipped = geoPath(projection, ctx)
  for (const { geo, centre: c, cap } of polygons) {
    const d = geoDistance(centre, c) * DEG
    if (d - cap > 90) continue
    if (d + cap < 89) {
      for (const r of geo.coordinates) rings.push(r.map((p) => projection(p)))
    } else {
      clipped(geo)
    }
  }
  return serialise(rings)
}

/**
 * The locator figure for an article at `lat`/`lng`, captioned with `place`,
 * or `''` where the article has no coordinates.
 *
 * @param {{ lat: unknown, lng: unknown, place: string }} at
 * @returns {string}
 */
export const locatorHtml = ({ lat, lng, place }) => {
  const la = Number(lat)
  const lo = Number(lng)
  if (lat == null || lng == null || !Number.isFinite(la) || !Number.isFinite(lo)) return ''
  const a = load()

  /** @type {[number, number]} */
  const centre = [Math.round(lo / CENTRE_STEP) * CENTRE_STEP, Math.round(la / CENTRE_STEP) * CENTRE_STEP]
  const key = centre.join(',')
  const projection = geoOrthographic()
    .rotate([-centre[0], -centre[1]])
    .scale(R)
    .translate([C, C])
    .clipAngle(90)
    // No adaptive resampling: the thinned edges are already about a unit long.
    .precision(0)
  if (!a.views.has(key)) a.views.set(key, pathOf(a.land, projection, centre))
  const landD = a.views.get(key)

  const home = countryAt(a.countries50, [lo, la])
  let homeD = ''
  if (home) {
    const homeKey = `${key}:${home.id}`
    if (!a.views.has(homeKey)) {
      if (!a.shapes.has(home.id)) a.shapes.set(home.id, prepare(a.shapes110.get(home.id) ?? home.geometry))
      a.views.set(homeKey, pathOf(a.shapes.get(home.id), projection, centre))
    }
    homeD = a.views.get(homeKey)
  }

  const [x, y] = projection([lo, la]).map(r1)
  const name = String(place || '').trim()
  const label = name ? `${name}, on a globe` : 'Where this happened, on a globe'
  return (
    '<figure class="article-locator">' +
    `<svg class="article-locator-globe" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="${escHtml(label)}">` +
    `<circle class="article-locator-sea" cx="${C}" cy="${C}" r="${R}"/>` +
    `<path class="article-locator-land" d="${landD}"/>` +
    (homeD ? `<path class="article-locator-home" d="${homeD}"/>` : '') +
    `<circle class="article-locator-ring" cx="${x}" cy="${y}" r="6.5"/>` +
    `<circle class="article-locator-dot" cx="${x}" cy="${y}" r="2.5"/>` +
    '</svg>' +
    (name ? `<figcaption class="article-locator-place">${escHtml(name)}</figcaption>` : '') +
    '</figure>'
  )
}
