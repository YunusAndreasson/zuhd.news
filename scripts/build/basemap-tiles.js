// The coastline and the sea floor as vector tiles, cut at build time: the
// 1:10m countries, and the depth bands (`basemap.js`, `depthBands`) in a
// layer of their own, so one request per tile carries both.
//
// The map used to load `countries.geojson` (1:50m, ~557 KB gzipped) whole at
// first paint and have MapLibre's worker cut it into tiles, then swap in the
// 1:10m file (~1.8 MB gzipped) once the camera passed zoom 5.5. The worker's
// cut was the slow part: 99k points parsed against the conflict feed, the
// lakes and the metric, with land on screen at 10 s and the source settled at
// 21 s. Cut here, with the same library MapLibre runs on its worker, the
// reader fetches only the tiles in view: the whole world at zoom 2 is 175 KB
// gzipped across 16 tiles, half of them on the far side, and a region at
// zoom 6 is tens of KB.
//
// Every tile from 0 to `COUNTRY_TILE_MAX_ZOOM` is written, an empty one as an
// empty file. MapLibre takes a 404 as an empty tile, but the browser logs it,
// `scripts/perf/probe.mjs` fails a run on any status of 400 or more, and
// Pages would answer each one with `404.html`. MapLibre reads an empty file
// as a tile with no layers. Past the top zoom it overzooms from the deepest
// tile on its worker, which for polygons costs nothing visible: at extent
// 8192 a zoom-5 tile has one unit per pixel at zoom 9, `maxZoom`.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { GeoJSONVT } from '@maplibre/geojson-vt'
import { fromGeojsonVt } from '@maplibre/vt-pbf'

/** The deepest zoom written; `_map/style.ts` names it as the source's `maxzoom`. */
export const COUNTRY_TILE_MAX_ZOOM = 5
/** The countries' layer in each tile, the `source-layer` of `land` and `borders`. */
export const COUNTRY_TILE_LAYER = 'countries'
/** The depth bands' layer, the `source-layer` of `depth`. */
export const DEPTH_TILE_LAYER = 'depth'
const EXTENT = 8192

/**
 * How far each layer is simplified, in tile units. The coastline takes
 * MapLibre's own GeoJSON default, so a tile draws what the worker's cut did;
 * the depth bands are a ground, and at the default they cost more than the
 * countries do.
 */
const TOLERANCE = { [COUNTRY_TILE_LAYER]: 3, [DEPTH_TILE_LAYER]: 48 }

/**
 * Writes `{z}/{x}/{y}.pbf` under `dir` for every tile up to the top zoom, one
 * tile layer per entry of `layers`.
 *
 * @param {Record<string, import('geojson').FeatureCollection>} layers
 * @param {string} dir
 * @returns {{ files: number, bytes: number }}
 */
export const writeBasemapTiles = (layers, dir) => {
  const indexes = Object.entries(layers).map(
    ([name, fc]) =>
      /** @type {const} */ ([
        name,
        new GeoJSONVT(/** @type {any} */ (fc), {
          maxZoom: COUNTRY_TILE_MAX_ZOOM,
          // Index every zoom up front: the tiles are all wanted, so cutting on
          // demand would only repeat the work per tile.
          indexMaxZoom: COUNTRY_TILE_MAX_ZOOM,
          indexMaxPoints: 0,
          extent: EXTENT,
          tolerance: TOLERANCE[name] ?? 3,
          buffer: 64,
        }),
      ]),
  )
  let files = 0
  let bytes = 0
  for (let z = 0; z <= COUNTRY_TILE_MAX_ZOOM; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      mkdirSync(join(dir, String(z), String(x)), { recursive: true })
      for (let y = 0; y < 2 ** z; y++) {
        /** @type {Record<string, import('@maplibre/geojson-vt').GeoJSONVTTile>} */
        const present = {}
        for (const [name, index] of indexes) {
          const tile = index.getTile(z, x, y)
          if (tile?.features.length) present[name] = tile
        }
        const data = Object.keys(present).length
          ? fromGeojsonVt(present, { version: 2, extent: EXTENT })
          : new Uint8Array(0)
        writeFileSync(join(dir, String(z), String(x), `${y}.pbf`), data)
        files++
        bytes += data.length
      }
    }
  }
  return { files, bytes }
}
