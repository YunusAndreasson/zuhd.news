// Run: node --test scripts/lib/snapshot-stage.test.js
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseCycleLog } from './cycle-log.js'
import { Degrade, Skip, snapshotStage } from './snapshot-stage.js'

const dir = mkdtempSync(join(tmpdir(), 'snapshot-stage-'))
const NOW = Date.parse('2026-10-09T10:00:00.000Z')
const HOUR = 3600_000

/** A snapshot file of its own for a test, holding `previous` when one is given. */
let files = 0
const fileWith = (previous) => {
  const path = join(dir, `snapshot-${++files}.json`)
  if (previous !== undefined) writeFileSync(path, typeof previous === 'string' ? previous : JSON.stringify(previous))
  return path
}

/** Run `fn` and return what it printed beside what it returned. */
async function printed(fn) {
  const lines = { out: [], err: [] }
  const { log, error } = console
  console.log = (line) => lines.out.push(line)
  console.error = (line) => lines.err.push(line)
  try {
    return { result: await fn(), ...lines }
  } finally {
    Object.assign(console, { log, error })
  }
}

const some = (s) => s.alerts.length === 0
const LAST = { generated: '2026-10-09T05:11:06.474Z', alerts: [{ id: 'old' }] }

test('what the fetcher returns is written, and the last snapshot is handed to it', async () => {
  const path = fileWith(LAST)
  let handed
  const { result, out, err } = await printed(() =>
    snapshotStage('fetch-x', 'gdacs', ({ previous }) => {
      handed = previous
      return { generated: 'now', alerts: [{ id: 'new' }] }
    }, { isEmpty: some, pretty: false, path }),
  )
  assert.deepEqual(handed, LAST)
  assert.equal(result.written, true)
  assert.deepEqual(result.snapshot.alerts, [{ id: 'new' }])
  assert.equal(readFileSync(path, 'utf8'), '{"generated":"now","alerts":[{"id":"new"}]}\n')
  assert.deepEqual([out, err], [[], []], 'it prints nothing of its own on a good run')
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), [], 'written through writeJson')
})

test('a fetch that says it failed keeps the last snapshot, in a line the dashboard counts', async () => {
  const path = fileWith(LAST)
  const before = readFileSync(path, 'utf8')
  const { result, err } = await printed(() =>
    snapshotStage('fetch-gdacs', 'gdacs', () => {
      throw new Degrade('list fetch failed (HTTP 503)')
    }, { isEmpty: some, path }),
  )
  assert.equal(readFileSync(path, 'utf8'), before)
  assert.deepEqual(result, { written: false, previous: LAST, degraded: 'list fetch failed (HTTP 503)' })
  assert.deepEqual(err, ['  ✗ fetch-gdacs: list fetch failed (HTTP 503) — keeping the snapshot of 2026-10-09T05:11:06.474Z'])
  // `✗ name: message` is what the cycle log's parser files under a stage. The
  // dozen lines the fetchers wrote by hand had no name in them, and were never
  // counted.
  assert.deepEqual(parseCycleLog(err.join('\n')).marks.map((m) => m.name), ['fetch-gdacs'])
})

test('an empty result is never written over a snapshot', async () => {
  // The rule three fetchers did not keep: `alerts: []` after a 200 is a changed
  // response, and published it is an empty layer.
  const path = fileWith(LAST)
  const { result, err } = await printed(() =>
    snapshotStage('fetch-gdacs', 'gdacs', () => ({ generated: 'now', alerts: [] }), { isEmpty: some, path }),
  )
  assert.equal(result.written, false)
  assert.equal(result.degraded, 'the result is empty')
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), LAST)
  assert.match(err[0], /^ {2}✗ fetch-gdacs: the result is empty — keeping the snapshot of 2026-10-09T05:11:06\.474Z$/)

  // And a fetcher has to say what empty is. There is no default that is safe.
  const untyped = /** @type {any} */ (snapshotStage)
  await assert.rejects(() => untyped('fetch-x', 'gdacs', () => ({}), { path }), /isEmpty is required/)
  await assert.rejects(() => untyped('fetch-x', 'gdacs', () => ({})), /isEmpty is required/)
})

