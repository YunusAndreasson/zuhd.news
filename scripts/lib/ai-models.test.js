import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AI_LABS } from './ai-lab-metadata.js'
import {
  AI_LAB_STALE_DAYS,
  aiModelsPayload,
  aiModelsSnapshot,
  labFrontier,
  latestReport,
  scoredModels,
} from './ai-models.js'
import { csvObjects } from './csv.js'

const NOW = Date.UTC(2026, 9, 4)

const LABS = [
  { id: 'alpha', name: 'Alpha', epochOrgs: ['Alpha Labs', 'Alpha'], companyName: 'Alpha Inc', iso2: 'US', blurb: 'x' },
  { id: 'beta', name: 'Beta', epochOrgs: ['Beta'], iso2: 'CN', blurb: 'y' },
]

const ECI_HEADER = 'Model,Display name,eci,eci_ci_low,eci_ci_high,date,Organization,Country (of organization)'
const eciRow = (name, score, date, org) => `${name},${name},${score},${score - 2},${score + 3},${date},${org},`

/** A scores file: the named rows, padded past the file's sanity floor with a
 *  lab nobody follows. */
function eciFile(rows) {
  const filler = Array.from({ length: 100 }, (_, i) => eciRow(`filler-${i}`, 50 + i / 10, '2024-01-01', 'Nobody'))
  return [ECI_HEADER, ...rows, ...filler].join('\n')
}

const ALPHA = [
  eciRow('A1', 120, '2025-01-10', 'Alpha'),
  eciRow('A2', 131.26, '2025-11-02', '"Alpha Labs,Someone Else"'),
  // Released later, scored lower: not a new best.
  eciRow('A2 mini', 125, '2026-03-01', 'Alpha Labs'),
  eciRow('A3', 150.04, '2026-08-20', 'Alpha Labs'),
]
const BETA = [eciRow('B1', 110, '2025-06-01', 'Beta'), eciRow('B2', 140, '2026-05-05', 'Beta')]

const build = (files, opts = {}) => aiModelsSnapshot(files, { labs: LABS, now: NOW, ...opts })

// ── the catalog ────────────────────────────────────────────────────────────

test('every lab has what its card needs, and no string is claimed twice', () => {
  const ids = new Set()
  const orgs = new Set()
  for (const lab of AI_LABS) {
    for (const key of ['id', 'name', 'iso2', 'blurb']) {
      assert.ok(typeof lab[key] === 'string' && lab[key].trim(), `${lab.id}: ${key}`)
    }
    assert.ok(!ids.has(lab.id), `${lab.id} listed twice`)
    ids.add(lab.id)
    assert.match(lab.iso2, /^[A-Z]{2}$/)
    assert.ok(lab.epochOrgs.length > 0, `${lab.id}: no organization string`)
    for (const org of lab.epochOrgs) {
      assert.ok(!orgs.has(org), `${org} is two labs'`)
      // The file separates a model's organizations with commas.
      assert.ok(!org.includes(','), `${lab.id}: ${org}`)
      orgs.add(org)
    }
    // The app drops a card with nothing under its chart; the companies' bounds.
    assert.ok(lab.blurb.length > 40, `${lab.id}: blurb`)
    assert.ok(lab.blurb.length <= 240, `${lab.id}: blurb is ${lab.blurb.length} characters, cap 240`)
    // Written to stay true: a score, a version or a year goes stale.
    assert.doesNotMatch(lab.blurb, /\d/, `${lab.id}: a number in the standing sentence`)
  }
})

// ── reading the files ──────────────────────────────────────────────────────

test('a row without a score, a day or a name is not a scored model', () => {
  const rows = csvObjects(
    [ECI_HEADER, eciRow('ok', 100, '2026-01-01', 'Alpha'), eciRow('no score', '', '2026-01-01', 'Alpha'), eciRow('no day', 90, '', 'Alpha')].join('\n'),
    ['eci'],
  )
  assert.deepEqual(
    scoredModels(rows).map((m) => m.name),
    ['ok'],
  )
})

test('a lab’s line is its best at each release that raised it', () => {
  const models = scoredModels(csvObjects([ECI_HEADER, ...ALPHA].join('\n'), ['eci']))
  assert.deepEqual(labFrontier(models), {
    periods: ['2025-01-10', '2025-11-02', '2026-08-20'],
    values: [120, 131.3, 150],
    models: ['A1', 'A2', 'A3'],
  })
})

test('two releases on one day are one point: the better', () => {
  const models = scoredModels(
    csvObjects([ECI_HEADER, eciRow('small', 100, '2026-01-01', 'Alpha'), eciRow('large', 110, '2026-01-01', 'Alpha')].join('\n'), ['eci']),
  )
  assert.deepEqual(labFrontier(models), { periods: ['2026-01-01'], values: [110], models: ['large'] })
})

// ── the snapshot ───────────────────────────────────────────────────────────

test('labs are published highest first, each with the model that holds its best', () => {
  const { snapshot } = build({ eci: eciFile([...ALPHA, ...BETA]) })
  assert.deepEqual(
    snapshot.labs.map((l) => [l.id, l.model, l.score, l.asOf]),
    [
      ['alpha', 'A3', 150, '2026-08-20'],
      ['beta', 'B2', 140, '2026-05-05'],
    ],
  )
  assert.deepEqual([snapshot.labs[0].low, snapshot.labs[0].high], [148, 153])
  assert.deepEqual(snapshot.frontier, { score: 150, model: 'A3', lab: 'Alpha' })
  assert.equal(snapshot.models, 106)
  assert.deepEqual(snapshot.skipped, [])
})

