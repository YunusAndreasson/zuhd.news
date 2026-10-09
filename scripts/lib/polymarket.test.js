import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  deckIds,
  isUsableShortTitle,
  marketsFromEvents,
  orderCandidates,
  PIN_TITLE_RE,
  pickOutcome,
} from './trends-sources/polymarket.js'

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

// One outcome stands for an event. It was the most traded of the moment, so an
// event kept its place in the deck and changed market under it: Brazil's
// election went Lula, Bolsonaro, Lula on consecutive days of September 2026.

const NOW = Date.parse('2026-10-09T10:00:00Z')
const outcome = (slug, volume24hr, more = {}) => ({
  slug,
  volume24hr,
  lastTradePrice: 0.4,
  active: true,
  closed: false,
  endDate: '2026-11-30T00:00:00Z',
  ...more,
})
const brazil = (...markets) => ({ slug: 'brazil-presidential-election', title: 'Brazil Presidential Election', markets })
const picked = (ev, incumbents = []) => pickOutcome(ev, new Set(incumbents), NOW)?.slug ?? null

test('an event keeps the outcome the deck already carries over a busier sibling', () => {
  const ev = brazil(outcome('will-lula-win', 100), outcome('will-bolsonaro-win', 900))
  assert.equal(picked(ev), 'will-bolsonaro-win', 'with no incumbent, the most traded')
  assert.equal(picked(ev, ['will-lula-win']), 'will-lula-win')
  assert.equal(picked(ev, ['some-other-market']), 'will-bolsonaro-win')
})

test('an incumbent outcome that is no longer live gives way to the most traded live one', () => {
  const live = [outcome('by-october-31', 50), outcome('by-december-31', 20)]
  for (const { why, gone } of [
    { why: 'decided', gone: { lastTradePrice: 0.98 } },
    { why: 'decided the other way', gone: { lastTradePrice: 0.02 } },
    { why: 'closed', gone: { closed: true } },
    { why: 'inactive', gone: { active: false } },
    { why: 'past its date', gone: { endDate: '2026-09-30T00:00:00Z' } },
  ]) {
    const ev = brazil(outcome('by-september-30', 900, gone), ...live)
    assert.equal(picked(ev, ['by-september-30']), 'by-october-31', why)
    // And without an incumbent the event is no longer dropped for its busiest
    // outcome: it falls to the next live one.
    assert.equal(picked(ev), 'by-october-31', `${why}, no incumbent`)
  }
})

test('the date is the market’s own, else the event’s, and a market with neither is kept', () => {
  const undated = outcome('open-ended', 10, { endDate: undefined })
  assert.equal(picked({ markets: [undated] }), 'open-ended')
  assert.equal(picked({ endDate: '2026-12-01T00:00:00Z', markets: [undated] }), 'open-ended')
  assert.equal(picked({ endDate: '2026-09-01T00:00:00Z', markets: [undated] }), null, 'the event has ended')
  assert.equal(picked({ markets: [outcome('iso-only', 10, { endDate: undefined, endDateIso: '2026-09-01' })] }), null)
  assert.equal(picked({ markets: [outcome('a', 1, { lastTradePrice: 0.99 })] }), null, 'every outcome decided')
  assert.equal(picked({ markets: [outcome('no-price', 1, { lastTradePrice: undefined })] }), 'no-price')
})

test('the response’s events become one market each, with the event stitched in', () => {
  const events = [
    brazil(outcome('will-lula-win', 100), outcome('will-bolsonaro-win', 900)),
    { slug: 'world-series', tags: [{ slug: 'sports' }], markets: [outcome('yankees', 5000)] },
    { slug: 'ceasefire', endDate: '2026-12-31T00:00:00Z', tags: [{ slug: 'iran' }], markets: [outcome('ceasefire-by-dec', 70, { endDate: undefined })] },
    { slug: 'decided', markets: [outcome('done', 10, { lastTradePrice: 1 })] },
  ]
  const { markets, seen, droppedByTag, droppedNoneLive } = marketsFromEvents(events, new Set(['will-lula-win']), NOW)
  assert.deepEqual(markets.map((m) => m.slug), ['will-lula-win', 'ceasefire-by-dec'])
  assert.deepEqual(markets[0].events, [{ slug: 'brazil-presidential-election', title: 'Brazil Presidential Election' }])
  assert.equal(markets[1].endDate, '2026-12-31T00:00:00Z', 'the event’s date where the market has none')
  assert.deepEqual(markets[1]._eventTags, [{ slug: 'iran' }])
  assert.deepEqual([droppedByTag, droppedNoneLive], [1, 1])
  // Every outcome the response held, chosen or not: an incumbent in here and
  // not in `markets` was filtered, not lost from the top of the table.
  assert.deepEqual([...seen].sort(), ['ceasefire-by-dec', 'done', 'will-bolsonaro-win', 'will-lula-win', 'yankees'])
})

