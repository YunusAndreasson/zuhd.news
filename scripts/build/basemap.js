// Natural Earth geometry, turned into the GeoJSON sources MapLibre draws.
//
// The map engine renders real cartography — filled countries, coastlines,
// borders and place labels — from data we host ourselves. No tile provider, no
// API key, no third-party request: the CSP stays `default-src 'none'`.
//
// This file used to also emit a quantized, delta-encoded coastline for the
// hand-rolled canvas map that MapLibre replaced. That encoder was still being
// imported by the SSG after the switch but never called, and the endpoint it
// fed (`/api/basemap.json`) had stopped being written — so it was deleted
// rather than left to look load-bearing.

import { readFileSync } from 'fs'
import { join } from 'path'
import { loadShared } from './shared-ts.js'

/**
 * Makes a ring's longitudes continuous across the antimeridian.
 *
 * Russia's main ring and Antarctica's coast are single rings that cross 180°,
 * so consecutive vertices jump from +179 to -179. A flat renderer joins those
 * literally and sweeps a band right across the map — the stripe that showed at
 * ~60-70°N. Carrying a ±360 offset keeps the ring continuous (Russia simply
 * runs past 180 to 190), which MapLibre renders correctly with world copies.
 */
export const unwrap = (ring) => {
  if (ring.length < 2) return ring
  let offset = 0
  const out = [ring[0]]
  for (let i = 1; i < ring.length; i++) {
    const prev = ring[i - 1][0] + offset
    let lng = ring[i][0] + offset
    if (lng - prev > 180) offset -= 360
    else if (prev - lng > 180) offset += 360
    lng = ring[i][0] + offset
    out.push([lng, ring[i][1]])
  }
  return out
}

/**
 * Closes a ring that encircles a pole.
 *
 * Antarctica's coastline is one ring that wraps the whole globe; with no
 * vertices at the pole itself there is no closed area to fill, so it renders as
 * nothing. Walking the ring out to -90 and back closes the shape.
 */
export const closePolar = (ring) => {
  if (ring.length < 4) return ring
  let mn = Infinity
  let mx = -Infinity
  let southmost = 90
  for (const [x, y] of ring) {
    if (x < mn) mn = x
    if (x > mx) mx = x
    if (y < southmost) southmost = y
  }
  if (mx - mn < 350 || southmost > -60) return ring
  // Drop the duplicate closing vertex before routing via the pole, or the ring
  // closes early and the added points form a separate degenerate sliver.
  const first = ring[0]
  const lastIdx = ring.length - 1
  const open =
    ring[lastIdx][0] === first[0] && ring[lastIdx][1] === first[1] ? ring.slice(0, -1) : ring
  const tail = open[open.length - 1]
  return [...open, [tail[0], -90], [first[0], -90], first]
}

/**
 * Douglas–Peucker on an open chain. Tolerance is in degrees.
 */
const simplifyChain = (pts, tol) => {
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    if (e - s < 2) continue
    const [x1, y1] = pts[s]
    const [x2, y2] = pts[e]
    const dx = x2 - x1
    const dy = y2 - y1
    const den = Math.hypot(dx, dy)
    let far = -1
    let best = tol
    for (let i = s + 1; i < e; i++) {
      const [x, y] = pts[i]
      const d =
        den === 0
          ? Math.hypot(x - x1, y - y1)
          : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / den
      if (d > best) {
        best = d
        far = i
      }
    }
    if (far > 0) {
      keep[far] = 1
      stack.push([s, far], [far, e])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/**
 * Simplifies a ring, closed or open.
 *
 * A closed ring starts and ends on the same vertex, so the line Douglas–Peucker
 * measures against has zero length and *every* point sits exactly on it — run
 * naively, the whole coastline collapses to two points and no error is raised.
 * Splitting at the vertex farthest from the start gives two open chains with
 * real baselines, which is what the algorithm expects.
 */
export const simplifyRing = (ring, tol) => {
  if (!tol || ring.length < 5) return ring
  const last = ring.length - 1
  const closed = ring[0][0] === ring[last][0] && ring[0][1] === ring[last][1]
  if (!closed) return simplifyChain(ring, tol)

  const open = ring.slice(0, -1)
  let far = 0
  let best = -1
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1])
    if (d > best) {
      best = d
      far = i
    }
  }
  const head = simplifyChain(open.slice(0, far + 1), tol)
  const tail = simplifyChain(open.slice(far), tol)
  const out = [...head, ...tail.slice(1)]
  out.push(out[0])
  // A ring that simplified below a triangle has no area left to draw.
  return out.length >= 4 ? out : ring
}

/** Rounds coordinates to ~11m, drops NE's redundant precision, and optionally
 *  thins vertices that carry no shape at the zooms the tier is used at. */
