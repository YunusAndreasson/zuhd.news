// Callouts (`public/islands/_map/callouts.ts`): where a flagged market's or a
// disrupted strait's name goes when it loses its place beside the mark.
// Screen arithmetic, so it is checked as arithmetic.

import test from 'node:test'
import assert from 'node:assert/strict'
import { bundleIsland, scratchDir } from './island-bundle.js'

const { CALLOUT_MIN_CLEAR_PX, CALLOUT_PX, anchorFor, callouts } = await import(
  await bundleIsland(scratchDir('map-callouts'), 'public/islands/_map/callouts.ts', 'callouts.mjs')
)

const name = { w: 80, h: 14 }
const reach = (c, m) => Math.hypot(c.x - m.x, c.y - m.y)

test('a callout points out of its cluster, at a fixed reach', () => {
  // Three exchanges in a row, west to east; the flagged one is the east end.
  const all = [
    { id: 'a', x: 100, y: 200 },
    { id: 'b', x: 130, y: 200 },
    { id: 'c', x: 160, y: 200 },
  ]
  const [c] = callouts([{ ...all[2], ...name }], all)
  assert.ok(Math.abs(reach(c, all[2]) - CALLOUT_PX) < 1e-9)
  assert.ok(c.x > 160, 'set east, away from the other two')
  assert.ok(c.anchor.includes('left'), "the name's left edge faces its mark")
})

test('a name is never set beside another mark, where it would read as that mark’s', () => {
  // The Bosporus with Kerch up and to the right, where the push alone sent it.
  const bosporus = { id: 'bosporus', x: 300, y: 300 }
  const kerch = { id: 'kerch', x: 350, y: 268 }
  const athens = { id: 'athens', x: 250, y: 335 }
  const all = [bosporus, kerch, athens]
  const [c] = callouts([{ ...bosporus, ...name }], all)
  // Every other mark is at least 20px from the name's box.
  const [x0, x1] = c.anchor.includes('left') ? [c.x, c.x + name.w] : c.anchor.includes('right') ? [c.x - name.w, c.x] : [c.x - name.w / 2, c.x + name.w / 2]
  const [y0, y1] = c.anchor.startsWith('top') ? [c.y, c.y + name.h] : c.anchor.startsWith('bottom') ? [c.y - name.h, c.y] : [c.y - name.h / 2, c.y + name.h / 2]
  for (const n of [kerch, athens]) {
    const d = Math.hypot(Math.max(x0 - n.x, 0, n.x - x1), Math.max(y0 - n.y, 0, n.y - y1))
    assert.ok(d >= 20, `${n.id} is ${d.toFixed(1)}px from the Bosporus's name`)
  }
})

test('a lone mark goes up and to the right, and two callouts never share space', () => {
  const lone = { id: 'x', x: 400, y: 300 }
  const [c] = callouts([{ ...lone, ...name }], [lone])
  assert.ok(c.x > lone.x && c.y < lone.y)
  assert.equal(c.anchor, 'bottom-left')
  // Two flagged markets on one spot: the second takes another direction.
  const a = { id: 'a', x: 500, y: 500 }
  const b = { id: 'b', x: 500, y: 500 }
  const [ca, cb] = callouts([{ ...a, ...name }, { ...b, ...name }], [a, b])
  assert.notEqual(ca.anchor, cb.anchor)
})

test('a mark ringed by others gets no callout, and a lower rank runs out', () => {
  const m = { id: 'm', x: 500, y: 500 }
  // A mark under every one of the eight places a name could go.
  const ring = Array.from({ length: 8 }, (_, k) => ({
    id: `r${k}`,
    x: m.x + Math.cos((k * Math.PI) / 4) * (CALLOUT_PX + 4),
    y: m.y + Math.sin((k * Math.PI) / 4) * (CALLOUT_PX + 4),
  }))
  assert.deepEqual(callouts([{ ...m, ...name }], [m, ...ring]), [])
  // Alone, it has eight choices and no ninth.
  assert.equal(callouts([{ ...m, ...name }], [m], new Map([['m', 7]])).length, 1)
  assert.deepEqual(callouts([{ ...m, ...name }], [m], new Map([['m', 8]])), [])
  assert.ok(CALLOUT_MIN_CLEAR_PX > 0)
})

test('the anchor is the side of the name that faces back to the mark', () => {
  assert.equal(anchorFor(1, 0), 'left')
  assert.equal(anchorFor(-1, 0), 'right')
  assert.equal(anchorFor(0, -1), 'bottom', 'set above its mark, the name stands on its baseline')
  assert.equal(anchorFor(0, 1), 'top')
  assert.equal(anchorFor(-1, 1), 'top-right')
})
