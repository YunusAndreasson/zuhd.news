// Run: node --test scripts/lib/dedup.test.js
//
// Pins the recap-detection layer added 2026-05-02 after the audit found
// 31 niche-only articles that recapped events covered 2-10 days earlier
// by major outlets — a pattern the slug-fuzzy layer kept missing because
// niche outlets reword headlines and slug truncation drops endings.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  normalizeUrl,
  titleWords,
  buildTitleSets,
  recapMatch,
  fuzzyMatch,
  buildWordSets,
  wouldDedup,
  NICHE_SOURCES,
} from './dedup.js'

// Helper: build a story object the way merge-feeds.js produces them.
function story(title, sources, suggestedSlug = '') {
  return { title, suggestedSlug, sources: sources.map(name => ({ name })) }
}

// --- titleWords sanity ---
test('titleWords filters short words and stop-list', () => {
  const w = titleWords('Israel Encircles Bint Jbeil, Stalls in Lebanon')
  assert.ok(w.has('israel'))
  assert.ok(w.has('encircles'))
  assert.ok(w.has('bint'))
  assert.ok(w.has('jbeil'))
  assert.ok(w.has('stalls'))
  assert.ok(w.has('lebanon'))
  assert.ok(!w.has('in'))   // length 2, dropped
  assert.ok(!w.has('with')) // stop-list
})

// --- recap pin: known-recap pairs from 2026-05-02 audit ---
// Each pair is a real niche-source article we shipped 2-10 days after
// covering (or seeing) the same event from a major outlet. The recap
// layer must catch every one of these.
const KNOWN_RECAPS = [
  ['Disney Kills $1B OpenAI Deal',                    'OpenAI Kills Sora, Disney Exits'],
  ['Meta Drops Instagram DM Encryption',              'Meta Strips Instagram Encryption'],
  ['Israel Kills 3 Journalists in Lebanon',           'Israel Kills 3 Lebanese Journalists'],
  ['Iran Rejects Trump Ceasefire Deadline',           'Iran Rejects US Ceasefire Framework'],
  ['Iran Rejects US Ceasefire Framework',             'Iran Rejects US Ceasefire Plan'],
  ['Iran Rejects Temporary Ceasefire Offer',          'Iran Rejects US Ceasefire Framework'],
  ['Israel Encircles Bint Jbeil, Stalls',             'Israel Encircles Bint Jbeil'],
  ['FAA Drops Drone Penalties Near ICE',              'FAA Drops ICE Drone Penalties'],
  ['Syria Arrests Tadamon Massacre Perpetrator',      'Syria Arrests Tadamon Ringleader'],
  ['Tinder Plans AI Camera Roll Scan',                'Tinder Plans AI Camera Scan'],
  ['Anti-Porn App Exposed Users',                     'Anti-Porn App Left Users Exposed'],
  ['Democrats Delay Iran War Vote',                   'Democrats Force Iran War Vote'],
  ['Japan Deploys Missiles Near China',               'Japan Missiles Reach China Coast'],
  ['Israel Kills 88 Lebanon Medics',                  'Israel Kills 13 Lebanon Security'],
]

test('recapMatch catches niche-source recaps from 2026-05-02 audit', () => {
  const misses = []
  for (const [niche, prior] of KNOWN_RECAPS) {
    const sets = buildTitleSets([{ slug: 'prior', title: prior }])
    if (!recapMatch(niche, sets)) misses.push(`"${niche}" vs "${prior}"`)
  }
  assert.deepEqual(misses, [], `recap pairs not caught:\n  ${misses.join('\n  ')}`)
})

// --- counter-examples: must NOT match (different events, theme overlap only) ---
const SHOULD_NOT_MATCH = [
  // Place + topic only — different events.
  ['Iran Parliament Speaker Quits',          'Iran Nuclear Talks Resume'],
  ['Russia Drone Strike Kyiv',               'Ukraine Refinery Hit'],
  ['Egypt Detains 5 Activists',              'Egypt Power Grid Outage'],
  // Real audit-period false-positive guards: themes share 'iran'/'lebanon'
  // but the events are distinct.
  ['Lebanon Currency Slumps Again',          'Lebanon Election Postponed'],
  ['Gaza Aid Convoy Reaches Border',         'Gaza Hospital Strike Kills 12'],
]

