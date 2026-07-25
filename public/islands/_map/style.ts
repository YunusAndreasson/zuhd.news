// MapLibre style for the situational map.
//
// Everything is served from our own origin — country geometry, place labels and
// the SDF glyph ranges — so there is no tile provider, no API key and no
// third-party request. The CSP stays `default-src 'none'`.
//
// Dark by design rather than by theme: coloured markers need a dark ground to
// read against, and every operational map worth copying commits to it.

import type { StyleSpecification } from 'maplibre-gl'

export const MAP_COLOURS = {
  ocean: '#080a0d',
  land: '#15181e',
  landHi: '#1b1f27',
  border: '#2b313b',
  coast: '#39414e',
  label: '#8d97a6',
  labelDim: '#5d6673',
  labelHalo: '#05070a',
} as const

/** Category hues, low-saturation so four of them can coexist without shouting. */
export const CATEGORY_COLOUR: Record<string, string> = {
  politics: '#d2604a',
  economy: '#d0a24a',
  science: '#4fa0a4',
  tech: '#8b96d4',
}

export const CATEGORY_ORDER = ['politics', 'economy', 'science', 'tech']

/**
 * The three overlay layers, in the colour each one draws itself.
 *
 * Here rather than inline in the layer paint because the HUD chips now carry
 * these too. A legend that names its colour separately from the layer that
 * paints it is a legend waiting to go stale — the chip would keep saying amber
 * long after the marks turned some other shade.
 *
 * `straits` is the one judgement call. Chokepoint rings are neutral at rest and
 * only take a colour when traffic moves off its baseline: gold for a blockage,
 * a cool tone for a surge. Gold is what the layer looks like when it is saying
 * something, so it is what the chip shows.
 */
export const OVERLAY_COLOUR = {
  gdacs: '#b8763f',
  straits: '#c9a84c',
  /** Surge — traffic above baseline, the opposite story from the same number. */
  straitsSurge: '#5f9ea0',
  conflict: '#c05252',
  /** Conflict marks are filled discs; this is the fill under the stroke. */
  conflictFill: '#8c2f2f',
} as const

/**
 * The land ramp — how a country's value for the chosen metric becomes a tone.
 *
 * Two constraints fix this palette, and both are load-bearing:
 *
 * 1. **Neutral, never chromatic.** Category hue is the only colour on this map
 *    that means anything, which is precisely what was won back by deleting the
 *    cluster heat ramp. A choropleth in gold or teal would take it straight
 *    back. Every stop here is the same blue-grey as the base land, varying only
 *    in lightness.
 * 2. **Capped below `border`.** `borders` is one line layer drawn over the
 *    fill, so a country tinted to the border's own lightness erases its
 *    frontier with every neighbour. The top stop stays 4–5 points under
 *    `#2b313b` in all three channels.
 *
 * That leaves a genuinely narrow range to spend — from `#191d24` to `#272d36`.
 * It reads on a dark screen, but it is not a loud encoding, and it cannot
 * become one without giving up one of the two constraints above.
 */
export const LAND_RAMP = ['#191d24', '#1c2129', '#20262e', '#232933', '#272d36'] as const

/**
 * A country the current metric has no figure for.
 *
 * Deliberately *below* the ramp's floor rather than at it. `country-augmented`
 * covers 144 countries against `country-data`'s 176, so on metrics like press
 * freedom or HDI roughly 30 countries have nothing — and painting them the
 * ramp's lowest tone would state a value we do not have. The gap to the floor
 * is wider than the gap between any two adjacent stops, so "off the scale"
 * cannot be misread as "bottom of the scale". Same principle as a story with
 * no coverage figure getting a fixed neutral radius instead of the smallest.
 */
export const LAND_NO_DATA = '#101317'

/**
 * `v` is a hash of what went into the basemap, from `data-basemap` on the mount
 * element. The files are served with a day-long max-age because Natural Earth
 * geometry does not change between deploys — but our treatment of it does, and
 * without a versioned URL a reader keeps yesterday's copy for a full day. That
 * is how the map went on printing "Tel Aviv" and "Jerusalem" after the build
 * had started emitting "Yafa" and "Al-Quds": a reload re-requests a URL the
 * browser is entitled to answer from disk.
 */
