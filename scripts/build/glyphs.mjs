// The map's label glyphs, generated from the site's own typeface.
//
// MapLibre draws a label from signed-distance glyphs fetched as protobuf, one
// file per font and 256 code points (`/basemap/fonts/{fontstack}/{range}.pbf`).
// These are made from the static Source Sans 3 Regular and Bold in
// `scripts/assets/fonts/`, so the map is set in the same family as the page
// around it. Chrome is the installed one (`channel: 'chrome'`).
//
// Run by hand when the font or the ranges change, and commit the output; the
// build only copies `public/`. It draws with the browser's own text renderer
// through `@mapbox/tiny-sdf`, which is also what MapLibre uses for glyphs it
// draws itself, with the parameters fontnik used for the files it replaces.
//
//   node scripts/build/glyphs.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PbfWriter } from 'pbf'
import { chromium } from 'playwright'
import { ROOT } from '../lib/paths.js'

const require = createRequire(import.meta.url)

const FACES = ['Regular', 'Bold']

/** What labels use: Latin and its extensions, and the general punctuation block. */
const RANGES = [
  [0, 255],
  [256, 511],
  [512, 767],
  [8192, 8447],
]

/**
 * fontnik's glyph format: 24px, three pixels of border round each glyph (the
 * border `parse_glyph_pbf.ts` reads back), eight pixels of distance, a quarter
 * of the byte range outside the edge.
 */
const SDF = { fontSize: 24, buffer: 3, radius: 8, cutoff: 0.25 }

/**
 * Where the baseline sits below a glyph's origin, in fontnik's metrics: `top`
 * is the ink's height above the baseline minus this. Read off the Noto files
 * these replace (H, x and the full stop all end 26px down), so a label sits
 * where it did.
 */
const BASELINE = 26

/**
 * The code points a TrueType font maps to a glyph, from its `cmap` table
 * (format 4, or 12 where present). A browser asked for one the font lacks
 * draws it from a system fallback instead, which is not ours to ship.
 */
const codePoints = (font) => {
  const tables = font.readUInt16BE(4)
  let cmap = -1
  for (let i = 0; i < tables; i++) {
    const at = 12 + i * 16
    if (font.toString('latin1', at, at + 4) === 'cmap') cmap = font.readUInt32BE(at + 8)
  }
  if (cmap < 0) throw new Error('no cmap table')
  const subtables = []
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const at = cmap + 4 + i * 8
    const offset = cmap + font.readUInt32BE(at + 4)
    subtables.push({ format: font.readUInt16BE(offset), offset })
  }
  const covered = new Set()
  const full = subtables.find((t) => t.format === 12)
  if (full) {
    const groups = font.readUInt32BE(full.offset + 12)
    for (let g = 0; g < groups; g++) {
      const at = full.offset + 16 + g * 12
      for (let c = font.readUInt32BE(at); c <= font.readUInt32BE(at + 4); c++) covered.add(c)
    }
    return covered
  }
  const bmp = subtables.find((t) => t.format === 4)
  if (!bmp) throw new Error('no format 4 or 12 cmap')
  const segments = font.readUInt16BE(bmp.offset + 6) / 2
  const ends = bmp.offset + 14
  const starts = ends + segments * 2 + 2
  const deltas = starts + segments * 2
  const ranges = deltas + segments * 2
  for (let s = 0; s < segments; s++) {
    const end = font.readUInt16BE(ends + s * 2)
    const start = font.readUInt16BE(starts + s * 2)
    const delta = font.readInt16BE(deltas + s * 2)
    const rangeOffset = font.readUInt16BE(ranges + s * 2)
    for (let c = start; c <= end && c !== 0xffff; c++) {
      const glyph = rangeOffset
        ? font.readUInt16BE(ranges + s * 2 + rangeOffset + (c - start) * 2)
        : (c + delta) & 0xffff
      if (glyph) covered.add(c)
    }
  }
  return covered
}

const tinySdfSource = readFileSync(require.resolve('@mapbox/tiny-sdf'), 'utf8').replace(
  'export default class TinySDF',
  'globalThis.TinySDF = class TinySDF',
)

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
await page.addScriptTag({ content: tinySdfSource })

for (const face of FACES) {
  const fontstack = `Source Sans 3 ${face}`
  const font = readFileSync(join(ROOT, 'scripts/assets/fonts', `SourceSans3-${face}.ttf`))
  const ids = codePoints(font)
  const glyphs = await page.evaluate(
    async ({ base64, ranges, sdf, covered }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const family = 'GlyphSource'
      const loaded = await new FontFace(family, bytes).load()
      document.fonts.add(loaded)
      const has = new Set(covered)
      const tiny = new globalThis.TinySDF({ ...sdf, fontFamily: family })
      const out = []
      for (const [start, end] of ranges) {
        const range = []
        for (let id = start; id <= end; id++) {
          const char = String.fromCodePoint(id)
          // Controls draw nothing and advance nothing; MapLibre needs no entry.
          if (/\p{Cc}/u.test(char) || !has.has(id)) continue
          const g = tiny.draw(char)
          range.push({
            id,
            bitmap: Array.from(g.glyphWidth && g.glyphHeight ? g.data : []),
            width: g.glyphWidth,
            height: g.glyphHeight,
            left: g.glyphLeft,
            ascent: g.glyphTop,
            advance: Math.round(g.glyphAdvance),
          })
        }
        out.push({ range: `${start}-${end}`, glyphs: range })
      }
      document.fonts.delete(loaded)
      return out
    },
    { base64: font.toString('base64'), ranges: RANGES, sdf: SDF, covered: [...ids] },
  )

  const dir = join(ROOT, 'public/basemap/fonts', fontstack)
  mkdirSync(dir, { recursive: true })
  for (const { range, glyphs: set } of glyphs) {
    const pbf = new PbfWriter()
    pbf.writeMessage(1, (_, w) => {
      w.writeStringField(1, fontstack)
      w.writeStringField(2, range)
      for (const g of set) {
        w.writeMessage(3, (__, gw) => {
          gw.writeVarintField(1, g.id)
          if (g.bitmap.length) gw.writeBytesField(2, Uint8Array.from(g.bitmap))
          gw.writeVarintField(3, g.width)
          gw.writeVarintField(4, g.height)
          gw.writeSVarintField(5, g.left)
          gw.writeSVarintField(6, g.ascent - BASELINE)
          gw.writeVarintField(7, g.advance)
        }, null)
      }
    }, null)
    writeFileSync(join(dir, `${range}.pbf`), pbf.finish())
    console.log(`  ${fontstack} ${range}: ${set.length} glyphs`)
  }
}

await browser.close()
