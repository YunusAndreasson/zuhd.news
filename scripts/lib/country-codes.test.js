// Run: node --test scripts/lib/country-codes.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ALPHA3_TO_ALPHA2, countryNameFromIso3 } from './country-codes.js'
import { ISO3_TO_ISO2 } from './ipc.js'

test('the names GDACS spells its own way are found by their code', () => {
  // content/.gdacs.json, 2026-10-09: `country` was "United States",
  // "Russian Federation" and "Papua New Guinea, Indonesia", none of them a key
  // of `COUNTRY_DATA`, and each alert carried the code beside it.
  assert.equal(countryNameFromIso3('USA'), 'United States of America')
  assert.equal(countryNameFromIso3('RUS'), 'Russia')
  assert.equal(countryNameFromIso3('PNG'), 'Papua New Guinea')
  assert.equal(countryNameFromIso3('COD'), 'Dem. Rep. Congo')
  assert.equal(countryNameFromIso3('vut'), 'Vanuatu', 'case is not the caller’s problem')
})

test('no code, or one that is not a country here, is no name', () => {
  // An alert at sea carries `iso3: ''`. The caller logs a miss; it gets no guess.
  for (const none of ['', null, undefined, 'ZZZ', 'US', 'United States']) assert.equal(countryNameFromIso3(none), undefined)
})

test('the table is ISO 3166-1 whole: 249 codes and Kosovo, each to its own alpha-2', () => {
  const rows = Object.entries(ALPHA3_TO_ALPHA2)
  assert.equal(rows.length, 250)
  for (const [a3, a2] of rows) assert.match(`${a3}:${a2}`, /^[A-Z]{3}:[A-Z]{2}$/)
  assert.equal(new Set(rows.map(([, a2]) => a2)).size, rows.length, 'two alpha-3 codes for one alpha-2')
})

test('every alpha-2 is a region ICU knows, and it agrees with the IPC table row for row', () => {
  // Two lists made independently of this one. ICU answers a region it does
  // not know with the code itself.
  const regions = new Intl.DisplayNames(['en'], { type: 'region' })
  const unknown = Object.values(ALPHA3_TO_ALPHA2).filter((a2) => regions.of(a2) === a2)
  assert.deepEqual(unknown, [])
  for (const [a3, a2] of Object.entries(ISO3_TO_ISO2)) assert.equal(ALPHA3_TO_ALPHA2[a3], a2, a3)
})
