// Run: node --test scripts/lib/dispatch.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { staleKeys } from './dispatch.js'

// ── staleKeys ─────────────────────────────────────────────────────────────

/** The indicator dispatch's four payloads, by the prefix each one mints. */
const sourceOf = (key) =>
  key.startsWith('cp:') ? 'chokepoints' : key.startsWith('mkt:') ? 'markets' : key.startsWith('co:') ? 'companies' : 'trends'

test('a key no source carries any more is dropped, a live one never', () => {
  const { drop, held } = staleKeys(['brent', 'poly-old', 'cp:suez', 'cp:gone'], ['brent', 'cp:suez', 'wiki-new'], sourceOf)
  assert.deepEqual(drop, ['poly-old', 'cp:gone'])
  assert.deepEqual(held, {})
})

test('a source that gave nothing loses nothing, and the others are still pruned', () => {
  // The chokepoint payload did not load: no `cp:` key is live. Its eleven
  // paragraphs stay; a Polymarket question that closed still goes.
  const cached = ['brent', 'poly-closed', 'cp:hormuz', 'cp:suez', 'mkt:bist']
  const { drop, held } = staleKeys(cached, ['brent', 'mkt:bist'], sourceOf)
  assert.deepEqual(drop, ['poly-closed'])
  assert.deepEqual(held, { chokepoints: 2 })
})

test('a cache that has grown does not stop its own prune', () => {
  // 2026-10-09, the daily pass: 157 live items against 390 cached, 233 of
  // them instruments that had left every payload. A floor on live/cached
  // (0.40 here, under its 0.6) declined the prune, as it had every day in the
  // logs; none had run since 2026-09-21.
  const live = Array.from({ length: 157 }, (_, i) => (i < 11 ? `cp:${i}` : i < 41 ? `mkt:${i}` : i < 61 ? `co:${i}` : `ind-${i}`))
  const dead = Array.from({ length: 233 }, (_, i) => (i < 121 ? `poly-gone-${i}` : `stocks:GONE${i}`))
  const { drop, held } = staleKeys([...live, ...dead], live, sourceOf)
  assert.equal(drop.length, 233)
  assert.deepEqual(held, {})
})

test('nothing live at all holds everything: one source, and it did not load', () => {
  // The events dispatch has one source, the snapshot's `events`.
  const { drop, held } = staleKeys(['fomc-2026-10', 'ecb-2026-10'], [])
  assert.deepEqual(drop, [])
  assert.deepEqual(held, { '': 2 })
})
