// MapLibre style for the situational map.
//
// Everything is served from our own origin — country geometry, place labels and
// the SDF glyph ranges — so there is no tile provider, no API key and no
// third-party request. The CSP stays `default-src 'none'`.
//
// Dark by design rather than by theme: coloured markers need a dark ground to
// read against, and every operational map worth copying commits to it.

import type { StyleSpecification } from 'maplibre-gl'

/**
 * What MapLibre paints.
 *
 * The chrome *over* this canvas is painted by CSS, from the `--map-*` block in
 * `style.css` scoped to `body.map-page, body.doc-page`. The two are one palette
 * split across two languages because neither can read the other: the style is
 * handed to a worker before any stylesheet is queryable, and CSS cannot import
 * a module. Where a value appears on both sides it is called out here and
 * there — change one, change the other.
 *
 * `ocean` is `--map-ground`. It is not only the sea: the HUD and scrubber
 * gradients fade into it, and a cluster disc is filled with it so a numeral
 * reads clear of the coastline underneath. A drift here shows up as a seam
 * between the canvas and the chrome sitting on it.
 */
export const MAP_COLOURS = {
  /** = `--map-ground` in style.css. */
  ocean: '#080a0d',
  land: '#15181e',
  landHi: '#1b1f27',
  /**
   * Frontiers *and* coastlines — `borders` is the only line layer, so this one
   * value has to read against the ocean on one side and against whatever the
   * metric has painted the land on the other.
   *
   * Was `#2b313b`, which measured 1.06:1 against the land it was drawn on. That
   * is not a quiet border, it is an absent one: the line was there and nobody
   * could see it. It sat just above the old ramp's ceiling, and the ramp was
   * capped to protect it — a cap that cost the metric encoding its whole range
   * and bought a border that was invisible anyway.
   *
   * Now above the widened ramp's ceiling (1.36:1) and 3.3:1 against the ocean,
   * so a coastline is a coastline and a country with no figure still reads as
   * land rather than sea.
   */
  border: '#5c6470',
  coast: '#39414e',
  /** Basemap place labels. The chrome's own text uses `--map-ink-*`, which is
   *  a different scale — this one is tuned against the land, not the panels. */
  label: '#8d97a6',
  /** Country names. Quiet on purpose, and carried by `labelHalo` rather than by
   *  its own contrast — the land underneath is now a variable, so the halo is
   *  the only thing about a label that does not move. */
  labelDim: '#727b88',
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
  /** = `--map-straits` in style.css, which the chokepoint sparkline is drawn
   *  in. Shares a hex with the site's `--brand` and means something else. */
  straits: '#c9a84c',
  /** Surge — traffic above baseline, the opposite story from the same number.
   *  = `--map-straits-surge`. */
  straitsSurge: '#5f9ea0',
  conflict: '#c05252',
  /** Conflict marks are filled discs; this is the fill under the stroke. */
  conflictFill: '#8c2f2f',
  /**
   * Genocide.
   *
   * Every other mark on this map is muted — ochre, gold, a dulled red, a land
   * tint that never reaches full value — because a situational display that
   * shouts everywhere says nothing anywhere. That restraint is what makes one
   * unmuted tone available, and this is the only thing spending it.
   *
   * The same hue as conflict, at the saturation conflict deliberately does not
   * have. Sharing the hue is the point: this is not a different subject from
   * the red already on the map, it is the far end of it, and a reader who has
   * learned that red means people being killed should not have to learn a
   * second vocabulary to read the gravest case. `#c05252` is that red held
   * back — 44% saturation, so a few hundred of them can sit on one map without
   * setting it on fire. This is the same red let go, and only two marks are
   * ever allowed to spend it.
   */
  genocide: '#f5372b',
  /** The dark core the ring encloses, so the mark reads over any land tone. */
  genocideCore: '#0b0d11',
  /**
   * A market's direction on the day.
   *
   * These are `--map-pos` and `--map-neg` from style.css, not new colours: the
   * site already has a pair that means "a signed change", they already clear AA
   * on every map surface, and a rising index is the same kind of fact as a
   * rising indicator on an entity page. Introducing a second green would be
   * asking the reader to learn a second vocabulary for one idea.
   *
   * Muted on purpose, like everything else here. Thirty of these sit on the map
   * at once, and the one unmuted tone on this display is spent on genocide.
   */
  marketUp: '#9aab86',
  marketDown: '#c08a6a',
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
 *    in lightness. Saturation *tapers* as lightness rises, because a fixed HSL
 *    saturation widens the channel spread as it lightens — the top of the ramp
 *    would drift chromatic while every stop still claimed the same S.
 * 2. **Clear of `border`.** `borders` is the only line layer, drawn over the
 *    fill and doubling as the coastline, so land tinted to the border's own
 *    lightness erases both the frontier and the shore.
 *
 * ── Why this ramp is not the old one ───────────────────────────────────────
 *
 * The previous stops ran `#191d24` → `#272d36`, and constraint 2 was read as
 * "stay under `#2b313b`", the border's old value. That capped the entire scale
 * inside 14 points of one channel, and the arithmetic was brutal: **adjacent
 * stops measured 1.04–1.06:1, and the whole range from worst to best measured
 * 1.22:1** — less contrast across the complete encoding than a single step
 * needs to be perceptible. The land was not subtly shaded, it was flat. Picking
 * press freedom and picking urbanisation produced the same picture, which is
 * why the picker felt like it did nothing.
 *
 * The cap was also not buying what it claimed. The border measured 1.06:1
 * against the land it was drawn on — it had already vanished. So the constraint
 * that cost the ramp its range was protecting something that did not survive
 * anyway.
 *
 * The fix is to move the border up rather than hold the ramp down: `border` is
 * now `#5c6470`, comfortably above the ceiling here and 3.3:1 against the
 * ocean. That frees the ramp to span 2.01:1 floor to ceiling, with every step
 * at 1.15:1 or better. Still dark, still neutral, still quiet — but now a
 * reader can actually tell the quartiles apart, which is the entire point of
 * shading the land at all.
 *
 * `scripts/lib/map-geo.test.js` pins the step contrast, because the old ramp
 * passed every test there was: monotonic, neutral, under the border. Nothing
 * asked whether the steps could be seen.
 */
export const LAND_RAMP = ['#192029', '#242b37', '#303843', '#3c4450', '#48505c'] as const

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
 *
 * It sits close to the ocean, and that is safe now in a way it was not before:
 * `border` outlines every country at 3.3:1 against the sea, so an unshaded
 * country reads as an empty outline rather than dissolving into water. The
 * legend says the same thing in words — "the rest left dark".
 *
 * A tone alone is still not enough, which is what `nodataHatch` is for: on a
 * ramp where lighter means more, *any* dark tone reads as "least", and being
 * merely darker than the floor is a difference of degree where the truth is a
 * difference of kind.
 */
export const LAND_NO_DATA = '#0d1015'

/**
 * The hatch drawn over countries the metric has no figure for.
 *
 * Position on a sequential ramp is a claim, and a country painted below the
 * floor is making the claim "lowest". For roughly thirty countries that claim
 * is simply false — Saudi Arabia is absent from `country-augmented` entirely,
 * so on urbanisation the map drew one of the most urbanised countries on earth
 * as the least, and on every other augmented metric too. `literacyPct` covers
 * half the world, so on that one the map was asserting a bottom-of-scale value
 * for 84 countries at once.
 *
 * Hatching is the cartographic convention for this and it works because it is
 * not on the scale at all: no tone, however chosen, can say "not measured" to
 * a reader who has just been taught that dark means little. Diagonal, 1px, at
 * the border's own colour so it reads as furniture rather than data, and
 * sparse enough that the beacons over it stay legible.
 *
 * Returned as raw RGBA rather than drawn on a canvas so it can be handed
 * straight to `map.addImage` — no 2D context, no `data:` URL, nothing the CSP
 * has an opinion about.
 */
export const nodataHatch = (): { width: number; height: number; data: Uint8Array } => {
  const N = 8
  const data = new Uint8Array(N * N * 4)
  // `#5c6470` — the border's colour, so an unmeasured country reads as drawn
  // rather than as shaded. Kept faint; the hatch has to be findable, not loud.
  const [r, g, b, a] = [0x5c, 0x64, 0x70, 90]
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // One diagonal per tile. `(x + y) % N` gives a 45° line that tiles
      // seamlessly in both axes, which a slope-based test does not.
      if ((x + y) % N === 0) {
        const i = (y * N + x) * 4
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
        data[i + 3] = a
      }
    }
  }
  return { width: N, height: N, data }
}

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
        /**
         * A label has to earn its place by the size of the thing it names.
         *
         * The basemap moved from Natural Earth 1:110m to 1:50m, which is 240
         * countries against 176 — and the 64 newcomers are almost all specks.
         * Unfiltered, the world view acquired PITCAIRN IS., NORFOLK ISLAND,
         * NAURU, BERMUDA and S. GEO. AND THE IS. scattered across an otherwise
         * empty Pacific, each one shouting as loudly as BRAZIL. Collision
         * resolution does not help: there is nothing out there to collide with.
         *
         * `area` is on every label feature already (steradians of the country's
         * largest polygon). The first step is set at 0.00008, which is where the
         * old 176-country set ended — so the world view keeps exactly the label
         * density it had, and the smaller states arrive as the camera earns
         * them rather than never appearing at all.
         */
        filter: [
          '>=',
          ['get', 'area'],
          ['step', ['zoom'], 0.00008, 3, 0.00001, 4.5, 0.000002, 6, 0],
        ],
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
