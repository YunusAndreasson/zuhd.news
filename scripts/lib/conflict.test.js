// Transform invariants for UCDP CSV → ConflictEvent. Pinned bugs:
//   • XXX###-prefixed unidentified actors used to render as "XXX130 vs Civilians"
//   • Country-centroid records (where_prec ≥ 4) used to pile dots at fake midpoints
//   • Near-(0,0) geocoder fallbacks used to anchor stray markers in the Atlantic
//   • Filter window used to anchor on Date.now(), giving empty results when the
//     UCDP snapshot trailed real-time by more than the window
//
// Run with: node --test scripts/lib/conflict.test.js

import test from 'node:test'
import assert from 'node:assert/strict'
import { filterRecentWindow, mapUcdpRow, parseCsv, parseSourceArticle, rowsToObjects } from './conflict.js'

const baseRow = {
  id: '1',
  relid: 'TEST-1',
  date_start: '2026-03-31 00:00:00.000',
  type_of_violence: '1',
  side_a: 'Group A',
  side_b: 'Group B',
  country: 'Sudan',
  adm_1: 'Khartoum',
  adm_2: '',
  where_coordinates: 'Khartoum',
  where_prec: '1',
  latitude: '15.5',
  longitude: '32.5',
  best: '5',
  source_office: 'Reuters',
  source_headline: 'Clashes reported in central Khartoum',
}

test('parseCsv handles quoted fields with embedded commas', () => {
  const csv = 'a,b,c\n1,"two, with comma",3\n'
  assert.deepEqual(parseCsv(csv), [
    ['a', 'b', 'c'],
    ['1', 'two, with comma', '3'],
  ])
})

test('parseCsv handles doubled-quote escapes', () => {
  const csv = 'a,b\n1,"he said ""hi"""\n'
  assert.deepEqual(parseCsv(csv), [
    ['a', 'b'],
    ['1', 'he said "hi"'],
  ])
})

test('rowsToObjects throws when REQUIRED_COLUMNS are missing', () => {
  // Schema-drift guard: if UCDP renames a column, surface it loudly
  // rather than write garbage events with empty fields.
  assert.throws(() => rowsToObjects([['a', 'b', 'c'], ['1', '2', '3']]), /missing expected columns/i)
})

test('mapUcdpRow drops country-centroid records (where_prec > 3)', () => {
  // where_prec 4-7 means UCDP only knows the country/region, so coords
  // are a fake centroid that would visually misanchor the marker.
  assert.equal(mapUcdpRow({ ...baseRow, where_prec: '4' }), null)
})

test('mapUcdpRow drops zero-fatality companion records', () => {
  // UCDP candidate publishes many best=0 records as cross-reference
  // entries; redundant on the visual layer.
  assert.equal(mapUcdpRow({ ...baseRow, best: '0' }), null)
})

test('mapUcdpRow drops near-(0,0) geocoder fallbacks', () => {
  // Defensive: Null Island is the universal geocoder failure mode.
  assert.equal(mapUcdpRow({ ...baseRow, latitude: '0.1', longitude: '-0.2' }), null)
})

test('mapUcdpRow drops events with XXX-prefix placeholder actors', () => {
  // UCDP encodes unidentified sub-state actors as "XXX###". Showing
  // these on the sheet is worse UX than dropping the event.
  assert.equal(mapUcdpRow({ ...baseRow, side_a: 'XXX130' }), null)
})

test('mapUcdpRow strips XXX-prefix actor2 but keeps the event', () => {
  // When only side_b is unidentified, keep the event with actor1 alone.
  // The hero stays informative and the sheet won't render a phantom opponent.
  const out = mapUcdpRow({ ...baseRow, side_b: 'XXX42' })
  assert.equal(out.actor1, 'Group A')
  assert.equal(out.actor2, undefined)
})

test('mapUcdpRow maps type_of_violence 3 to attack_on_civilians', () => {
  const out = mapUcdpRow({ ...baseRow, type_of_violence: '3', side_b: 'Civilians' })
  assert.equal(out.subEvent, 'attack_on_civilians')
  assert.equal(out.actor2, 'Civilians')
})

test('mapUcdpRow normalizes UCDP historical country names', () => {
  // "DR Congo (Zaire)" needs to match our shared/countries dataset's
  // "Democratic Republic of the Congo" so the country chip + flag resolve.
  const out = mapUcdpRow({ ...baseRow, country: 'DR Congo (Zaire)' })
  assert.equal(out.country, 'Democratic Republic of the Congo')
  assert.equal(out.iso3, 'COD')
})

