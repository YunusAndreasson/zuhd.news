// The famine layer's arithmetic.
//
// Each test pins one way this could be wrong while still producing a map that
// looks fine, which is the whole hazard of a classification feed: a phase is a
// small integer, so every mistake here renders as a perfectly plausible mark in
// a plausible place, at a severity nobody can check by looking.
//
// The two that matter most are the phase rule and the publication bar. Deriving
// the phase from the population columns draws the world as mostly fine; taking
// `overall_phase >= 4` as the bar goes silent on Gaza. Both were live findings
// against a real payload, and both are pinned here in the direction that failed.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AGE_LIMIT_MONTHS,
  PHASE_NAMES,
  PUBLISH_MIN_PHASE,
  analysisAgeMonths,
  featureClassification,
  gateByAge,
  joinAreas,
  normaliseAreaName,
  parseAnalysisDate,
  parseIpcAreaCsv,
  publishable,
  windowCoveringDay,
} from './ipc.js'

const NOW = Date.UTC(2026, 6, 30)

/** The published header, in the order the file actually carries it. */
const HEADER = [
  'Date of analysis', 'Country', 'Total country population', 'Level 1', 'Area',
  'Current from', 'Current to', 'Population analyzed current',
  'Phase 3+ number current', 'Phase 3+ percentage current',
  'Phase 1 number current', 'Phase 1 percentage current',
  'Phase 2 number current', 'Phase 2 percentage current',
  'Phase 3 number current', 'Phase 3 percentage current',
  'Phase 4 number current', 'Phase 4 percentage current',
  'Phase 5 number current', 'Phase 5 percentage current',
  'First projection from', 'First projection to',
  'Second projection from', 'Second projection to',
].join(',')

const row = ({
  analysis = 'Apr 2026',
  country = 'SOM',
  level1 = 'Bay',
  area = 'Bay Urban IDPs (Baydhaba)',
  from = '2026-04-01',
  to = '2026-06-30',
  p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0,
  proj1 = ['', ''],
  proj2 = ['', ''],
} = {}) =>
  [
    analysis, country, '18000000', level1, `"${area}"`,
    from, to, '100000',
    String(p3 + p4 + p5), '0.5',
    String(p1), '0.1', String(p2), '0.2', String(p3), '0.3',
    String(p4), '0.2', String(p5), '0.05',
    proj1[0], proj1[1], proj2[0], proj2[1],
  ].join(',')

const csv = (...rows) => `${[HEADER, ...rows].join('\n')}\n`

/** A GeoJSON feature as the IPC publishes it. */
const feat = (title, overall_phase, geometry, extra = {}) => ({
  type: 'Feature',
  properties: {
    title,
    overall_phase,
    confidence_level: 2,
    prolonged_crisis: false,
    view_level: 'area',
    ipc_period: 'C',
    ...extra,
  },
  geometry,
})

const pt = (lng, lat) => ({ type: 'Point', coordinates: [lng, lat] })
/** A unit square, so a centroid is trivially predictable. */
const square = (lng, lat) => ({
  type: 'Polygon',
  coordinates: [[[lng, lat], [lng + 1, lat], [lng + 1, lat + 1], [lng, lat + 1], [lng, lat]]],
})

/** The reducer, with a stand-in for d3-geo that only has to be consistent. */
const point = (f) => {
  if (f.geometry.type === 'Point') {
    const [lng, lat] = f.geometry.coordinates
    return { lat, lng }
  }
  // Drop the closing coordinate, which a ring repeats and a mean would count twice.
  const ring = f.geometry.coordinates[0].slice(0, -1)
  const lng = ring.reduce((a, p) => a + p[0], 0) / ring.length
  const lat = ring.reduce((a, p) => a + p[1], 0) / ring.length
  return { lat, lng }
}

// ---------------------------------------------------------------------------
// 1. Reading the table
// ---------------------------------------------------------------------------

test('the published header parses, and a missing column throws', () => {
  const rows = parseIpcAreaCsv(csv(row({ p4: 4000 })))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].country, 'SOM')
  // Quoted, and containing the commas that are the whole reason `parseCsv` is
  // shared with the conflict fetcher rather than written a third time.
  assert.equal(rows[0].area, 'Bay Urban IDPs (Baydhaba)')
  assert.equal(rows[0].population.p4, 4000)

  // A product that changed shape must stop the layer, not emit rows whose
  // populations are `undefined` and filter out downstream as "no famine".
  assert.throws(
    () => parseIpcAreaCsv('Country,Area\nSOM,Bay\n'),
    /missing expected columns/,
  )
})

