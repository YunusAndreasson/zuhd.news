// Run: node --test scripts/lib/coverage-map.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coverageLines } from './coverage-map.js'

test('slugs group by first word, the largest group first, three to a line', () => {
  assert.deepEqual(
    coverageLines([
      'iran-talks-resume-in-oman',
      'fed-raises-rates',
      'iran-hormuz-traffic-dips',
      'iran-sanctions-relief-stalls',
      'iran-executes-two-men',
      'iran-uranium-offer',
    ]),
    ['iran: talks resume in oman; hormuz traffic dips; sanctions relief stalls (+2 more)', 'fed: raises rates'],
  )
})

test('groups of one size keep the order they were met in', () => {
  assert.deepEqual(coverageLines(['wto-doubles-forecast', 'gold-edges-higher']), ['wto: doubles forecast', 'gold: edges higher'])
})

test('nothing covered is no lines', () => {
  assert.deepEqual(coverageLines([]), [])
})