test('mapUcdpRow truncates long source_headline to 140 chars with ellipsis', () => {
  const long = 'A'.repeat(200)
  const out = mapUcdpRow({ ...baseRow, source_headline: long })
  assert.ok(out.notes.length <= 140)
  assert.ok(out.notes.endsWith('…'))
})

test('filterRecentWindow anchors on the dataset max date, not Date.now()', () => {
  // UCDP candidate trails real-time by 1-3 months. Anchoring on Date.now()
  // would yield an empty window whenever the snapshot is stale.
  const events = [
    { ...mapUcdpRow(baseRow), eventDate: '2026-03-25' },
    { ...mapUcdpRow(baseRow), eventDate: '2026-03-30' },
    { ...mapUcdpRow(baseRow), eventDate: '2026-03-31' },
  ]
  const out = filterRecentWindow(events, 2)
  assert.equal(out.windowStart, '2026-03-30')
  assert.equal(out.windowEnd, '2026-03-31')
  assert.equal(out.kept.length, 2)
})

test('filterRecentWindow handles empty input without throwing', () => {
  const out = filterRecentWindow([], 1)
  assert.deepEqual(out, { kept: [], windowStart: '', windowEnd: '' })
})

// --- enrichment fields (2026-05-02 expansion) ---

test('mapUcdpRow attaches enrichment fields when present', () => {
  const out = mapUcdpRow({
    ...baseRow,
    conflict_name: 'Sudan: Government',
    region: 'Africa',
    where_description: 'Khartoum North, near the bridge',
    date_end: '2026-04-01 00:00:00.000',
    deaths_civilians: '3',
    deaths_a: '2',
    deaths_b: '0',
    deaths_unknown: '0',
    low: '4',
    high: '8',
    number_of_sources: '5',
  })
  assert.equal(out.conflictName, 'Sudan: Government')
  assert.equal(out.region, 'Africa')
  assert.equal(out.locationDetail, 'Khartoum North, near the bridge')
  assert.equal(out.dateEnd, '2026-04-01')
  assert.equal(out.deathsCivilians, 3)
  assert.equal(out.deathsSideA, 2)
  assert.equal(out.deathsSideB, undefined) // zero → omitted
  assert.equal(out.fatalitiesLow, 4)
  assert.equal(out.fatalitiesHigh, 8)
  assert.equal(out.numSources, 5)
})

test('mapUcdpRow omits fatalities range when low/high == best (no info)', () => {
  // UCDP fills low=high=best for tight estimates. Sheet shouldn't render
  // "5 (5-5)" — the absence of the range is the signal.
  const out = mapUcdpRow({ ...baseRow, low: '5', high: '5' })
  assert.equal(out.fatalitiesLow, undefined)
  assert.equal(out.fatalitiesHigh, undefined)
})

test('mapUcdpRow omits dateEnd when same as dateStart (single-day event)', () => {
  const out = mapUcdpRow({ ...baseRow, date_end: '2026-03-31 00:00:00.000' })
  assert.equal(out.dateEnd, undefined)
})

test('parseSourceArticle parses N records with embedded headlines', () => {
  const raw = '"Reuters,2026-03-15,Clashes in Khartoum kill 12";"BBC,2026-03-15,Sudan violence escalates"'
  const out = parseSourceArticle(raw)
  assert.equal(out.length, 2)
  assert.deepEqual(out[0], { outlet: 'Reuters', date: '2026-03-15', headline: 'Clashes in Khartoum kill 12' })
  assert.deepEqual(out[1], { outlet: 'BBC', date: '2026-03-15', headline: 'Sudan violence escalates' })
})

test('parseSourceArticle truncates UCDP-appended CR/Source metadata', () => {
  // UCDP packs `\nCR \tSource: BBC Monitoring` after some headlines —
  // wire-service framing that's noise in our display.
  const raw = '"BBC Monitoring,2026-03-03,Watchlist 3 Mar 26\nCR \tSource: BBC Monitoring"'
  const out = parseSourceArticle(raw)
  assert.equal(out.length, 1)
  assert.equal(out[0].headline, 'Watchlist 3 Mar 26')
})

test('parseSourceArticle returns [] for empty input rather than throwing', () => {
  assert.deepEqual(parseSourceArticle(''), [])
  assert.deepEqual(parseSourceArticle(undefined), [])
  assert.deepEqual(parseSourceArticle(null), [])
})

test('mapUcdpRow attaches structured sources from source_article', () => {
  const out = mapUcdpRow({
    ...baseRow,
    source_article: '"Reuters,2026-03-15,Khartoum clashes";"AFP,2026-03-15,Sudan death toll rises"',
  })
  assert.equal(out.sources.length, 2)
  assert.equal(out.sources[0].outlet, 'Reuters')
})