test('an empty population is null, never zero', () => {
  // `Number('')` is 0, so "the IPC published no figure" and "the IPC assessed
  // nobody in Catastrophe" would otherwise print identically. Only one of them
  // may be shown to a reader as 0.
  const line = row({ p5: 0 }).replace(/,0,0\.05(,|$)/, ',,0.05$1')
  const [parsed] = parseIpcAreaCsv(csv(line))
  assert.equal(parsed.population.p5, null)
  const [zeroed] = parseIpcAreaCsv(csv(row({ p5: 0 })))
  assert.equal(zeroed.population.p5, 0)
})

test('a row with no country or no area is not a partial record', () => {
  const rows = parseIpcAreaCsv(csv(row({ country: '' }), row({ area: '' }), row()))
  assert.equal(rows.length, 1)
})

// ---------------------------------------------------------------------------
// 2. The vintage, and the gate
// ---------------------------------------------------------------------------

test('the analysis date is a month, placed at the first of it', () => {
  assert.equal(parseAnalysisDate('Oct 2025').toISOString(), '2025-10-01T00:00:00.000Z')
  assert.equal(parseAnalysisDate('Jun 2026').toISOString(), '2026-06-01T00:00:00.000Z')
  // An unreadable vintage is not a vintage. Falling back to "now" would make the
  // stalest possible record the freshest thing on the map.
  assert.equal(parseAnalysisDate('sometime'), null)
  assert.equal(parseAnalysisDate(''), null)
  assert.equal(analysisAgeMonths(null, NOW), null)
})

test("Ethiopia's five-year-old analysis is dropped, and Gaza's is not", () => {
  // The live file still carries a May 2021 analysis in its *current* columns, and
  // those areas hold the largest Catastrophe caseloads in the whole dataset. Any
  // "worst areas" read puts 2021 Ethiopia above 2026 Gaza unless something asks
  // how old the number is.
  const rows = parseIpcAreaCsv(
    csv(
      row({ analysis: 'May 2021', country: 'ETH', area: 'North western, cluster 1', p5: 143804 }),
      row({ analysis: 'Nov 2025', country: 'PSE', area: 'Khan Younis', p5: 39885 }),
      row({ analysis: 'nonsense', country: 'XXX', area: 'Somewhere' }),
    ),
  )
  const { kept, skipped } = gateByAge(rows, { now: NOW })
  assert.deepEqual(kept.map((k) => k.country), ['PSE'])
  assert.equal(skipped.staleAnalysis, 1)
  assert.equal(skipped.unreadableVintage, 1)
  // 2025-11-01 → 2026-07-30 is a shade under nine months, and the card prints it.
  assert.equal(kept[0].ageMonths, 8.9)
  assert.ok(kept[0].ageMonths < AGE_LIMIT_MONTHS)
})

test('a superseding projection is reported, and never used as the phase', () => {
  // ISO day strings, which is the shape `.ipc.json` carries — so `build.js` uses
  // this rather than writing the comparison a second time, and this test covers
  // the code path the card actually runs.
  const TODAY = '2026-07-30'
  const sudan = [
    { from: '2026-06-01', to: '2026-09-30' },
    { from: '2026-10-01', to: '2027-01-31' },
  ]
  assert.deepEqual(windowCoveringDay(sudan, TODAY), sudan[0])

  // Gaza's own case: the analysis carries a projection, and it closed in April.
  assert.equal(windowCoveringDay([{ from: '2025-12-01', to: '2026-04-30' }], TODAY), null)
  // Boundaries are inclusive, and a half-published window is not a window.
  assert.ok(windowCoveringDay([{ from: TODAY, to: TODAY }], TODAY))
  assert.equal(windowCoveringDay([{ from: '2026-06-01', to: '' }], TODAY), null)
  assert.equal(windowCoveringDay(undefined, TODAY), null)
})

// ---------------------------------------------------------------------------
// 3. The phase is read, never derived
// ---------------------------------------------------------------------------

test('the phase comes off the feature and nothing else', () => {
  assert.equal(featureClassification(feat('Bay', 4, pt(43, 3))).phase, 4)
  // Absent, out of range, or unparseable is `null` — not a default. An
  // unclassified area drawn at Phase 1 is a claim the IPC did not make, and at
  // Phase 4 it is a much worse one.
  assert.equal(featureClassification(feat('Bay', null, pt(43, 3))), null)
  assert.equal(featureClassification(feat('Bay', 0, pt(43, 3))), null)
  assert.equal(featureClassification(feat('Bay', 6, pt(43, 3))), null)
  assert.equal(featureClassification({}), null)
})

