import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseImfPrices } from './trends-sources/imf.js'
import { INDICATORS } from './trends-registry.js'

// The service's own answer of 2026-10-10 for two commodities, cut to its
// shape: the header's attributes run to kilobytes of prose.
const obs = (month, value) => `<Obs TIME_PERIOD="${month}" OBS_VALUE="${value}" DERIVATION_TYPE="R" ACCESS_SHARING_LEVEL="PUBLIC_OPEN" SECURITY_CLASSIFICATION="PUB"/>`
const series = (indicator, transformation, frequency, body) =>
  `<Series COUNTRY="G001" INDICATOR="${indicator}" DATA_TRANSFORMATION="${transformation}" FREQUENCY="${frequency}" SCALE="0">${body}</Series>`
const answer = (...all) =>
  `<?xml version='1.0' encoding='UTF-8'?><message:StructureSpecificData><message:Header><message:ID>IDREF1</message:ID></message:Header>` +
  `<message:DataSet ss:structureRef="IMF.RES_PCPS_9_0_0" PUBLISHER="IMF" FULL_DESCRIPTION="monthly averages. INDICATOR=&quot;none&quot;">${all.join('')}</message:DataSet></message:StructureSpecificData>`

test('parseImfPrices: each commodity’s months, dated their first day', () => {
  const out = parseImfPrices(answer(
    series('PCOPP', 'USD', 'M', obs('2026-M08', '14331.26476190476') + obs('2026-M09', '14473.05590909091')),
    series('PNGASEU', 'USD', 'M', obs('2026-M08', '20.922') + obs('2026-M09', '25.494')),
  ))
  assert.deepEqual([...out.keys()], ['PCOPP', 'PNGASEU'])
  assert.deepEqual(out.get('PCOPP'), [{ date: '2026-08-01', value: 14331.26476190476 }, { date: '2026-09-01', value: 14473.05590909091 }])
  assert.equal(out.get('PNGASEU')?.at(-1)?.value, 25.494)
})

test('parseImfPrices: only the dollar price by the month, oldest first, and no month without one', () => {
  // A key left open returns the index and its changes beside the price.
  const out = parseImfPrices(answer(
    series('PWHEAMT', 'INDEX', 'M', obs('2026-M09', '151.2')),
    series('PWHEAMT', 'USD', 'Q', obs('2026-Q3', '237.8')),
    series('PWHEAMT', 'USD', 'M', obs('2026-M09', '246.85180245') + obs('2026-M07', '228.73884495') + obs('2026-M08', '') + obs('2026-M10', 'NaN')),
  ))
  assert.deepEqual(out.get('PWHEAMT'), [{ date: '2026-07-01', value: 228.73884495 }, { date: '2026-09-01', value: 246.85180245 }])
})

test('parseImfPrices: an answer with no series is an empty map, for the caller to report', () => {
  assert.equal(parseImfPrices(answer()).size, 0)
  assert.equal(parseImfPrices('<html>Service unavailable</html>').size, 0)
})

test('registry: an IMF row is a monthly price, keyed by its commodity code', () => {
  const rows = INDICATORS.filter((i) => i.source === 'imf')
  assert.deepEqual(rows.map((r) => r.id).sort(), ['copper', 'natgas-ttf', 'rice', 'wheat'])
  for (const r of rows) {
    assert.equal(r.cadence, 'monthly', r.id)
    assert.match(r.seriesId ?? '', /^P[A-Z]+$/, r.id)
  }
})
