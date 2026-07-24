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

/** Rounds coordinates to ~11m and drops the redundant precision NE ships. */
export const thin = (geometry, dp = 4) => {
  const r = (n) => Math.round(n * 10 ** dp) / 10 ** dp
  const ring = (pts) => closePolar(unwrap(pts)).map(([x, y]) => [r(x), r(y)])
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

export async function buildMapSources(root) {
  const { feature } = await import('topojson-client')
  // Natural Earth carries only a display name, but the country profile is
  // routed by ISO 3166-1 alpha-2 (`/api/country/{ISO2}.json`). Resolving it
  // here — with the same lookup the country pages are generated from, so the
  // two can never disagree — is what makes a land polygon clickable.
  const { codeFromTopojsonName } = await loadShared('countries/iso.ts')

  // Two detail tiers. 110m is the first-paint basemap at 72 KB gzipped; 50m is
  // seven times heavier and only fetched once the reader zooms past the point
  // where the coarse coastline starts to show.
  const tier = (file, dp) => {
    const topo = JSON.parse(readFileSync(join(root, 'shared', 'data', file), 'utf8'))
    const fc = feature(topo, topo.objects.countries)
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
          geometry: thin(f.geometry, dp),
        }
      }),
    }
  }

  const countries = tier('countries-110m.json', 4)
  return {
    countries,
    countriesDetail: tier('countries-50m.json', 3),
    // Third tier, from Natural Earth 1:10m. 255 countries against 50m's 240
    // and 110m's 176 — the difference is mostly islands and a coastline with
    // real inlets rather than a smoothed outline, which is exactly what shows
    // once the camera is past continental scale. Coordinates keep 3 decimals
    // (~110 m), which is sub-pixel even at the map's maximum zoom; trimming to
    // 2 halves the payload but starts to read as jagged up close.
    countriesUltra: tier('countries-10m.json', 3),
    countryLabels: await countryLabelPoints(countries),
    places: JSON.parse(readFileSync(join(root, 'shared', 'data', 'places-50m.geojson'), 'utf8')),
  }
}
