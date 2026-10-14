// Where a country's value sits on the map's land ramp
// (`scripts/build/country-metrics.js`).

import test from 'node:test'
import assert from 'node:assert/strict'
import { RAMP_CLIP, rampPositions } from '../build/country-metrics.js'

/** `n` countries with figures 10^1 … 10^n, plus whatever is passed in. */
const countries = (n, extra = []) => [
  ...Array.from({ length: n }, (_, i) => ({
    name: `c${i}`,
    numeric: 10 ** (i + 1),
    value: `1e${i + 1}`,
  })),
  ...extra,
]

test('one outlier no longer sets the darkest tone', () => {
  // Greenland held the floor alone at 57K and pressed everyone else into a
  // narrow band of the ramp. Past the clip, an outlier shares the end's tone
  // and the rest keep their spread.
  const set = countries(100, [{ name: 'tiny', numeric: 1e-30, value: 'tiny' }])
  const { positions } = rampPositions(set, { scale: 'log', ascending: false })
  assert.equal(positions.get('tiny'), 0)
  const p = (name) => /** @type {number} */ (positions.get(name))
  assert.ok(p('c90') - p('c10') > 0.75, `p10→p90 spans only ${(p('c90') - p('c10')).toFixed(2)}`)
})

test('the tone stays the value: ordered, inside 0..1, reaching both ends', () => {
  for (const scale of ['log', 'linear']) {
    for (const ascending of [false, true]) {
      const set = countries(60)
      const { positions } = rampPositions(set, { scale, ascending })
      const ps = set.map((e) => /** @type {number} */ (positions.get(e.name)))
      for (let i = 1; i < ps.length; i++) {
        const step = ascending ? ps[i - 1] - ps[i] : ps[i] - ps[i - 1]
        assert.ok(step >= 0, `${scale}${ascending ? ' ascending' : ''}: ${set[i].name} is out of order`)
      }
      assert.ok(ps.every((p) => p >= 0 && p <= 1))
      assert.ok(ps.includes(0) && ps.includes(1), 'both ends of the ramp are used')
    }
  }
})

test('an end names the figure its whole tone bounds, and says when others lie past it', () => {
  const set = countries(100)
  const { low, high } = rampPositions(set, { scale: 'log', ascending: false })
  const k = Math.round(RAMP_CLIP * 99)
  assert.equal(low?.entry.value, `1e${k + 1}`)
  assert.equal(low?.beyond, k > 0)
  assert.equal(high?.entry.value, `1e${100 - k}`)
  assert.equal(high?.beyond, k > 0)

  // A floored zero shares the floor with the smallest positive figure, so the
  // label is that figure: "0" would claim the darkest tone means nothing at all.
  const zeros = [0, 0, 0, 0, 0].map((numeric, i) => ({ name: `z${i}`, numeric, value: '0' }))
  const floored = rampPositions(countries(20, zeros), { scale: 'log', ascending: false })
  assert.equal(floored.low?.entry.value, '1e1')
  assert.equal(floored.low?.beyond, true)
})

test('an empty set places no one', () => {
  const { positions, low, high } = rampPositions([], { scale: 'log', ascending: false })
  assert.equal(positions.size, 0)
  assert.equal(low, null)
  assert.equal(high, null)
})
