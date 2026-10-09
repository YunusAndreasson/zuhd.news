// Run: node --test scripts/lib/dispatch.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { staleKeys, storedStanding } from './dispatch.js'

// ── storedStanding ────────────────────────────────────────────────────────

test('a definition stands while its fingerprint does', () => {
  // `brent`, content/.indicator-dispatch.json: one fingerprint on 2026-10-07,
  // 08 and 09, and a different sentence each day, because the `standing` that
  // came back with each refreshed `recent` replaced the one before.
  const items = {
    brent: {
      standingFingerprint: '46b7c3b0f3c54c37',
      standing: 'Crude from the North Sea, and the reference against which about two-thirds of internationally traded oil is priced.',
    },
  }
  assert.equal(storedStanding(items, 'brent', '46b7c3b0f3c54c37'), items.brent.standing)
  assert.equal(storedStanding(items, 'brent', 'a-new-identity'), '', 'a changed identity is written again')
  assert.equal(storedStanding(items, 'wti', '46b7c3b0f3c54c37'), '', 'another key is not looked at unless asked')
  assert.equal(storedStanding({ brent: { standingFingerprint: 'x', standing: '' } }, 'brent', 'x'), '', 'an empty one is no definition')
})

test('entries that share an identity come to share one sentence', () => {
  // content/.events-dispatch.json on 2026-10-09: the October and December
  // ECB decisions under one fingerprint, saying the council "meets eight
  // times a year" and "about every six weeks".
  const items = {
    'ecb-2026-10': { standingFingerprint: '644eb225dab9953a', prompt: 'p1', standing: 'The euro area’s central bank, whose Governing Council meets eight times a year.' },
    'ecb-2026-12': { standingFingerprint: '644eb225dab9953a', prompt: 'p1', standing: 'The Governing Council, which meets about every six weeks.' },
  }
  const opts = { shared: true, prompt: 'p1' }
  const first = items['ecb-2026-10'].standing
  assert.equal(storedStanding(items, 'ecb-2026-10', '644eb225dab9953a', opts), first)
  assert.equal(storedStanding(items, 'ecb-2026-12', '644eb225dab9953a', opts), first, 'the first in the file, for both')
  assert.equal(storedStanding(items, 'ecb-2027-01', '644eb225dab9953a', opts), first, 'and for a meeting never seen')
})

test('a definition written under another prompt is not kept', () => {
  // The events fingerprint is the identity alone. Without this a rewritten
  // rubric would reach `recent` and never a definition.
  const items = {
    'fomc-2026-10': { standingFingerprint: 'f', prompt: 'old', standing: 'Written under the old rubric.' },
    'fomc-2026-12': { standingFingerprint: 'f', standing: 'Written before entries recorded a prompt.' },
  }
  assert.equal(storedStanding(items, 'fomc-2026-10', 'f', { shared: true, prompt: 'new' }), '')
  assert.equal(storedStanding(items, 'fomc-2026-10', 'f', { shared: true, prompt: 'old' }), 'Written under the old rubric.')
})

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
