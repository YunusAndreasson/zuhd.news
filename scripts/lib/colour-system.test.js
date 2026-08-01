// The colour system: that it is a system, and that it holds.
//
// style.css once carried 180 raw hex literals across 61 distinct values, with
// nine near-black surfaces inside three points of each other and four greens
// for one idea. Nothing was wrong in isolation; the file simply had no way to
// tell an intentional step from a typo, and two of the accidents were real
// accessibility failures (`--text-dim` at 4.48:1, the map's focus ring at
// 2.63:1 against its own ground).
//
// Three invariants, each pinning one of those failure modes:
//
//   1. Colour is declared once. No literal outside the two token blocks.
//   2. Every ink/surface pair the system defines clears WCAG AA, in both
//      schemes and on every surface it can land on. This is a claim the
//      comments in style.css make; here it is checked.
//   3. The values shared with `_map/style.ts` agree. MapLibre paints the
//      canvas and CSS paints the chrome sitting on it — they cannot import
//      each other, so the only thing keeping the seam invisible is this.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AA, channels, contrast, luminance, NON_TEXT } from './contrast.js'

const ROOT = new URL('../..', import.meta.url).pathname
const css = readFileSync(join(ROOT, 'public/style.css'), 'utf8')
const mapStyle = readFileSync(join(ROOT, 'public/islands/_map/style.ts'), 'utf8')

// --- token access ----------------------------------------------------------

const token = (name) => {
  const m = css.match(new RegExp(`\\n\\s*${name}:\\s*([^;]+);`))
  assert.ok(m, `token ${name} is not declared`)
  return m[1].trim()
}

/** `light-dark(a, b)` → [a, b]; anything else → [v, v]. */
const scheme = (value) => {
  const m = value.match(/^light-dark\(\s*(.+?),\s*(.+)\)$/)
  return m ? [m[1].trim(), m[2].trim()] : [value, value]
}

// --- contrast --------------------------------------------------------------


const assertContrast = (fgName, fg, bgName, bg, min) => {
  const r = contrast(fg, bg)
  assert.ok(
    r >= min,
    `${fgName} (${fg}) on ${bgName} (${bg}) is ${r.toFixed(2)}:1, needs ${min}:1`,
  )
}

// --- 1. colour is declared once -------------------------------------------