export const thin = (geometry, dp = 4, tol = 0) => {
  const r = (n) => Math.round(n * 10 ** dp) / 10 ** dp
  const ring = (pts) =>
    simplifyRing(closePolar(unwrap(pts)), tol).map(([x, y]) => [r(x), r(y)])
  const walk = (c, depth) => (depth === 0 ? ring(c) : c.map((x) => walk(x, depth - 1)))
  const depth = { Polygon: 1, MultiPolygon: 2, LineString: 0, MultiLineString: 1 }[geometry.type]
  return {
    type: geometry.type,
    coordinates: depth === undefined ? geometry.coordinates : walk(geometry.coordinates, depth),
  }
}

/**
 * One label point per country, at the centroid of its largest polygon.
 *
 * Labelling the polygon source directly makes MapLibre place a label per
 * *part* — Canada rendered twelve times, once per island. Picking the largest
 * ring also keeps France's label in France rather than out at an overseas
 * territory.
 */
async function countryLabelPoints(fc) {
  const { geoArea, geoCentroid } = await import('d3-geo')
  // Natural Earth ships cartographer's abbreviations ("Dem. Rep. Congo",
  // "W. Sahara", "Fr. S. Antarctic Lands") and some names a country no longer
  // uses for itself. The app has corrected these at its display layer for a
  // while; the map was still printing the raw ones.
  const { displayCountryName } = await loadShared('place-names.ts')
  return {
    type: 'FeatureCollection',
    features: fc.features
      .map((f) => {
        const polys =
          f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
        let best = null
        let bestArea = -1
        for (const poly of polys) {
          const area = geoArea({ type: 'Polygon', coordinates: poly })
          if (area > bestArea) {
            bestArea = area
            best = poly
          }
        }
        if (!best) return null
        const [lng, lat] = geoCentroid({ type: 'Polygon', coordinates: best })
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
        return {
          type: 'Feature',
          properties: {
            name: displayCountryName(f.properties?.name ?? '') ?? '',
            area: Math.round(bestArea * 1e6) / 1e6,
          },
          geometry: { type: 'Point', coordinates: [Math.round(lng * 1e3) / 1e3, Math.round(lat * 1e3) / 1e3] },
        }
      })
      .filter(Boolean),
  }
}

/**
 * Draws historic Palestine as one territory.
 *
 * Natural Earth splits the area into an "Israel" polygon and a "Palestine" one
 * covering only the West Bank and Gaza. This publication's cartography treats
 * historic Palestine as a whole — the same position the app already takes when
 * it routes Yafa, Hayfa and Al-Quds to Palestine, and when it prints those
 * cities under their own names. The basemap was the last surface still drawing
 * it the other way, so a story datelined Al-Quds sat inside a polygon labelled
 * Israel.
 *
 * `merge` works on the topology rather than on rendered rings, so the shared
 * arc between the two is dissolved rather than drawn twice — one outline, no
 * seam down the middle. Everything else about the feature (its label, its ISO2,
 * so its click target) follows from being one feature.
 */
const mergePalestine = (topo, merge) => {
  const geoms = topo.objects.countries.geometries
  const parts = geoms.filter((g) => g.properties?.name === 'Israel' || g.properties?.name === 'Palestine')
  if (parts.length < 2) return null
  return {
    type: 'Feature',
    properties: { name: 'Palestine' },
    geometry: merge(topo, parts),
  }
}