// The Fed's "no change" question, one slug a meeting, alike for the 48
// characters an id keeps. Both were in the deck on 2026-10-02, at 83% and 21%,
// under one id.
const FED_OCT = 'will-there-be-no-change-in-fed-interest-rates-after-the-october-2026-meeting-20260617190324031'
const FED_DEC = 'will-there-be-no-change-in-fed-interest-rates-after-the-december-2026-meeting-20260729232808635'
const FED_ID = 'poly-will-there-be-no-change-in-fed-interest-rates-af'
const FED_OCT_OWN = 'poly-will-there-be-no-change-in-fed-interest-r-584980'
const FED_DEC_OWN = 'poly-will-there-be-no-change-in-fed-interest-r-9af44e'

test('two markets alike for 48 characters ship under two ids', () => {
  assert.deepEqual(deckIds([{ slug: FED_OCT }, { slug: FED_DEC }]), [FED_ID, FED_DEC_OWN])
  assert.deepEqual(deckIds([{ slug: FED_DEC }, { slug: FED_OCT }]), [FED_ID, FED_OCT_OWN])
  // The second form is no longer than the first: `poly-` and 48 characters.
  assert.equal(FED_DEC_OWN.length, FED_ID.length)
})

test('an incumbent keeps its id wherever it stands in the deck', () => {
  // The newcomer is ranked first and would have taken the id by arriving first.
  assert.deepEqual(
    deckIds([{ slug: FED_DEC }, { slug: FED_OCT, incumbentId: FED_ID }]),
    [FED_DEC_OWN, FED_ID],
  )
  // And the newcomer's id is its own the next cycle, when it is an incumbent,
  // whether or not the twin is still there.
  assert.deepEqual(
    deckIds([{ slug: FED_OCT, incumbentId: FED_ID }, { slug: FED_DEC, incumbentId: FED_DEC_OWN }]),
    [FED_ID, FED_DEC_OWN],
  )
  assert.deepEqual(deckIds([{ slug: FED_DEC, incumbentId: FED_DEC_OWN }]), [FED_DEC_OWN])
})

test('two incumbents on one id part, and the first in the deck keeps it', () => {
  assert.deepEqual(
    deckIds([{ slug: FED_DEC, incumbentId: FED_ID }, { slug: FED_OCT, incumbentId: FED_ID }]),
    [FED_ID, FED_OCT_OWN],
  )
})

test('a slug that collides with nothing has the id it always had', () => {
  // The rule before `deckIds`, restated: `poly-` and the slug cut to 48.
  const cut = (s) => `poly-${s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}`
  const slugs = [
    'strait-of-hormuz-traffic-returns-to-normal-by-december-31',
    'will-flvio-bolsonaro-win-the-2026-brazilian-presidential-election',
    'putin-out-before-2027-346',
    'us-x-iran-permanent-peace-deal-by-december-31-2026',
    FED_OCT,
  ]
  assert.deepEqual(deckIds(slugs.map((slug) => ({ slug }))), slugs.map(cut))
  // With no id from the previous snapshot to keep, a row is a newcomer.
  assert.deepEqual(deckIds([{ slug: 'putin-out-before-2027-346', incumbentId: null }]), ['poly-putin-out-before-2027-346'])
})

test('short titles: a rephrase is kept, a copy with "Will" cut off is not', () => {
  // The prompt's own examples must pass the guard that judges them.
  assert.equal(isUsableShortTitle('Will Kevin Warsh be confirmed as Fed Chair?', 'Kevin Warsh confirmed as Fed Chair?'), true)
  assert.equal(isUsableShortTitle('Will Roberto Sánchez Palomino win the 2026 Peruvian presidential election?', 'Sánchez Palomino wins Peru 2026?'), true)
  assert.equal(isUsableShortTitle('Will Gavin Newsom win the 2028 Democratic presidential nomination?', 'Newsom wins 2028 Dem nomination?'), true)
  assert.equal(isUsableShortTitle('Will the U.S. invade Iran before 2027?', 'US invade Iran by 2027?'), true)
  // A three-word name is the whole of the old three-word window.
  assert.equal(isUsableShortTitle('Will Marine Le Pen win the 2027 French presidential election?', 'Marine Le Pen wins 2027 French election?'), true)
  assert.equal(isUsableShortTitle('Will Marine Le Pen win the 2027 French presidential election?', 'Marine Le Pen win the 2027 French…'), false)
  // The two shapes the guard exists for.
  assert.equal(isUsableShortTitle('Will Alexandria Ocasio-Cortez win the 2028 US presidential election?', 'Alexandria Ocasio-Cortez win the 2028 US…'), false)
  assert.equal(isUsableShortTitle('Will there be no change in Fed interest rates?', 'there be no change in Fed rates?'), false)
})
