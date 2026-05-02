// Run: node --test scripts/lib/dedup.test.js
//
// Pins the recap-detection layer added 2026-05-02 after the audit found
// 31 niche-only articles that recapped events covered 2-10 days earlier
// by major outlets — a pattern the slug-fuzzy layer kept missing because
// niche outlets reword headlines and slug truncation drops endings.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
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