test('recapMatch does not conflate different events sharing a region', () => {
  const flagged = []
  for (const [a, b] of SHOULD_NOT_MATCH) {
    const sets = buildTitleSets([{ slug: 'b', title: b }])
    const m = recapMatch(a, sets)
    if (m) flagged.push(`"${a}" ~ "${b}"`)
  }
  assert.deepEqual(flagged, [], `false-positive recap matches:\n  ${flagged.join('\n  ')}`)
})

// --- wouldDedup wiring: recap layer fires only for niche-only stories ---
test('wouldDedup recap layer fires only when sources are all niche', () => {
  const ctx = {
    recentSlugs: [],
    ledgerEventUris: new Map(),
    recentWordSets: [],
    recentTitleSets: buildTitleSets([{ slug: 'prior-art', title: 'Israel Encircles Bint Jbeil' }]),
    ledgerLabelSets: [],
  }
  // Niche-only → recap fires.
  const niche = story('Israel Encircles Bint Jbeil, Stalls', ['Mada Masr'], 'foo')
  const r1 = wouldDedup(niche, ctx)
  assert.equal(r1.deduped, true)
  assert.equal(r1.reason, 'recap')

  // Multi-source with a major outlet → recap does NOT fire (existing
  // layers still apply, but a new multi-sourced story about the same
  // event is treated as fresh — the major outlets confirm timeliness).
  const multi = story('Israel Encircles Bint Jbeil, Stalls', ['Reuters', 'BBC'], 'foo')
  const r2 = wouldDedup(multi, ctx)
  assert.equal(r2.deduped, false)
})

test('NICHE_SOURCES list is non-empty and matches RSS source names', () => {
  // Sanity: the list is the gating mechanism; if it's empty, recap is
  // effectively disabled.
  assert.ok(NICHE_SOURCES.size >= 20, 'expected ≥20 niche sources')
  assert.ok(NICHE_SOURCES.has('Drop Site News'))
  assert.ok(NICHE_SOURCES.has('404 Media'))
  assert.ok(NICHE_SOURCES.has('Mada Masr'))
  // Major wires must NOT be in the niche set, otherwise we'd dedup
  // legitimate breaking news.
  assert.ok(!NICHE_SOURCES.has('Reuters'))
  assert.ok(!NICHE_SOURCES.has('BBC'))
  assert.ok(!NICHE_SOURCES.has('Al Jazeera'))
})

// --- regression guard: existing slug-fuzzy behavior unchanged ---
test('slug-fuzzy thresholds are unchanged (no regression)', () => {
  const sets = buildWordSets([
    '2026-04-17-india-tapentadol-west-africa-opioid-pipeline',
  ])
  // Existing pin from corpus.test.js — must still match.
  assert.equal(
    fuzzyMatch('2026-04-19-bellingcat-tapentadol-india-west-africa-opioid-pipeline', sets),
    '2026-04-17-india-tapentadol-west-africa-opioid-pipeline'
  )
})

// --- URL layer, added 2026-08-30 -------------------------------------------
// The slug, title and eventUri layers all compare *descriptions* of a story, so
// the same wire piece written up twice under different headlines slipped all of
// them. Running this layer over the live 14-day corpus found 28 such pairs
// already published — e.g. one Rest of World piece filed as both
// "china-robotics-component-ban-substitution-assumption" and
// "us-china-robotics-parts-ban-actuator-lead-times-startup-cost".
test('same source URL is caught even when slug and title share nothing', () => {
  const ctx = {
    recentSlugs: [],
    ledgerEventUris: new Map(),
    recentWordSets: [],
    recentTitleSets: [],
    ledgerLabelSets: [],
    recentUrls: new Map([
      ['restofworld.org/2026/china-robot-ban-silicon-valley', '2026-08-17-china-robotics-component-ban-substitution-assumption'],
    ]),
  }
  const dupe = {
    suggestedSlug: '2099-01-01-fixture-robotics-parts-ban-actuator-lead-times',
    title: 'Actuator lead times reprice startup hardware',
    sources: [{ name: 'Rest of World', url: 'https://restofworld.org/2026/china-robot-ban-silicon-valley/' }],
  }
  const r = wouldDedup(dupe, ctx)
  assert.equal(r.deduped, true)
  assert.equal(r.reason, 'url')

  const distinct = { ...dupe, sources: [{ name: 'Rest of World', url: 'https://restofworld.org/2026/some-other-piece' }] }
  assert.equal(wouldDedup(distinct, ctx).deduped, false)
})

