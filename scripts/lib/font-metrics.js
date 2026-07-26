// Real text widths, read from the TrueType tables of the fonts we actually
// render with.
//
// Why this exists
// ---------------
// The share cards wrapped text by counting characters against a guessed
// em-factor: `Math.floor(inner / (fontSize * 0.62))`. That number was measured
// against a bug. resvg-js 2.6.2 renders fonts handed to it as `fontBuffers`
// with uniform, monospace-like advances, and the cards were built while that
// was happening — so 0.62em was roughly right, for the wrong reason. The fix
// to `fontFiles` (2026-07-25) restored proportional advances and left every
// wrap constant in the codebase describing a font nobody renders any more.
//
// Source Sans 3 Bold actually averages ~0.50em over mixed-case English. So the
// cards were wrapping about 20% earlier than they needed to, which cost lines,
// which hit the max-line ceiling, which is what put an ellipsis on the end of
// a headline that would have fit.
//
// A character count cannot be fixed by picking a better constant, either: "WWW"
// and "iii" differ by more than 3× in Source Sans, so any single factor is
// either too wide (text overflows the card) or too narrow (type shrinks and
// headlines get cut). Both failures are silent — the card renders either way.
// Measuring is the only way to promise a fit.
//
// What is parsed: `head` (unitsPerEm), `hhea`/`hmtx` (advance widths), `cmap`
// (character → glyph). Kerning is deliberately NOT applied: GPOS pair
// adjustments in this family are almost all negative, so ignoring them
// overestimates width slightly, and every error this module makes should be in
// the direction of "the text fits".

import { readFileSync } from 'fs'

const cache = new Map()

const u16 = (b, o) => b.readUInt16BE(o)
const u32 = (b, o) => b.readUInt32BE(o)
const i16 = (b, o) => b.readInt16BE(o)

/** Character code → glyph id, from a format 4 (BMP) cmap subtable. */
const parseCmap4 = (buf, off, map) => {
  const segCountX2 = u16(buf, off + 6)
  const segCount = segCountX2 / 2
  const endO = off + 14
  const startO = endO + segCountX2 + 2
  const deltaO = startO + segCountX2
  const rangeO = deltaO + segCountX2
  for (let s = 0; s < segCount; s++) {
    const end = u16(buf, endO + s * 2)
    const start = u16(buf, startO + s * 2)
    if (start > end) continue
    const delta = u16(buf, deltaO + s * 2)
    const rangeOffset = u16(buf, rangeO + s * 2)
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let g
      if (rangeOffset === 0) {
        g = (c + delta) & 0xffff
      } else {
        const gi = rangeO + s * 2 + rangeOffset + (c - start) * 2
        if (gi + 1 >= buf.length) continue
        g = u16(buf, gi)
        if (g !== 0) g = (g + delta) & 0xffff
      }
      if (g && !map.has(c)) map.set(c, g)
    }
  }
}

/** The same, from a format 12 (full Unicode) subtable. */
const parseCmap12 = (buf, off, map) => {
  const nGroups = u32(buf, off + 12)
  for (let g = 0; g < nGroups; g++) {
    const o = off + 16 + g * 12
    const start = u32(buf, o)
    const end = u32(buf, o + 4)
    const startGlyph = u32(buf, o + 8)
    // Guard against a pathological table claiming a huge range.
    if (end - start > 0x10000) continue
    for (let c = start; c <= end; c++) if (!map.has(c)) map.set(c, startGlyph + (c - start))
  }
}

/**
 * Parse a TTF into what measuring needs. Cached per path — the share-card build
 * measures thousands of strings across three weights and must not re-parse.
 */
