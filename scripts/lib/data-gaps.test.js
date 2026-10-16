import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { stormKind, dataGaps, FX_PCT, fxGaps, hazardGaps, loadDataGaps, MAX_GAPS, ODDS_POINTS, oddsGaps, readDataGaps, stormName } from './data-gaps.js'
import { namedStorms, pickTracked } from './tracked-stories.js'

const NOW = Date.parse('2026-10-16T18:00:00Z')

/** As `.gdacs.json` carried Champi on 2026-10-16. */
const storm = (over = {}) => ({
  eventid: '1001234',
  eventtype: 'TC',
  alertlevel: 'Orange',
  name: 'Tropical Cyclone CHAMPI-26',
  country: 'Guam',
  affectedCountries: ['Guam'],
  lat: 11.4,
  lng: 151.4,
  fromDate: '2026-10-14T12:00:00Z',
  toDate: '2026-10-16T12:00:00Z',
  severityText: 'Tropical Storm (maximum wind speed of 250 km/h)',
  severityValue: 249.9984,
  severityUnit: 'km/h',
  ...over,
})

const quake = (over = {}) => ({
  eventid: '1572024',
  eventtype: 'EQ',
  alertlevel: 'Orange',
  name: 'Earthquake in Tanzania',
  country: 'Tanzania',
  fromDate: '2026-10-16T16:17:25Z',
  toDate: '2026-10-16T16:17:25Z',
  severityText: 'Magnitude 6.4M, Depth:10km',
  severityValue: 6.4,
  severityUnit: 'M',
  ...over,
})

const PERIODS = ['Oct 8', 'Oct 9', 'Oct 10', 'Oct 11', 'Oct 12', 'Oct 13', 'Oct 14', 'Oct 15', 'Oct 16']

/** A contract whose price went from `from` to `to` over the nine days to Oct 16. */
const contract = (label, from, to, over = {}) => ({
  id: `poly-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`,
  label,
  source: 'polymarket',
  topicTags: ['prediction', 'polymarket', 'odds', 'ukraine'],
  countryTags: ['RU', 'UA'],
  periods: PERIODS,
  values: [from, from, from, from, from, from, to, to, to],
  asOf: '2026-10-16',
  endDate: '2026-11-30T23:59:00Z',
  ...over,
})

/** A currency row in units per dollar, `pct` higher at the end than a week before. */
const currency = (id, label, pct) => ({
  id,
  label,
  source: 'oer',
  periods: PERIODS,
  values: [5, 5, 5, 5, 5, 5, 5, 5, 5 * (1 + pct / 100)],
  asOf: '2026-10-16',
})

const story = (title, date, over = {}) => ({ title, date, lead: '', concepts: [], entities: [], entityIds: [], ...over })

test('a storm under a live Orange alert that no story names is a gap, asked for by its headline name', () => {
  const [gap] = hazardGaps([storm()], [], NOW)
  assert.equal(gap.line, '- Tropical cyclone Champi (Guam): GDACS Orange alert, live since 14 Oct; winds up to 250 km/h')
  assert.equal(gap.name, 'Champi')
  assert.deepEqual(gap.keywords, ['Typhoon Champi', 'Storm Champi'])
})

test('a storm a story of the week names has been reported', () => {
  const reported = story('Super Typhoon Champi nears Guam', '2026-10-15T10:00:00Z')
  assert.deepEqual(hazardGaps([storm()], [reported], NOW), [])
  // A story a fortnight old is not this week's report.
  assert.equal(hazardGaps([storm()], [{ ...reported, date: '2026-10-01T10:00:00Z' }], NOW).length, 1)
})

test('a Green alert, a drought and an alert that has passed are not gaps', () => {
  assert.deepEqual(hazardGaps([storm({ alertlevel: 'Green' })], [], NOW), [])
  assert.deepEqual(hazardGaps([storm({ eventtype: 'DR', name: 'Drought in Somalia' })], [], NOW), [])
  assert.deepEqual(hazardGaps([storm({ toDate: '2026-10-10T12:00:00Z' })], [], NOW), [])
})

test('an unnamed hazard is reported by a story naming its country and its kind, and asks Q6 for nothing', () => {
  const [gap] = hazardGaps([quake()], [], NOW)
  assert.equal(gap.line, '- Earthquake in Tanzania: GDACS Orange alert, live since 16 Oct; Magnitude 6.4M, Depth:10km')
  assert.equal(gap.name, null)
  assert.deepEqual(gap.keywords, [])
  // Tanzania's election is not the earthquake.
  assert.equal(hazardGaps([quake()], [story('Tanzania election: opposition barred', '2026-10-15')], NOW).length, 1)
  assert.deepEqual(hazardGaps([quake()], [story('Earthquake strikes northern Tanzania', '2026-10-16T17:00:00Z')], NOW), [])
})

test('Red alerts lead, then the newest, at most MAX_GAPS.hazards', () => {
  const alerts = [
    storm({ eventid: '1', name: 'Tropical Cyclone SIMON-26', fromDate: '2026-10-07T15:00:00Z' }),
    storm({ eventid: '2' }),
    quake({ eventid: '3', alertlevel: 'Red' }),
  ]
  assert.deepEqual(hazardGaps(alerts, [], NOW).map((g) => g.id), ['gdacs:3', 'gdacs:2'])
  assert.equal(MAX_GAPS.hazards, 2)
})

test('stormName reads GDACS names, and nothing else', () => {
  assert.equal(stormName(storm()), 'Champi')
  assert.equal(stormName({ name: 'Tropical Cyclone FOUR-E-26' }), 'Four-e')
  assert.equal(stormName(quake()), null)
})