test('a bare index path identifies a site, not a story, and never keys the layer', () => {
  // Two unrelated articles were both filed against bankingnews.gr/index.php.
  // Keying on it would have suppressed the second.
  assert.equal(normalizeUrl('https://bankingnews.gr/index.php'), '')
  assert.equal(normalizeUrl('https://example.com'), '')
  assert.equal(normalizeUrl('https://example.com/news'), '')
  const ctx = {
    recentSlugs: [], ledgerEventUris: new Map(), recentWordSets: [],
    recentTitleSets: [], ledgerLabelSets: [],
    recentUrls: new Map([['bankingnews.gr/index.php', '2026-08-19-iran-europe-basing-targets-host-state-exposure']]),
  }
  const other = {
    suggestedSlug: '2099-01-01-fixture-flamingo-plant-strikes-production',
    title: 'Flamingo plant strikes cut production',
    sources: [{ name: 'BankingNews', url: 'https://bankingnews.gr/index.php' }],
  }
  assert.equal(wouldDedup(other, ctx).deduped, false)
})

test('normalizeUrl compares identity, not decoration', () => {
  const canonical = 'rte.ie/news/world/2026/0830/1589694-iceland-eu'
  assert.equal(normalizeUrl('https://www.rte.ie/news/world/2026/0830/1589694-iceland-eu/'), canonical)
  assert.equal(normalizeUrl('http://rte.ie/news/world/2026/0830/1589694-iceland-eu?utm_source=x#top'), canonical)
  assert.equal(normalizeUrl('not a url'), '')
  assert.equal(normalizeUrl(null), '')
})

// Path-only matching looked conservative and was the reverse: dropping the query
// makes unlike things compare equal. Measured over the 8,894-article corpus it
// produced 19 false-positive pairs — every Hacker News item keys to
// `news.ycombinator.com/item`, so 5 of the 6 HN-sourced articles would each have
// been suppressed as a duplicate of the previous one.
test('a publisher that puts the article id in the query keeps its identity', () => {
  const distinct = [
    ['https://news.ycombinator.com/item?id=41234567', 'https://news.ycombinator.com/item?id=99999999'],
    ['https://www.bernama.com/en/news.php?id=2345', 'https://www.bernama.com/en/news.php?id=9876'],
    ['https://www.haaretz.com/x/ty-article-live/?liveBlogItemId=1', 'https://www.haaretz.com/x/ty-article-live/?liveBlogItemId=2'],
    ['https://world.kbs.co.kr/service/news_view.htm?Seq_Code=1', 'https://world.kbs.co.kr/service/news_view.htm?Seq_Code=2'],
  ]
  for (const [a, b] of distinct) {
    assert.notEqual(normalizeUrl(a), normalizeUrl(b), `${a} must not key the same as ${b}`)
    assert.ok(normalizeUrl(a), 'an id-in-query URL must still produce a key')
  }
})

test('tracking noise and param order are not identity', () => {
  assert.equal(
    normalizeUrl('https://restofworld.org/2026/x/?utm_source=rss&utm_medium=feed'),
    normalizeUrl('https://restofworld.org/2026/x'),
  )
  assert.equal(normalizeUrl('https://ex.com/a?b=2&a=1'), normalizeUrl('https://ex.com/a?a=1&b=2'))
  assert.equal(normalizeUrl('https://ex.com/a?fbclid=zz'), normalizeUrl('https://ex.com/a'))
})
