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

export function buildStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: '/basemap/fonts/{fontstack}/{range}.pbf',
    sources: {
      countries: { type: 'geojson', data: '/basemap/countries.geojson' },
      countryLabels: { type: 'geojson', data: '/basemap/country-labels.geojson' },
      places: { type: 'geojson', data: '/basemap/places.geojson' },
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
        paint: { 'fill-color': MAP_COLOURS.land },
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
          'circle-radius': 1.4,
          'circle-color': MAP_COLOURS.labelDim,
          'circle-opacity': 0.7,
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