export async function buildMapSources(root) {
  const { feature, merge } = await import('topojson-client')
  // Natural Earth carries only a display name, but the country profile is
  // routed by ISO 3166-1 alpha-2 (`/api/country/{ISO2}.json`). Resolving it
  // here — with the same lookup the country pages are generated from, so the
  // two can never disagree — is what makes a land polygon clickable.
  const { codeFromTopojsonName } = await loadShared('countries/iso.ts')

  // ── Why the basemap is 1:50m and there is no coarse tier ──────────────────
  //
  // This used to ship 1:110m as a first-paint placeholder and swap up to 1:50m
  // once the camera zoomed past 3.2. The map opens at world fit — about zoom
  // 1.3 — so the default view, the one every reader sees and the only one most
  // of them ever see, was 110m and stayed there.
  //
  // 110m is not a rounded 50m. Its generalisation removes real geography:
  // whole inlets, peninsulas and islands are gone rather than approximated. For
  // as long as the borders were invisible that went unnoticed; the moment the
  // frontier line became readable, the coarseness was the thing it was drawing.
  //
  // So the placeholder is gone and the real basemap is fetched once. It is
  // ~540 KB gzipped, and it is genuinely once: `/basemap/*` is served
  // `max-age=86400, stale-while-revalidate=604800` and every URL carries the
  // build's content hash, so it is refetched only when the basemap itself
  // changes — a handful of times a year. Two fetches to end up in the same
  // place was the worse deal, and it cost a visible re-render on every load.
  //
  // 1:10m still waits for `ULTRA_ZOOM`. At world scale its extra vertices are
  // comfortably sub-pixel: megabytes spent on detail nobody can see.
  const tier = (file, dp, tol = 0) => {
    const topo = JSON.parse(readFileSync(join(root, 'shared', 'data', file), 'utf8'))
    const fc = feature(topo, topo.objects.countries)

    const palestine = mergePalestine(topo, merge)
    if (palestine) {
      const kept = fc.features.filter(
        (f) => f.properties?.name !== 'Israel' && f.properties?.name !== 'Palestine',
      )
      fc.features = [...kept, palestine]
    }

    return {
      type: 'FeatureCollection',
      features: fc.features.map((f) => {
        const name = f.properties?.name ?? ''
        const iso2 = codeFromTopojsonName(name)
        return {
          type: 'Feature',
          // `id` is what `setFeatureState` addresses, and MapLibre requires it
          // to be a number or a string that parses as one — so the hover state
          // rides on the feature index rather than the code.
          properties: iso2 ? { name, iso2 } : { name },
            geometry: thin(f.geometry, dp, tol),
        }
      }),
    }
  }

  const countries = tier('countries-50m.json', 3)
  return {
    countries,
    // Second tier, from Natural Earth 1:10m. 255 countries against 50m's 240
    // — the difference is mostly islands and a coastline with
    // real inlets rather than a smoothed outline, which is exactly what shows
    // once the camera is past continental scale. Coordinates keep 3 decimals
    // (~110 m), which is sub-pixel even at the map's maximum zoom; trimming to
    // 2 halves the payload but starts to read as jagged up close.
    // 0.003° ≈ 330 m, which is sub-pixel below zoom 9 and about one pixel at
    // it — invisible where the tier is used, and a 28% smaller download. The
    // coarser tiers are left alone: they have little redundancy to remove and
    // everything taken out of them shows immediately.
    countriesUltra: tier('countries-10m.json', 3, 0.003),
    countryLabels: await countryLabelPoints(countries),
    places: await placeLabels(root),
  }
}

/**
 * City and town labels, under their own names.
 *
 * The article layer has shown locations in historic Palestine under their
 * original Arabic names for a while, but the basemap underneath was drawn from
 * Natural Earth untouched — so a story datelined Al-Quds sat on a label reading
 * "Jerusalem", and the map contradicted the article printed on top of it. Same
 * table, same rule, applied to the ground as well as to the stories.
 */
async function placeLabels(root) {
  const { displayLocation } = await loadShared('place-names.ts')
  const fc = JSON.parse(
    readFileSync(join(root, 'shared', 'data', 'places-50m.geojson'), 'utf8'),
  )

  // National capitals, flagged as `ncap`.
  //
  // The `cap` property already on these features is Natural Earth's *admin*
  // capital flag — it is set on 796 of 1251 places, Mumbai and Ekaterinburg
  // among them, so it marks provincial seats as readily as national ones and
  // says almost nothing when two thirds of the map carries it. `capitals-50m`
  // is the 194-entry national list, and every one of its names is present here.
  //
  // Matched on name *and* proximity: capital names are not unique across the
  // world, and a name-only join would promote the wrong San José.
  const capitals = JSON.parse(
    readFileSync(join(root, 'shared', 'data', 'capitals-50m.json'), 'utf8'),
  )
  const byName = new Map()
  for (const cap of Object.values(capitals)) {
    if (!byName.has(cap.name)) byName.set(cap.name, [])
    byName.get(cap.name).push(cap)
  }
  const isCapital = (name, lng, lat) => {
    const candidates = byName.get(name)
    if (!candidates) return false
    // 0.5° ≈ 55 km — comfortably wider than the disagreement between two
    // gazetteers about where a city centre is, far narrower than the gap
    // between two cities that merely share a name.
    return candidates.some((c) => Math.abs(c.lat - lat) < 0.5 && Math.abs(c.lng - lng) < 0.5)
  }

  return {
    ...fc,
    features: fc.features.map((f) => {
      const [lng, lat] = f.geometry?.coordinates ?? []
      // Test against the *source* name — `capitals-50m` is untranslated
      // Natural Earth, so matching after displayLocation() would drop Al-Quds.
      const ncap = isCapital(f.properties?.n, lng, lat) ? 1 : 0
      return {
        ...f,
        properties: {
          ...f.properties,
          n: displayLocation(f.properties?.n) ?? f.properties?.n,
          ncap,
        },
      }
    }),
  }
}