test('a contract that swung ODDS_POINTS in a week with no story about its question is a gap', () => {
  const talks = contract('Russia-Ukraine peace talks by Nov 30, 2026?', 50, 19)
  const [gap] = oddsGaps([talks], [], NOW)
  assert.equal(gap.line, '- Polymarket, "Russia-Ukraine peace talks by Nov 30, 2026?": 50% → 19% in a week')
  assert.deepEqual(oddsGaps([contract('Russia-Ukraine peace talks?', 50, 50 - ODDS_POINTS + 1)], [], NOW), [])
})

test('a story the offer would give the contract to has reported its swing', () => {
  const vote = contract('Flávio Bolsonaro wins Brazil 2026?', 58, 83, { topicTags: ['election'], countryTags: ['BR'] })
  const covered = story('Bolsonaro leads first round as Lula concedes ground', '2026-10-15T10:00:00Z')
  assert.deepEqual(oddsGaps([vote], [covered], NOW), [])
  // A story that names neither the candidate nor the question is not about it.
  assert.equal(oddsGaps([vote], [story('Brazil senate passes 40-hour week', '2026-10-15')], NOW).length, 1)
})

test('a contract closing within days swings by design and is left out', () => {
  const closing = contract('Russia target Kyiv on October 17?', 53, 89, { endDate: '2026-10-17T23:59:00Z' })
  assert.deepEqual(oddsGaps([closing], [], NOW), [])
})

test('a currency is read as the currency moved: a row up 5% per dollar is the currency down', () => {
  const [gap] = fxGaps([currency('fx-brl', 'Brazilian real', 5)], [], NOW)
  assert.equal(gap.line, '- Brazilian real: down 4.8% against the dollar in a week')
  assert.deepEqual(fxGaps([currency('fx-brl', 'Brazilian real', FX_PCT - 1)], [], NOW), [])
})

test('a story tied to the currency, or naming it in full, has reported it', () => {
  const real = [currency('fx-brl', 'Brazilian real', 5)]
  assert.deepEqual(fxGaps(real, [story('Brazilian real slides as Lula trails', '2026-10-14')], NOW), [])
  assert.deepEqual(fxGaps(real, [story('Brazil cuts rates', '2026-10-14', { entityIds: ['fx-brl'] })], NOW), [])
  // "real" alone is an adjective.
  assert.equal(fxGaps(real, [story('A real test for Brazil', '2026-10-14')], NOW).length, 1)
})

test('dataGaps lists hazards, then contracts, then currencies', () => {
  const gaps = dataGaps({
    alerts: [storm()],
    indicators: [currency('fx-egp', 'Egyptian pound', 6), contract('Russia-Ukraine peace talks?', 50, 19)],
    now: NOW,
  })
  assert.deepEqual(gaps.map((g) => g.kind), ['hazard', 'odds', 'fx'])
})

test('a reported storm leaves the gaps; an unreported one gets a tracked slot of its own', () => {
  const storms = hazardGaps([storm()], [], NOW)
  const reports = [
    { uri: '1', url: 'u1', title: 'Super Typhoon Champi threatens Guam with 250 km/h winds', source: { uri: 'reuters.com' }, dateTimePub: '2026-10-16T15:00:00Z' },
    { uri: '2', url: 'u2', title: 'Storm Simon Harris to visit Washington', source: { uri: 'bbc.com' }, dateTimePub: '2026-10-16T14:00:00Z' },
  ]
  const [re] = namedStorms(storms)
  assert.ok(re.re.test(reports[0].title))
  assert.ok(!re.re.test('Champions League final'))
  const picked = pickTracked(reports, { named: namedStorms(storms), now: NOW, slots: 1 })
  assert.equal(picked[0][0].uri, '1')
})

test('loadDataGaps reads the snapshots, and says which it could not read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'data-gaps-'))
  const gdacsPath = join(dir, 'gdacs.json')
  writeFileSync(gdacsPath, JSON.stringify({ alerts: [storm()] }))
  const { gaps, skipped } = loadDataGaps({ now: NOW, gdacsPath, trendsPath: join(dir, 'missing.json'), articles: [] })
  assert.deepEqual(gaps.map((g) => g.id), ['gdacs:1001234'])
  assert.equal(skipped.length, 1)
  assert.match(skipped[0], /no trends snapshot/)
  assert.deepEqual(readDataGaps({ now: NOW, gdacsPath: join(dir, 'none.json'), trendsPath: null, articles: [] }), [])
})

test('a swing that happened early in the week and held is last week\'s news', () => {
  // The ceasefire contract jumped on Oct 9 and sat there: still 15 points over
  // seven days on Oct 16, none of it in the last three.
  const held = contract('Russia-Ukraine peace talks?', 50, 19, { values: [50, 19, 19, 19, 19, 19, 19, 19, 19] })
  assert.deepEqual(oddsGaps([held], [], NOW), [])
  const real = { ...currency('fx-brl', 'Brazilian real', 5), values: [5, 5.25, 5.25, 5.25, 5.25, 5.25, 5.25, 5.25, 5.25] }
  assert.deepEqual(fxGaps([real], [], NOW), [])
})

test('a contract tagged with no subject and no country is sport or a race, not news', () => {
  const sport = contract('Will Dallas Cowboys win the 2026 NFC East?', 27, 47, { topicTags: ['prediction', 'polymarket', 'odds'], countryTags: [] })
  assert.deepEqual(oddsGaps([sport], [], NOW), [])
})

test('a storm is asked for by what its basin calls one', () => {
  assert.equal(stormKind({ lat: 11.4, lng: 151.4 }), 'Typhoon')
  assert.equal(stormKind({ lat: 20.6, lng: -109.5 }), 'Hurricane')
  assert.equal(stormKind({ lat: 15, lng: 88 }), 'Cyclone')
  assert.equal(stormKind({ lat: -18, lng: 150 }), 'Cyclone')
})
