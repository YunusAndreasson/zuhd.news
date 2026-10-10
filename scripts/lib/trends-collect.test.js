// Run: node --test scripts/lib/trends-collect.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectRows } from './trends-collect.js'

const NOW = Date.parse('2026-10-09T10:08:00Z')

/** A registry row, and the series a fetch of it answers. */
const reg = (id, source, seriesId = id.toUpperCase()) => ({
  id,
  label: id,
  unit: '$',
  source,
  seriesId,
  cadence: /** @type {'daily'} */ ('daily'),
  topicTags: [id],
  sourceLabel: source,
})
const data = (last, asOf = '2026-10-09') => ({ values: [last - 1, last], periods: ['Oct 8', 'Oct 9'], asOf })

const registry = [reg('brent', 'prices'), reg('wti', 'prices'), reg('gas', 'prices'), reg('pkr', 'fx'), reg('ngn', 'fx'), reg('boe', 'rates', 'GB'), reg('boj', 'rates', 'JP')]

/** The snapshot the previous cycle left: every registry row, and a contract. */
const prior = {
  fetchedAt: '2026-10-09T05:12:00.000Z',
  asOf: '2026-10-09',
  indicators: [
    ...registry.map((r) => ({ ...r, ...data(50, '2026-10-08') })),
    { id: 'poly-old', source: 'odds', seriesId: 'old', values: [40, 41], periods: ['Oct 8', 'Oct 9'], asOf: '2026-10-09' },
  ],
}

const quiet = { log() {}, warn() {}, error() {} }
/** What was said, for the tests that read it. */
const heard = () => {
  /** @type {string[]} */
  const lines = []
  const say = (line) => {
    lines.push(String(line))
  }
  return { lines, say: { log: say, warn: say, error: say } }
}

/** The sources as a healthy run answers them. `over` replaces one or more. */
const sources = (over = {}) =>
  /** @type {Record<string, import('./trends-registry.js').SourceDef>} */ ({
    prices: { mode: 'perIndicator', requiredEnv: [], fetcher: async () => data(90) },
    fx: { mode: 'batched', requiredEnv: [], fetcher: async () => ({ PKR: data(278), NGN: data(1500) }) },
    odds: { mode: 'dynamic', requiredEnv: [], fetcher: async () => [{ id: 'poly-new', source: 'odds', values: [10, 12], periods: ['Oct 8', 'Oct 9'] }] },
    rates: { mode: 'batched', requiredEnv: [], fetcher: async () => ({ GB: data(4), JP: data(1) }) },
    ...over,
  })

const run = (over, opts = {}) => collectRows({ sources: sources(over), registry, prior, now: NOW, say: quiet, ...opts })
const ids = (rows) => rows.map((r) => r.id)
const ALL = ['brent', 'wti', 'gas', 'pkr', 'ngn', 'poly-new', 'boe', 'boj']

test('the rows come out in the sources’ order, then the registry’s', async () => {
  const { indicators, carried } = await run({})
  assert.deepEqual(ids(indicators), ALL)
  assert.deepEqual(carried, [])
  // A fresh row is the registry's entry and the fetched series, and no more.
  assert.deepEqual(indicators[0], {
    id: 'brent',
    label: 'brent',
    unit: '$',
    source: 'prices',
    seriesId: 'BRENT',
    cadence: 'daily',
    topicTags: ['brent'],
    countryTags: [],
    defaultHighlight: 'last',
    sourceLabel: 'prices',
    values: [89, 90],
    periods: ['Oct 8', 'Oct 9'],
    asOf: '2026-10-09',
  })
})

test('a row whose fetch returns nothing takes the previous snapshot’s, in its place', async () => {
  const { indicators, carried } = await run({
    prices: { mode: 'perIndicator', requiredEnv: [], fetcher: async (ind) => (ind.id === 'wti' ? null : data(90)) },
  })
  assert.deepEqual(ids(indicators), ALL)
  assert.deepEqual(ids(carried), ['wti'])
  const wti = indicators[1]
  assert.deepEqual([wti.values.at(-1), wti.asOf, wti.fetchedAt], [50, '2026-10-08', '2026-10-09T05:12:00.000Z'])
  assert.equal(indicators[0].fetchedAt, undefined, 'a fetched row has no time of its own')
})

test('a batch is carried when its call failed, and not when it answered without a series', async () => {
  const failed = await run({ fx: { mode: 'batched', requiredEnv: [], fetcher: async () => null } })
  assert.deepEqual(ids(failed.indicators), ALL)
  assert.deepEqual(ids(failed.carried), ['pkr', 'ngn'])
  // The BIS fetcher leaves out a rate older than its staleness bar. That is
  // its answer, and the old row must not be printed over it.
  const refused = await run({ rates: { mode: 'batched', requiredEnv: [], fetcher: async () => ({ GB: data(4) }) } })
  assert.deepEqual(ids(refused.indicators), ['brent', 'wti', 'gas', 'pkr', 'ngn', 'poly-new', 'boe'])
  assert.deepEqual(refused.carried, [])
})

test('a source that throws costs its own unanswered rows and nobody else’s', async () => {
  const { lines, say } = heard()
  let asked = 0
  const { indicators, carried } = await run(
    {
      prices: {
        mode: 'perIndicator',
        requiredEnv: [],
        fetcher: async () => {
          if (++asked === 2) throw new TypeError("Cannot read properties of null (reading 'p')")
          return data(90)
        },
      },
    },
    { say },
  )
  // The row fetched before the throw is fresh, the two after it are the
  // previous snapshot's, and the three sources after it still ran.
  assert.deepEqual(ids(indicators), ALL)
  assert.deepEqual(ids(carried), ['wti', 'gas'])
  assert.equal(indicators[0].values.at(-1), 90)
  assert.equal(indicators[7].values.at(-1), 1)
  assert.ok(lines.some((l) => /✗ prices: TypeError: Cannot read properties of null/.test(l)), lines.join('\n'))
})

