// The basemap's vector tiles (`scripts/build/basemap-tiles.js`), the countries
// and the sea floor, against what the map asks of them
// (`public/islands/_map/style.ts`).
//
// Nothing in a browser reports a tile set that is not there: MapLibre reads a
// missing tile as empty, a wrong `source-layer` as no features and a missing
// `iso2` as a country that never takes the metric's tone. Each is an ocean
// where land should be, with no error.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { buildMapSources } from '../build/basemap.js'
import {
  COUNTRY_TILE_LAYER,
  COUNTRY_TILE_MAX_ZOOM,
  DEPTH_TILE_LAYER,
  writeBasemapTiles,
} from '../build/basemap-tiles.js'
import { bundleIsland, scratchDir } from './island-bundle.js'

const ROOT = new URL('../..', import.meta.url).pathname
const dir = scratchDir('basemap-tiles')
const out = join(dir, 'tiles')
const { countriesUltra, depth } = await buildMapSources(ROOT)
const written = writeBasemapTiles({ countries: countriesUltra, depth }, out)
// The countries alone, which leave the open sea with nothing to draw.
const landOnly = join(dir, 'land-only')
writeBasemapTiles({ countries: countriesUltra }, landOnly)
const style = await import(await bundleIsland(dir, 'public/islands/_map/style.ts', 'style.mjs'))

/** The Web Mercator tile holding a point. */
const tileAt = (z, lng, lat) => {
  const r = (lat * Math.PI) / 180
  return [
    Math.floor(((lng + 180) / 360) * 2 ** z),
    Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z),
  ]
}
const read = (z, x, y, root = out) => readFileSync(join(root, String(z), String(x), `${y}.pbf`))
const layerOf = (buf, name = COUNTRY_TILE_LAYER) => new VectorTile(new PbfReader(buf)).layers[name]

test('every tile up to the top zoom is written, an empty one as an empty file', () => {
  let expected = 0
  for (let z = 0; z <= COUNTRY_TILE_MAX_ZOOM; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++) {
        expected++
        assert.ok(existsSync(join(out, String(z), String(x), `${y}.pbf`)), `${z}/${x}/${y} is missing`)
      }
    }
  }
  assert.equal(written.files, expected)
  // The South Pacific at 140°W 45°S: with no sea floor, nothing to draw and
  // still a file; with it, the deep sea and no land.
  const [x, y] = tileAt(COUNTRY_TILE_MAX_ZOOM, -140, -45)
  assert.equal(read(COUNTRY_TILE_MAX_ZOOM, x, y, landOnly).length, 0)
  const tile = read(COUNTRY_TILE_MAX_ZOOM, x, y)
  assert.equal(layerOf(tile), undefined, 'land in the South Pacific')
  assert.ok(layerOf(tile, DEPTH_TILE_LAYER)?.length, 'the open sea has no depth')
})

test('the sea floor nests, from the shelf edge down to the trenches', () => {
  const layer = layerOf(read(0, 0, 0), DEPTH_TILE_LAYER)
  const bands = new Set(Array.from({ length: layer.length }, (_, i) => layer.feature(i).properties.d))
  assert.deepEqual([...bands].map(Number).sort((a, b) => a - b), [200, 2000, 4000, 6000])
  // The Mariana Trench, at 11.35°N 142.2°E, is under 6000 m by the top zoom.
  const [x, y] = tileAt(COUNTRY_TILE_MAX_ZOOM, 142.2, 11.35)
  const deep = layerOf(read(COUNTRY_TILE_MAX_ZOOM, x, y), DEPTH_TILE_LAYER)
  const there = new Set(Array.from({ length: deep.length }, (_, i) => deep.feature(i).properties.d))
  assert.ok(there.has(6000), `the Mariana Trench's tile holds ${[...there]}`)
})

test('the style asks for the tiles the build writes', () => {
  const src = style.buildStyle('v1').sources.countries
  assert.equal(src.type, 'vector')
  assert.equal(src.maxzoom, COUNTRY_TILE_MAX_ZOOM)
  assert.equal(src.promoteId, 'iso2')
  assert.match(src.tiles[0], /^\/basemap\/tiles\/\{z\}\/\{x\}\/\{y\}\.pbf\?v=v1$/)
  assert.equal(style.COUNTRY_TILES.maxzoom, COUNTRY_TILE_MAX_ZOOM)
  assert.equal(style.COUNTRY_TILES.layer, COUNTRY_TILE_LAYER)
  assert.equal(style.COUNTRY_TILES.depthLayer, DEPTH_TILE_LAYER)
  for (const layer of style.buildStyle().layers) {
    if (layer.source !== 'countries') continue
    const want = layer.id === 'depth' ? DEPTH_TILE_LAYER : COUNTRY_TILE_LAYER
    assert.equal(layer['source-layer'], want, layer.id)
  }
})

test('the world tile carries every country the coastline has, keyed by iso2', () => {
  const layer = layerOf(read(0, 0, 0))
  assert.ok(layer, `the world tile has no '${COUNTRY_TILE_LAYER}' layer`)
  const codes = new Set()
  for (let i = 0; i < layer.length; i++) {
    const iso2 = layer.feature(i).properties.iso2
    if (iso2) codes.add(iso2)
  }
  const expected = new Set(countriesUltra.features.map((f) => f.properties?.iso2).filter(Boolean))
  assert.deepEqual([...expected].filter((c) => !codes.has(c)), [], 'missing from the world tile')
})

test('a small state is drawn by the top zoom', () => {
  // Bahrain, at about 26°N 50.5°E.
  const z = COUNTRY_TILE_MAX_ZOOM
  const [x, y] = tileAt(z, 50.5, 26)
  const layer = layerOf(read(z, x, y))
  const codes = new Set(Array.from({ length: layer?.length ?? 0 }, (_, i) => layer.feature(i).properties.iso2))
  assert.ok(codes.has('BH'), `Bahrain is not in ${z}/${x}/${y}`)
})