test('no colour literal lives outside the two token blocks', () => {
  const rootStart = css.indexOf(':root {')
  const rootEnd = css.indexOf('\n}\n', rootStart)
  const darkStart = css.indexOf('body.map-page,\nbody.doc-page {\n  /* Surface, deepest to highest. */')
  assert.ok(darkStart > 0, 'the dark-surface token block should be findable')
  const darkEnd = css.indexOf('\n}\n', darkStart)

  const outside = css.slice(0, rootStart) + css.slice(rootEnd, darkStart) + css.slice(darkEnd)
  const code = outside.replace(/\/\*[\s\S]*?\*\//g, '')

  const hex = [...code.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
  // `#000` in a mask-image is an alpha channel, not a colour: a mask reads
  // luminance, so black means "hide" and nothing else. It is not part of the
  // palette and has no theme.
  const palette = hex.filter((h) => !/^#0{3,6}$/.test(h))
  assert.deepEqual(
    palette,
    [],
    `these should be tokens: ${[...new Set(palette)].join(', ')}`,
  )

  // Legacy `rgba(r, g, b, a)` alongside modern `rgb(r g b / a)` is two
  // notations for one thing.
  assert.equal(
    [...code.matchAll(/rgba\(/g)].length,
    0,
    'use the space/slash form: rgb(r g b / a)',
  )
})

// --- 2. the contrast the comments promise ---------------------------------

const SITE_INK = ['--text-emphasis', '--text', '--text-secondary', '--text-dim']
const SITE_SURFACE = ['--bg', '--bg-soft']

test('every site ink clears AA on every site surface, in both schemes', () => {
  for (const [i, name] of ['light', 'dark'].entries()) {
    for (const ink of SITE_INK) {
      for (const surface of SITE_SURFACE) {
        assertContrast(
          `${name} ${ink}`, scheme(token(ink))[i],
          surface, scheme(token(surface))[i],
          AA,
        )
      }
    }
  }
})

test('a signed change is legible in both schemes', () => {
  for (const [i, name] of ['light', 'dark'].entries()) {
    for (const mark of ['--pos', '--neg']) {
      for (const surface of SITE_SURFACE) {
        assertContrast(
          `${name} ${mark}`, scheme(token(mark))[i],
          surface, scheme(token(surface))[i],
          AA,
        )
      }
    }
  }
})

const MAP_INK = [
  '--map-ink',
  '--map-ink-strong',
  '--map-ink-body',
  '--map-ink-soft',
  '--map-ink-muted',
  '--map-ink-dim',
]
const MAP_SURFACE = [
  '--map-ground',
  '--map-sunken',
  '--map-inset',
  '--map-panel',
  '--map-raised',
]

test('every dark-surface ink clears AA on every dark surface', () => {
  // Including combinations no rule currently makes. The point of a scale is
  // that any step may be used on any surface without a second thought; a token
  // that fails somewhere inside its own system is a trap for the next edit.
  for (const ink of [...MAP_INK, '--map-pos', '--map-neg']) {
    for (const surface of MAP_SURFACE) {
      assertContrast(ink, token(ink), surface, token(surface), AA)
    }
  }
})

test('focus rings meet the non-text threshold wherever they land', () => {
  for (const [i, name] of ['light', 'dark'].entries()) {
    for (const surface of SITE_SURFACE) {
      assertContrast(
        `${name} --focus`, scheme(token('--focus'))[i],
        surface, scheme(token(surface))[i],
        NON_TEXT,
      )
    }
  }
  for (const surface of MAP_SURFACE) {
    assertContrast('--map-focus', token('--map-focus'), surface, token(surface), NON_TEXT)
  }
})

test('decoration and data marks meet the non-text threshold', () => {
  for (const surface of ['--map-ground', '--map-panel']) {
    assertContrast('--map-underline', token('--map-underline'), surface, token(surface), NON_TEXT)
  }
  for (const mark of ['--map-straits', '--map-straits-surge']) {
    assertContrast(mark, token(mark), '--map-ground', token('--map-ground'), NON_TEXT)
  }
})

test('the ink scale actually descends', () => {
  // Six steps that do not monotonically dim are six names for four colours.
  const lums = MAP_INK.map((n) => luminance(token(n)))
  for (let i = 1; i < lums.length; i++) {
    assert.ok(
      lums[i] < lums[i - 1],
      `${MAP_INK[i]} is not quieter than ${MAP_INK[i - 1]}`,
    )
  }
  const surfaces = MAP_SURFACE.map((n) => luminance(token(n)))
  // Ground → sunken is the one deliberate inversion: the rail sits *below* the
  // ocean it borders, so it is lighter by a hair, not darker.
  for (let i = 2; i < surfaces.length; i++) {
    assert.ok(
      surfaces[i] > surfaces[i - 1],
      `${MAP_SURFACE[i]} is not higher than ${MAP_SURFACE[i - 1]}`,
    )
  }
})

// --- 3. the seam with the map engine --------------------------------------

test('the values shared with _map/style.ts agree', () => {
  const ts = (path) => {
    const m = mapStyle.match(new RegExp(`${path}:\\s*'(#[0-9a-fA-F]{3,8})'`))
    assert.ok(m, `${path} is not declared in _map/style.ts`)
    return m[1]
  }
  // The HUD and scrubber gradients fade into the canvas, and a cluster disc is
  // filled with the ocean colour so its numeral reads over a coastline. A
  // drift here is a visible seam between the map and the chrome on top of it.
  assert.equal(token('--map-ground'), ts('ocean'), '--map-ground must equal MAP_COLOURS.ocean')
  // The chokepoint sparkline is CSS, and is tinted with the same two colours
  // as the marker the reader clicked to open it.
  assert.equal(token('--map-straits'), ts('straits'), '--map-straits must equal OVERLAY_COLOUR.straits')
  assert.equal(
    token('--map-straits-surge'),
    ts('straitsSurge'),
    '--map-straits-surge must equal OVERLAY_COLOUR.straitsSurge',
  )
  // The exchange marker is drawn by MapLibre from OVERLAY_COLOUR; its sparkline
  // is drawn by CSS from these tokens. They are the same two colours saying the
  // same thing, and the whole argument for reusing the site's signed-change
  // pair rather than inventing a market green is that there is one vocabulary
  // — which only holds while these agree.
  assert.equal(token('--map-pos'), ts('marketUp'), '--map-pos must equal OVERLAY_COLOUR.marketUp')
  assert.equal(
    token('--map-neg'),
    ts('marketDown'),
    '--map-neg must equal OVERLAY_COLOUR.marketDown',
  )
})

test('the brand mark is the only chromatic token on the site palette', () => {
  // Every other site token is a neutral. If a second hue appears here it is
  // either a mistake or a decision that deserves its own name and comment.
  const chromatic = (hex) => {
    const [r, g, b] = channels(hex)
    return Math.max(r, g, b) - Math.min(r, g, b) > 12
  }
  for (const name of [...SITE_INK, ...SITE_SURFACE, '--rule', '--rule-soft', '--accent', '--focus']) {
    for (const v of scheme(token(name))) {
      assert.ok(!chromatic(v), `${name} (${v}) carries a hue; only --brand may`)
    }
  }
  assert.ok(chromatic(token('--brand')), '--brand should be the chromatic one')
})