test('an area whose majority sits in Phase 1 keeps the phase the IPC gave it', () => {
  // Deriving the phase by largest population share puts 2,122 of 2,804 areas in
  // Phase 1, measured — a famine layer drawing the world as fine. IPC classifies
  // on thresholds: 20% of the population in Phase 3+ is enough for Phase 3.
  const rows = parseIpcAreaCsv(
    csv(row({ area: 'Bay Agro-pastoral', p1: 70000, p2: 10000, p3: 15000, p4: 5000 })),
  )
  const { kept } = gateByAge(rows, { now: NOW })
  const [joined] = joinAreas(kept, [feat('Bay Agro-pastoral', 4, pt(43, 3))], point)
  assert.equal(joined.phase, 4)
  assert.equal(joined.population.p1, 70000)
})

// ---------------------------------------------------------------------------
// 4. The join
// ---------------------------------------------------------------------------

test('area names match across the two files despite case and punctuation', () => {
  assert.equal(
    normaliseAreaName('Awdal Urban (Baki, Lughaye and Zeylac)'),
    normaliseAreaName('awdal urban  baki lughaye and zeylac'),
  )
  assert.equal(normaliseAreaName(null), '')
})

test('an unjoined name is counted, not quietly dropped', () => {
  const rows = parseIpcAreaCsv(csv(row({ area: 'Bay' }), row({ area: 'Gedo' })))
  const { kept } = gateByAge(rows, { now: NOW })
  const skipped = { unjoined: 0, noGeometry: 0, noPhase: 0 }
  const out = joinAreas(kept, [feat('Bay', 3, pt(43, 3))], point, skipped)
  assert.equal(out.length, 1)
  assert.equal(skipped.unjoined, 1)
})

test('parent aggregates and non-current periods are not joinable', () => {
  // Sudan ships two parent-level features with no CSV row. An aggregate drawn
  // beside its own children is one place counted twice.
  const rows = parseIpcAreaCsv(csv(row({ country: 'SDN', area: 'Al Fasher' })))
  const { kept } = gateByAge(rows, { now: NOW })
  const features = [
    feat('Al Fasher', 4, pt(25, 13), { view_level: 'level1' }),
    feat('Al Fasher', 3, pt(25, 13), { ipc_period: 'P' }),
    feat('Al Fasher', 4, square(25, 13)),
  ]
  const [joined] = joinAreas(kept, features, point)
  assert.equal(joined.phase, 4)
  assert.equal(joined.lat, 13.5)
  assert.equal(joined.lng, 25.5)
})

test('a point feature keeps its own coordinate', () => {
  // Somalia is 63 Point features beside 44 polygons, and the points are the urban
  // and IDP caseloads — most of the country's Phase 4 areas. A reducer that only
  // handles polygons loses them.
  const rows = parseIpcAreaCsv(csv(row({ area: 'Bay Urban IDPs (Baydhaba)' })))
  const { kept } = gateByAge(rows, { now: NOW })
  const [joined] = joinAreas(kept, [feat('Bay Urban IDPs (Baydhaba)', 4, pt(43.65, 3.11))], point)
  assert.equal(joined.lng, 43.65)
  assert.equal(joined.lat, 3.11)
})

// ---------------------------------------------------------------------------
// 5. What gets drawn
// ---------------------------------------------------------------------------

test('Phase 4 and above is drawn', () => {
  assert.equal(publishable({ phase: 4, population: {} }), true)
  assert.equal(publishable({ phase: 5, population: {} }), true)
  assert.equal(publishable({ phase: 2, population: { p5: 0 } }), false)
  assert.equal(publishable({ phase: null, population: { p5: 9999 } }), false)
  assert.equal(PUBLISH_MIN_PHASE, 4)
})

test('a Phase 3 area with a Catastrophe caseload is drawn — this is Gaza', () => {
  // The finding that made the bar compound. `overall_phase >= 4` alone is 101
  // areas across six countries and excludes all four Gaza areas, which the
  // November 2025 analysis classifies at Phase 3 while counting 39,885, 37,950,
  // 24,080 and 1,885 people in Catastrophe in them.
  const gaza = { phase: 3, population: { p1: 0, p4: 200000, p5: 39885 } }
  assert.equal(publishable(gaza), true)
  // And the mark still carries the classification the IPC made, not a promoted one.
  assert.equal(gaza.phase, 3)
  assert.equal(PHASE_NAMES[3], 'Crisis')
  assert.equal(PHASE_NAMES[5], 'Catastrophe')
})

test('a Crisis area with nobody in Catastrophe stays off the map', () => {
  // The other direction: the compound rule must not become "Phase 3+", which is
  // 674 areas across 21 countries.
  assert.equal(publishable({ phase: 3, population: { p3: 500000, p4: 0, p5: 0 } }), false)
  assert.equal(publishable({ phase: 3, population: { p3: 500000 } }), false)
})