export const loadFont = (path) => {
  const hit = cache.get(path)
  if (hit) return hit

  const buf = readFileSync(path)
  const numTables = u16(buf, 4)
  const tables = new Map()
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16
    tables.set(buf.toString('ascii', o, o + 4), { off: u32(buf, o + 8), len: u32(buf, o + 12) })
  }

  const head = tables.get('head')
  const hhea = tables.get('hhea')
  const hmtx = tables.get('hmtx')
  const cmapT = tables.get('cmap')
  if (!head || !hhea || !hmtx || !cmapT) throw new Error(`font missing required tables: ${path}`)

  const unitsPerEm = u16(buf, head.off + 18)
  const numHMetrics = u16(buf, hhea.off + 34)
  const advances = new Uint16Array(numHMetrics)
  for (let i = 0; i < numHMetrics; i++) advances[i] = u16(buf, hmtx.off + i * 4)

  // Prefer a full-Unicode subtable, then BMP. Both are walked when present so
  // an ellipsis or em dash resolves even if only one table carries it.
  const map = new Map()
  const n = u16(buf, cmapT.off + 2)
  const subs = []
  for (let i = 0; i < n; i++) {
    const o = cmapT.off + 4 + i * 8
    subs.push({ platform: u16(buf, o), encoding: u16(buf, o + 2), off: cmapT.off + u32(buf, o + 4) })
  }
  for (const s of subs) {
    const format = u16(buf, s.off)
    if (format === 12) parseCmap12(buf, s.off, map)
  }
  for (const s of subs) {
    const format = u16(buf, s.off)
    if (format === 4) parseCmap4(buf, s.off, map)
  }

  const font = {
    unitsPerEm,
    advances,
    map,
    // Every glyph past `numHMetrics` shares the last advance — that is what the
    // table's trailing lsb-only array means.
    lastAdvance: advances[numHMetrics - 1] || unitsPerEm,
  }
  cache.set(path, font)
  return font
}

/**
 * Width of `text` in px at `fontSize`, including SVG `letter-spacing`.
 *
 * `letterSpacing` is in px and matches the SVG attribute: resvg adds it after
 * every glyph, including the last, which is why it is multiplied by the full
 * character count rather than count-1. Overstating by one space is harmless
 * here and understating is not.
 */
export const measureText = (font, text, fontSize, letterSpacing = 0) => {
  const s = String(text ?? '')
  let units = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    const gid = font.map.get(cp)
    const adv =
      gid === undefined
        ? font.advances[font.map.get(0x20) ?? 0] || font.lastAdvance
        : gid < font.advances.length
          ? font.advances[gid]
          : font.lastAdvance
    units += adv
  }
  return (units / font.unitsPerEm) * fontSize + [...s].length * letterSpacing
}

/**
 * Greedy wrap to a pixel width. Returns every line — it never drops or clips
 * anything, which is the whole point.
 *
 * A single word longer than `maxWidth` (a URL, a long compound) is emitted on
 * its own overlong line rather than broken or clipped. The caller's fitting
 * loop is what resolves that, by choosing a size where it fits; breaking a word
 * mid-syllable on a headline card would look like a rendering fault.
 */
export const wrapToWidth = (font, text, maxWidth, fontSize, letterSpacing = 0) => {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines = []
  let current = words[0]
  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`
    if (measureText(font, candidate, fontSize, letterSpacing) <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = words[i]
    }
  }
  lines.push(current)
  return lines
}

/**
 * The largest size at which the whole text fits the box — never a truncation.
 *
 * Walks `max` down to `min` in `step`s and takes the first size whose wrap fits
 * both `maxLines` and, where given, `maxHeight`. If nothing fits, it returns
 * `min` with however many lines that takes: the contract is that all the text
 * is present, and the caller decides what to do with a block that came back
 * taller than it hoped. Nothing here ever returns clipped text.
 */
export const fitText = (font, text, opts) => {
  const {
    maxWidth,
    maxLines = Infinity,
    maxHeight = Infinity,
    min,
    max,
    step = 2,
    lineHeightRatio = 1.2,
    letterSpacingEm = 0,
  } = opts
  if (!String(text ?? '').trim()) return { lines: [], fontSize: min, lineHeight: Math.round(min * lineHeightRatio) }

  let chosen = min
  let chosenLines = null
  for (let size = max; size >= min; size -= step) {
    const ls = letterSpacingEm * size
    const lines = wrapToWidth(font, text, maxWidth, size, ls)
    const lineHeight = Math.round(size * lineHeightRatio)
    const overflowsWord = lines.some((l) => measureText(font, l, size, ls) > maxWidth)
    if (lines.length <= maxLines && lines.length * lineHeight <= maxHeight && !overflowsWord) {
      chosen = size
      chosenLines = lines
      break
    }
  }
  if (!chosenLines) chosenLines = wrapToWidth(font, text, maxWidth, min, letterSpacingEm * min)
  return {
    lines: chosenLines,
    fontSize: chosen,
    lineHeight: Math.round(chosen * lineHeightRatio),
  }
}