test('a first run with nothing to keep says so, and writes nothing', async () => {
  const path = fileWith()
  const { result, err } = await printed(() =>
    snapshotStage('fetch-x', 'gdacs', () => {
      throw new Degrade('no rows')
    }, { isEmpty: some, path }),
  )
  assert.deepEqual(result, { written: false, previous: null, degraded: 'no rows' })
  assert.deepEqual(err, ['  ✗ fetch-x: no rows — and there is no snapshot to keep'])
  assert.equal(readdirSync(dir).includes(path.split('/').pop()), false)
})

test('a bug is not a degradation: it is thrown on, and the status is the one it always was', async () => {
  const path = fileWith(LAST)
  const { out, err } = await printed(async () => {
    await assert.rejects(
      () => snapshotStage('fetch-x', 'gdacs', () => /** @type {any} */ (undefined).alerts, { isEmpty: some, path }),
      TypeError,
    )
  })
  assert.deepEqual([out, err], [[], []], 'node prints the stack; this adds no line that reads like a kept snapshot')
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), LAST)
})

test('a missing key is a skip, not a failure', async () => {
  const path = fileWith(LAST)
  const { result, out, err } = await printed(() =>
    snapshotStage('fetch-firms', 'firms', () => {
      throw new Skip('FIRMS_MAP_KEY not set')
    }, { isEmpty: () => false, path }),
  )
  assert.deepEqual(result, { written: false, previous: LAST, skipped: 'FIRMS_MAP_KEY not set' })
  assert.deepEqual(out, ['fetch-firms: FIRMS_MAP_KEY not set — skipping, previous snapshot kept'])
  assert.deepEqual(err, [], 'no ✗: nothing went wrong')
})

test('a snapshot inside its freshness window stands, by its own stamp', async () => {
  const asked = () => assert.fail('the source was asked')
  const fresh = { generated: new Date(NOW - 5 * HOUR).toISOString(), ucdpVersion: '26.0.8', alerts: [1] }
  const gate = { isEmpty: some, freshFor: 6 * HOUR, now: NOW }

  const { result, out } = await printed(() => snapshotStage('fetch-conflict', 'conflict', asked, { ...gate, path: fileWith(fresh) }))
  assert.deepEqual(result, { written: false, previous: fresh, skipped: 'fresh' })
  assert.deepEqual(out, ['fetch-conflict: the snapshot is 5.0h old, under 6.0h — keeping it'])

  const next = () => ({ generated: 'now', alerts: [2] })
  const run = async (options, /** @type {any} */ previous = fresh) =>
    (await printed(() => snapshotStage('fetch-conflict', 'conflict', next, { ...gate, ...options, path: fileWith(previous ?? undefined) }))).result.written
  assert.equal(await run({ freshFor: 4 * HOUR }), true, 'past the window')
  assert.equal(await run({ force: true }), true, 'asked to')
  // A bumped pin fetches now, not up to six hours later.
  assert.equal(await run({ freshIf: (p) => p.ucdpVersion === '26.0.9' }), true)
  assert.equal(await run({ freshIf: (p) => p.ucdpVersion === '26.0.8' }), false)
  // The other stamp: one fetcher's `generated` is held still by the build.
  assert.equal(await run({ freshBy: 'fetched' }, { fetched: fresh.generated, alerts: [1] }), false)
  assert.equal(await run({ freshBy: 'fetched' }), true, 'no such stamp is no freshness')
  // A stamp from the future would otherwise stand until the clock reached it.
  assert.equal(await run({}, { generated: new Date(NOW + HOUR).toISOString(), alerts: [1] }), true)
  assert.equal(await run({}, null), true, 'and no snapshot is not a fresh one')
})

test('a snapshot that does not parse is no snapshot: the source is asked, and the file replaced', async () => {
  const path = fileWith('{"generated": "2026-10-09T05:11:06.474Z", "alerts": [')
  let handed = 'unset'
  const { result } = await printed(() =>
    snapshotStage('fetch-x', 'gdacs', ({ previous }) => {
      handed = previous
      return { generated: 'now', alerts: [1] }
    }, { isEmpty: some, freshFor: 6 * HOUR, now: NOW, path }),
  )
  assert.equal(handed, null)
  assert.equal(result.written, true)
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).alerts, [1])
})