test('a dynamic source is handed its own rows of the previous snapshot, and a throw from it is its own', async () => {
  let handed
  await run({
    odds: {
      mode: 'dynamic',
      requiredEnv: [],
      fetcher: async (o) => {
        handed = o
        return []
      },
    },
  })
  assert.deepEqual(ids(handed.incumbents), ['poly-old'])

  const thrown = await run({
    odds: {
      mode: 'dynamic',
      requiredEnv: [],
      fetcher: async () => {
        throw new Error('HTTP 502')
      },
    },
  })
  assert.deepEqual(ids(thrown.indicators), ['brent', 'wti', 'gas', 'pkr', 'ngn', 'boe', 'boj'])
  // A source with nothing to say answers null or an empty list: no rows, no error.
  const nothing = await run({ odds: { mode: 'dynamic', requiredEnv: [], fetcher: async () => null } })
  assert.deepEqual(ids(nothing.indicators), ['brent', 'wti', 'gas', 'pkr', 'ngn', 'boe', 'boj'])
})

test('a source with no key is skipped with a warning and stands on the previous snapshot', async () => {
  const { lines, say } = heard()
  const keyed = { prices: { mode: 'perIndicator', requiredEnv: ['PRICES_KEY'], fetcher: async (_ind, key) => (key === 'k' ? data(90) : null) } }
  const without = await run(keyed, { env: {}, say })
  assert.deepEqual(ids(without.carried), ['brent', 'wti', 'gas'])
  assert.ok(lines.some((l) => /prices: missing env PRICES_KEY/.test(l)))
  const withKey = await run(keyed, { env: { PRICES_KEY: 'k' } })
  assert.deepEqual(withKey.carried, [])
  assert.equal(withKey.indicators[0].values.at(-1), 90)
})

test('with no previous snapshot a failed row is simply absent, as it was', async () => {
  const { indicators, carried } = await collectRows({
    sources: sources({ prices: { mode: 'perIndicator', requiredEnv: [], fetcher: async (ind) => (ind.id === 'wti' ? null : data(90)) } }),
    registry,
    prior: null,
    now: NOW,
    say: quiet,
  })
  assert.deepEqual(ids(indicators), ['brent', 'gas', 'pkr', 'ngn', 'poly-new', 'boe', 'boj'])
  assert.deepEqual(carried, [])
})

test('a series that names where it is from is published as that, not as the registry’s', async () => {
  // A futures row answered by its fallback (`trends-sources/futures.js`).
  const fallback = { ...data(125), source: 'spot', seriesId: 'SPOT-BRENT', sourceLabel: 'the spot series' }
  const { indicators } = await run({
    prices: { mode: 'perIndicator', requiredEnv: [], fetcher: async (ind) => (ind.id === 'brent' ? fallback : data(90)) },
  })
  const brent = indicators.find((r) => r.id === 'brent')
  assert.deepEqual([brent.source, brent.seriesId, brent.sourceLabel], ['spot', 'SPOT-BRENT', 'the spot series'])
  assert.equal(brent.label, 'brent')
  // Its neighbour is the registry's own.
  const wti = indicators.find((r) => r.id === 'wti')
  assert.deepEqual([wti.source, wti.seriesId, wti.sourceLabel], ['prices', 'WTI', 'prices'])
})

test('a source’s `after` is handed its own rows, carried ones too, and a throw from it is its own', async () => {
  /** @type {string[][]} */
  const seen = []
  const { indicators } = await run({
    // `wti` has no fresh answer: it is carried, and `after` still sees it.
    prices: {
      mode: 'perIndicator',
      requiredEnv: [],
      fetcher: async (ind) => (ind.id === 'wti' ? null : data(90)),
      after: (rows) => {
        seen.push(ids(rows))
        rows[0].asOf = 'settled'
      },
    },
    fx: {
      mode: 'batched',
      requiredEnv: [],
      fetcher: async () => ({ PKR: data(278), NGN: data(1500) }),
      after: () => {
        throw new Error('after failed')
      },
    },
  })
  assert.deepEqual(seen, [['brent', 'wti', 'gas']])
  assert.equal(indicators.find((r) => r.id === 'brent').asOf, 'settled')
  // The source whose `after` threw keeps its rows, and so does everyone after it.
  assert.deepEqual(ids(indicators), ALL)
})

test('a row that says how many places it is published to is rounded to them, and says so', async () => {
  const rates = [{ ...reg('cpi', 'prices'), decimals: 1 }, reg('wti', 'prices')]
  const { indicators } = await collectRows({
    sources: { prices: { mode: 'perIndicator', requiredEnv: [], fetcher: async () => ({ values: [3.30386, 3.35302], periods: ['Jul 2026', 'Aug 2026'], asOf: '2026-08-01' }) } },
    registry: rates,
    prior: null,
    now: NOW,
    say: quiet,
  })
  const [cpi, wti] = indicators
  assert.deepEqual([cpi.values, cpi.decimals], [[3.3, 3.4], 1])
  // A row that declares none is as its source gave it, and gains no key.
  assert.deepEqual(wti.values, [3.30386, 3.35302])
  assert.equal('decimals' in wti, false)
})
