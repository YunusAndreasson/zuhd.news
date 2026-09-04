import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderCandidates, PIN_TITLE_RE } from './trends-sources/polymarket.js'

// Selection used to re-roll by volume every cycle, orphaning the narration
// written for the previous roll. These pin the tiers that keep it stable.

const m = (slug, volume24hr, question = slug) => ({ slug, volume24hr, question })
const ids = (rows) => rows.map((r) => r.slug)

test('an incumbent outranks a higher-volume newcomer', () => {
  const rows = orderCandidates(
    [m('new-big', 900), m('old-small', 10)],
    new Set(['old-small']),
  )
  assert.deepEqual(ids(rows), ['old-small', 'new-big'])
})

test('a pinned subject beats a plain newcomer with ten times the volume and follows an incumbent', () => {
  const rows = orderCandidates(
    [
      m('vance-2028', 1000, 'Will JD Vance win the 2028 Republican nomination?'),
      m('hormuz-normal', 100, 'Strait of Hormuz traffic returns to normal by December?'),
      m('old-market', 5, 'Will the ECB cut in October?'),
    ],
    new Set(['old-market']),
  )
  assert.deepEqual(ids(rows), ['old-market', 'hormuz-normal', 'vance-2028'])
})

test('an incumbent absent from the response is not resurrected', () => {
  const rows = orderCandidates([m('a', 1), m('b', 2)], new Set(['gone']))
  assert.deepEqual(ids(rows), ['b', 'a'])
})

test('within a tier, volume decides and ties keep input order', () => {
  const rows = orderCandidates([m('x', 5), m('y', 9), m('z', 9)], new Set())
  assert.deepEqual(ids(rows), ['y', 'z', 'x'])
})

test('incumbents beyond the cap fall to the end, so a newcomer always has a slot', () => {
  const incumbents = ['i1', 'i2', 'i3', 'i4']
  const rows = orderCandidates(
    [m('i1', 40), m('i2', 30), m('i3', 20), m('i4', 10), m('fresh', 1)],
    new Set(incumbents),
    PIN_TITLE_RE,
    3,
  )
  assert.deepEqual(ids(rows), ['i1', 'i2', 'i3', 'fresh', 'i4'])
})

test('PIN_TITLE_RE names waterways and oil, not the Fed', () => {
  for (const q of [
    'Will OPEC+ cut output in October?',
    'Brent above $100 by December 31?',
    'Bab el-Mandeb Strait effectively closed by Dec 31?',
    'Will crude oil reach a new all-time high by December?',
  ]) {
    assert.equal(PIN_TITLE_RE.test(q), true, q)
  }
  for (const q of [
    'Will JD Vance win the 2028 Republican nomination?',
    'Will the Fed decrease interest rates by 25 bps after September?',
    'Anthropic has best AI model at end of September?',
  ]) {
    assert.equal(PIN_TITLE_RE.test(q), false, q)
  }
})