export const basemapUrl = (file: string, v?: string) =>
  v ? `/basemap/${file}?v=${encodeURIComponent(v)}` : `/basemap/${file}`

export function buildStyle(v?: string): StyleSpecification {
  return {
    version: 8,
    // Glyphs are genuinely immutable — the same Noto ranges every build — so
    // they keep their unversioned, year-long cached URL.
    glyphs: '/basemap/fonts/{fontstack}/{range}.pbf',
    sources: {
      // `promoteId` lifts each feature's `iso2` into the feature id, which is
      // what `setFeatureState` keys on — the same mechanism the story layer
      // uses for hover, and the reason the land tint costs no GeoJSON rewrite
      // when the reader changes metric.
      countries: { type: 'geojson', data: basemapUrl('countries.geojson', v), promoteId: 'iso2' },
      countryLabels: { type: 'geojson', data: basemapUrl('country-labels.geojson', v) },
      places: { type: 'geojson', data: basemapUrl('places.geojson', v) },
    },
    layers: [
      {
        id: 'ocean',
        type: 'background',
        paint: { 'background-color': MAP_COLOURS.ocean },
      },
      {
        id: 'land',
        type: 'fill',
        source: 'countries',
        paint: {
          // The metric percentile arrives per-country as feature state. A
          // country the metric doesn't cover has no state at all, so `coalesce`
          // falls through to the off-scale tone rather than to `p = 0`.
          'fill-color': [
            'case',
            ['==', ['coalesce', ['feature-state', 'p'], -1], -1],
            LAND_NO_DATA,
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'p'], 0],
              0, LAND_RAMP[0],
              0.25, LAND_RAMP[1],
              0.5, LAND_RAMP[2],
              0.75, LAND_RAMP[3],
              1, LAND_RAMP[4],
            ],
          ],
        },
      },
      {
        id: 'borders',
        type: 'line',
        source: 'countries',
        paint: {
          'line-color': MAP_COLOURS.border,
          // Borders stay hairline at world zoom and firm up as you go in.
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 4, 0.8, 8, 1.2],
        },
      },
      {
        id: 'country-labels',
        type: 'symbol',
        source: 'countryLabels',
        minzoom: 1.1,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 1.2, 8.5, 6, 13],
          'text-letter-spacing': 0.14,
          'text-transform': 'uppercase',
          'text-max-width': 7,
          'text-padding': 6,
          // Without this, collision resolution is arbitrary and India loses to
          // Timor-Leste. Larger countries sort first and therefore survive.
          'symbol-sort-key': ['-', 1, ['get', 'area']],
        },
        paint: {
          'text-color': MAP_COLOURS.labelDim,
          'text-halo-color': MAP_COLOURS.labelHalo,
          'text-halo-width': 1.1,
        },
      },
      {
        id: 'place-dots',
        type: 'circle',
        source: 'places',
        minzoom: 2.4,
        filter: ['<=', ['get', 'r'], 4],
        paint: {
          // A national capital reads a touch heavier than a city that merely
          // happens to be large. Where a thing is decided is worth knowing on a
          // map of decisions, and the difference is one of weight, not colour.
          'circle-radius': ['case', ['==', ['get', 'ncap'], 1], 2, 1.4],
          'circle-color': MAP_COLOURS.labelDim,
          'circle-opacity': ['case', ['==', ['get', 'ncap'], 1], 0.9, 0.7],
        },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: 'places',
        minzoom: 2.4,
        // Rank gates density: only the most important places survive low zoom.
        filter: ['<=', ['get', 'r'], ['+', 1, ['*', 1.6, ['zoom']]]],
        layout: {
          'text-field': ['get', 'n'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 8, 13],
          'text-offset': [0, 0.75],
          'text-anchor': 'top',
          'text-padding': 4,
          'text-max-width': 8,
          // `r` decides which labels are eligible at this zoom; among those, the
          // bigger city wins the collision. Without a sort key MapLibre resolves
          // ties in source order, so a town could silently displace a city of
          // ten million sitting beside it. Same idiom as the country labels,
          // which sort on area for the same reason.
          'symbol-sort-key': ['-', 0, ['get', 'p']],
        },
        paint: {
          'text-color': MAP_COLOURS.label,
          'text-halo-color': MAP_COLOURS.labelHalo,
          'text-halo-width': 1.2,
        },
      },
    ],
  }
}