test('a model filed under two organizations is the lab’s when one of them is', () => {
  const { snapshot } = build({ eci: eciFile([...ALPHA, ...BETA]) })
  assert.ok(snapshot.labs[0].series.models.includes('A2'))
})

test('a lab is left out, and said to be, when its newest model is over a year old', () => {
  const old = [eciRow('B1', 110, '2024-06-01', 'Beta'), eciRow('B2', 140, '2025-09-01', 'Beta')]
  const { snapshot } = build({ eci: eciFile([...ALPHA, ...old]) })
  assert.deepEqual(
    snapshot.labs.map((l) => l.id),
    ['alpha'],
  )
  assert.deepEqual(snapshot.skipped, [{ id: 'beta', reason: 'newest scored model is from 2025-09-01' }])
  assert.equal(AI_LAB_STALE_DAYS, 365)
})

test('a lab with one release, or none under its name, is left out', () => {
  const { snapshot } = build({ eci: eciFile([...ALPHA, eciRow('B1', 110, '2026-06-01', 'Beta')]) })
  assert.match(snapshot.skipped[0].reason, /one scored release/)
  const none = build({ eci: eciFile(ALPHA) })
  assert.match(none.snapshot.skipped[0].reason, /no scored model under its name/)
})

test('a scores file that is not the file is rejected whole', () => {
  assert.match(build({ eci: [ECI_HEADER, ...ALPHA].join('\n') }).rejected, /4 scored models/)
  assert.match(build({ eci: 'Model,eci\nx,1\n' }).rejected, /missing columns/)
  assert.match(build({ eci: eciFile([]) }).rejected, /no lab had a usable line/)
})

// ── money ──────────────────────────────────────────────────────────────────

const REVENUE = [
  'Company,Date,Annualized revenue (USD),Scope,Confidence',
  'Alpha Inc,2026-03-01,1000000000,Full company,Confident',
  'Alpha Inc,2026-07-31,3000000000.0,Full company,Likely',
  // A product's revenue is not the company's.
  'Alpha Inc,2026-09-01,9000000000,Product/division,Confident',
  // No date: a row Epoch has not finished.
  'Alpha Inc,,5000000000,Full company,Confident',
  'Beta,2026-08-01,7000000000,Full company,Confident',
].join('\n')
const FUNDING = [
  'Company,Close date,Status,Valuation (post-money),Confidence',
  'Alpha Inc,2026-05-28,Closed,50000000000,Confident',
  'Alpha Inc,2026-05-28,Closed,80000000000,Confident',
  'Alpha Inc,2026-09-30,Rumored,200000000000,Likely',
].join('\n')

test('a lab’s money is its newest dated full-company report', () => {
  const { snapshot } = build({ eci: eciFile([...ALPHA, ...BETA]), revenue: REVENUE, funding: FUNDING })
  const [alpha, beta] = snapshot.labs
  assert.deepEqual(alpha.revenue, { usd: 3_000_000_000, asOf: '2026-07-31', confidence: 'Likely' })
  // Two rounds closed on one day: the larger. A rumoured round is not a round.
  assert.deepEqual(alpha.valuation, { usd: 80_000_000_000, asOf: '2026-05-28', confidence: 'Confident' })
  // Beta has no `companyName`: a row under its name is not joined by accident.
  assert.equal(beta.revenue, undefined)
  assert.equal(beta.valuation, undefined)
})

test('a report over a year old is not printed as the lab’s revenue', () => {
  const rows = csvObjects('Company,Date,Annualized revenue (USD),Scope,Confidence\nAlpha Inc,2025-09-30,4,Full company,Likely\n', ['Company'])
  const spec = { company: 'Alpha Inc', dateKey: 'Date', valueKey: 'Annualized revenue (USD)' }
  assert.equal(latestReport(rows, { ...spec, since: '2025-10-04' }), null)
  assert.deepEqual(latestReport(rows, spec), { usd: 4, asOf: '2025-09-30', confidence: 'Likely' })
})

test('a company file that fails keeps the figures the last snapshot had', () => {
  const eci = eciFile([...ALPHA, ...BETA])
  const previous = build({ eci, revenue: REVENUE, funding: FUNDING }).snapshot
  const { snapshot, notes } = build({ eci, revenue: null, funding: 'not,the,file\n1,2,3\n' }, { previous })
  assert.deepEqual(snapshot.labs[0].revenue, previous.labs[0].revenue)
  assert.deepEqual(snapshot.labs[0].valuation, previous.labs[0].valuation)
  assert.match(notes.join(' '), /funding: missing columns/)
  // …but not for ever: a kept figure ages out like a fetched one.
  const later = aiModelsSnapshot(
    { eci: eciFile([...ALPHA, ...BETA, eciRow('A4', 160, '2027-08-01', 'Alpha')]) },
    { labs: LABS, now: Date.UTC(2027, 8, 1), previous },
  ).snapshot
  assert.equal(later.labs[0].revenue, undefined)
})

// ── what is published ──────────────────────────────────────────────────────

test('the published file is the same bytes for the same data, whenever it was fetched', () => {
  const files = { eci: eciFile([...ALPHA, ...BETA]), revenue: REVENUE, funding: FUNDING }
  const a = aiModelsPayload(build(files).snapshot)
  const b = aiModelsPayload(aiModelsSnapshot(files, { labs: LABS, now: NOW + 86400_000 }).snapshot)
  assert.equal('fetched' in a, false)
  const { generated: _a, ...restA } = a
  const { generated: _b, ...restB } = b
  assert.equal(JSON.stringify(restA), JSON.stringify(restB))
})
