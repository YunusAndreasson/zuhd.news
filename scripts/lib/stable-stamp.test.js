import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { holdStamp, openStampLedger } from './stable-stamp.js'

// What the build publishes, as it publishes it.
const bytes = (payload) => JSON.stringify(payload)

const famine = (generated, areas = [{ id: 'SDN-1', phase: 5 }]) => ({
  generated,
  source: 'IPC',
  areas,
})

test('an unchanged payload is published with the stamp it had, byte for byte', () => {
  const first = holdStamp(undefined, famine('2026-10-02T14:00:00.000Z'))
  assert.equal(first.payload.generated, '2026-10-02T14:00:00.000Z')

  // The next build: the same famine table, four hours on.
  const second = holdStamp(first.entry, famine('2026-10-02T18:00:00.000Z'))
  assert.equal(second.payload.generated, '2026-10-02T14:00:00.000Z')
  // The same bytes are the same ETag, which is the whole point.
  assert.equal(bytes(second.payload), bytes(first.payload))
  assert.deepEqual(second.entry, first.entry)
})

test('a changed payload takes its own stamp', () => {
  const first = holdStamp(undefined, famine('2026-10-02T14:00:00.000Z'))
  const moved = famine('2026-10-02T18:00:00.000Z', [{ id: 'SDN-1', phase: 4 }])
  const second = holdStamp(first.entry, moved)
  assert.equal(second.payload.generated, '2026-10-02T18:00:00.000Z')
  assert.notEqual(second.entry.hash, first.entry.hash)

  // And is held from there.
  const third = holdStamp(
    second.entry,
    famine('2026-10-02T22:00:00.000Z', [{ id: 'SDN-1', phase: 4 }]),
  )
  assert.equal(third.payload.generated, '2026-10-02T18:00:00.000Z')
})

test('the stamp keeps its place among the keys', () => {
  const first = holdStamp(undefined, { version: 1, generatedAt: 'a', signals: [] }, 'generatedAt')
  const second = holdStamp(first.entry, { version: 1, generatedAt: 'b', signals: [] }, 'generatedAt')
  assert.deepEqual(Object.keys(second.payload), ['version', 'generatedAt', 'signals'])
  assert.equal(second.payload.generatedAt, 'a')
})

test('a payload with no stamp is left alone', () => {
  const genocide = { situations: [{ id: 'gaza' }] }
  const held = holdStamp(undefined, genocide)
  assert.equal(held.payload, genocide)
  assert.equal(held.entry, undefined)
})

test('the ledger carries a stamp from one build to the next', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stable-stamp-'))
  const path = join(dir, 'nested', 'api-stamps.json')
  try {
    const build1 = openStampLedger(path)
    const a = build1.hold('ipc', famine('2026-10-02T14:00:00.000Z'))
    const c = build1.hold('conflict', { generated: 'c1', events: [1] })
    build1.save()

    // A second process, a later build: famine unchanged, and conflict's source
    // missing this cycle, so it is never asked about.
    const build2 = openStampLedger(path)
    const b = build2.hold('ipc', famine('2026-10-02T18:00:00.000Z'))
    assert.equal(bytes(b), bytes(a))
    build2.save()

    // Conflict returns unchanged a build later, with the stamp it left with.
    const build3 = openStampLedger(path)
    assert.equal(build3.hold('conflict', { generated: 'c3', events: [1] }).generated, c.generated)
    // One file's ledger entry never answers for another.
    assert.equal(build3.hold('gdacs', { generated: 'g3', events: [1] }).generated, 'g3')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a missing or corrupt ledger costs one fresh stamp, not the build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stable-stamp-'))
  const path = join(dir, 'api-stamps.json')
  try {
    assert.equal(openStampLedger(path).hold('ipc', famine('x')).generated, 'x')

    writeFileSync(path, '{"ipc": {"hash": "tru')
    const error = console.error
    console.error = () => {}
    try {
      const ledger = openStampLedger(path)
      assert.equal(ledger.hold('ipc', famine('y')).generated, 'y')
      ledger.save()
    } finally {
      console.error = error
    }
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).ipc.stamp, 'y')

    // An entry of the wrong shape is not trusted either.
    writeFileSync(path, JSON.stringify({ ipc: { hash: 42 }, firms: 'nope' }))
    const ledger = openStampLedger(path)
    assert.equal(ledger.hold('ipc', famine('z')).generated, 'z')
    assert.equal(ledger.hold('firms', famine('z')).generated, 'z')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
