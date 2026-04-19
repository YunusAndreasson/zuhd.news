// Run: node --test scripts/lib/corpus.test.js
//
// Corpus invariants: each test ratchets a measurable property of the
// published corpus. If a pipeline change silently worsens any of them,
// the test fails with actionable diagnostics. Baselines are current
// observed values, not aspirational targets — fail on regression, not
// on the pre-existing debt.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'fs'
import { parseFrontmatter } from './frontmatter.js'
import { slugWords, fuzzyMatch, buildWordSets } from './dedup.js'

const DIR = 'content/articles/'
const VALID_CATS = new Set(['politics', 'economy', 'science', 'tech'])
const REQUIRED = ['title', 'date', 'category', 'location', 'sources']

function loadCorpus() {
  return readdirSync(DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const raw = readFileSync(DIR + f, 'utf8')
      const { meta, body } = parseFrontmatter(raw)
      return { f, slug: f.replace('.md', ''), meta, body }
    })
}

// --- Schema ratchets ---
// Every shipped article must parse and carry the fields the validator,
// build, and mobile client all depend on. A writer-prompt drift that
// drops `category` would silently break category routing without this.
test('every article parses with all required fields', () => {
  const broken = []
  for (const { f, meta } of loadCorpus()) {
    if (!meta || typeof meta !== 'object') { broken.push(`${f}: unparseable`); continue }
    for (const k of REQUIRED) if (!(k in meta)) broken.push(`${f}: missing ${k}`)
    if (meta.category && !VALID_CATS.has(meta.category)) broken.push(`${f}: invalid category ${meta.category}`)
    if (!Array.isArray(meta.sources) || meta.sources.length === 0) broken.push(`${f}: no sources`)
    for (const s of meta.sources || []) {
      if (!s?.name) broken.push(`${f}: source missing name`)
      if (!s?.url || !/^https?:\/\//.test(s.url)) broken.push(`${f}: source bad url ${s?.url}`)
      if (s.country && !/^[A-Z]{2}$/.test(String(s.country))) broken.push(`${f}: bad country code ${s.country}`)
    }
  }
  assert.deepEqual(broken, [], `schema violations:\n  ${broken.slice(0, 20).join('\n  ')}`)
})

// --- Coordinate sanity ---
// A typo in lat/lng (e.g. 138.90 for 38.90) silently breaks the globe
// marker and heatmap. Cheap to check.
test('lat/lng within valid ranges', () => {
  const bad = []
  for (const { f, meta } of loadCorpus()) {
    if ('lat' in meta && (typeof meta.lat !== 'number' || meta.lat < -90 || meta.lat > 90)) bad.push(`${f}: lat=${meta.lat}`)
    if ('lng' in meta && (typeof meta.lng !== 'number' || meta.lng < -180 || meta.lng > 180)) bad.push(`${f}: lng=${meta.lng}`)
  }
  assert.deepEqual(bad, [], `coord violations:\n  ${bad.join('\n  ')}`)
})

// --- Country-link syntax ---
// Writer emits `[Label](country:XX)` with ISO alpha-2 codes. A model
// drift to `country:USA` or `country:us` would silently break the
// mobile country-tap handler without this test.
test('body country links use two-letter uppercase codes', () => {
  const bad = []
  for (const { f, body } of loadCorpus()) {
    for (const m of body.matchAll(/\[[^\]]+\]\(country:([^)]+)\)/g)) {
      if (!/^[A-Z]{2}$/.test(m[1])) bad.push(`${f}: ${m[1]}`)
    }
  }
  assert.deepEqual(bad, [], `malformed country links:\n  ${bad.join('\n  ')}`)
})

// --- Duplicate-event ratchet ---
// The 74 same-day / 148 7-day pair baseline was established 2026-04-19 by
// corpus audit. These are real duplicates that shipped to readers and
// reflect an unfixed intra-batch dedup gap. Any *new* dupe increases the
// count; the ratchet catches the regression while allowing the debt to
// be paid down (lowering the baseline) over time.
test('no new duplicate-event publishes (same-day ratchet)', () => {
  const recs = loadCorpus().map(r => ({ f: r.f, date: r.f.slice(0, 10), words: slugWords(r.slug) }))
  let pairs = 0
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      if (recs[i].date !== recs[j].date) continue
      const a = recs[i].words, b = recs[j].words
      const overlap = [...a].filter(w => b.has(w)).length
      const ratio = overlap / Math.min(a.size, b.size)
      if (ratio >= 0.7 && overlap >= 4) pairs++
    }
  }
  const BASELINE = 74 // 2026-04-19 audit; lower this when backfilled
  assert.ok(pairs <= BASELINE, `same-day dup pairs ${pairs} > baseline ${BASELINE}; new intra-batch duplicates`)
})

// --- dedup.fuzzyMatch behavioral pins ---
// The 60% / 3-word thresholds were tuned to catch selector slug rewrites
// like `2026-04-19-bellingcat-tapentadol-india-west-africa-opioid-pipeline`
// collapsing to published `2026-04-17-india-tapentadol-west-africa-opioid-pipeline`.
// If someone loosens or tightens the threshold, these assertions fire.
test('fuzzyMatch catches selector-style slug rewrites', () => {
  const published = [
    '2026-04-17-india-tapentadol-west-africa-opioid-pipeline',
    '2026-04-17-kuwait-citizenship-stripping-denaturalisation-gulf-authoritarian',
    '2026-04-17-bangladesh-gig-workers-hormuz-fuel-shortage',
  ]
  const sets = buildWordSets(published)
  // Known selector rewrites from 2026-04-19 08:03 cycle — all must match.
  assert.equal(fuzzyMatch('2026-04-19-bellingcat-tapentadol-india-west-africa-opioid-pipeline', sets),
    '2026-04-17-india-tapentadol-west-africa-opioid-pipeline')
  assert.equal(fuzzyMatch('2026-04-19-kuwait-citizenship-stripping-one-in-five', sets),
    '2026-04-17-kuwait-citizenship-stripping-denaturalisation-gulf-authoritarian')
  assert.equal(fuzzyMatch('2026-04-19-bangladesh-fuel-gig-workers-hormuz-dependency', sets),
    '2026-04-17-bangladesh-gig-workers-hormuz-fuel-shortage')
})

test('fuzzyMatch does not conflate unrelated stories', () => {
  const sets = buildWordSets([
    '2026-04-17-iran-nuclear-talks-pakistan-mediator',
    '2026-04-17-ukraine-drones-russia-oil-refinery',
  ])
  // Shares only 'iran' + date — must NOT match.
  assert.equal(fuzzyMatch('2026-04-19-iran-parliament-speaker-economy', sets), null)
  // Shares 'ukraine' + 'russia' only — 2 words, below the 3-overlap floor.
  assert.equal(fuzzyMatch('2026-04-19-ukraine-ceasefire-russia-proposal', sets), null)
})
