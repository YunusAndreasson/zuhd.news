// Run: node --test scripts/lib/corpus.test.js
//
// Corpus invariants: each test ratchets a measurable property of the
// published corpus. If a pipeline change silently worsens any of them,
// the test fails with actionable diagnostics. Baselines are current
// observed values, not aspirational targets — fail on regression, not
// on the pre-existing debt.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
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

// --- Corrections ---
// A correction that fails to render is the exact failure this mechanism exists
// to prevent: the article is quietly fixed and the reader is never told it was
// ever wrong. `parseCorrections` in build.js drops a malformed entry rather
// than throwing mid-build, which is right for a live pipeline and useless as a
// warning — so the warning is here. Any `corrections:` block that would not
// survive that filter fails the build.
test('every correction on file would actually be published', () => {
  const broken = []
  let total = 0
  for (const { f, meta } of loadCorpus()) {
    if (!('corrections' in (meta || {}))) continue
    if (!Array.isArray(meta.corrections)) { broken.push(`${f}: corrections is not a list`); continue }
    for (const c of meta.corrections) {
      total++
      if (!c || typeof c !== 'object') { broken.push(`${f}: correction is not a mapping`); continue }
      // Both fields are load-bearing. Without a note it corrects nothing;
      // without a date it cannot be placed against the version it applies to,
      // and it drives `dateModified` and the feed's `<updated>`.
      if (!c.note || !String(c.note).trim()) broken.push(`${f}: correction has no note`)
      if (!Number.isFinite(Date.parse(String(c.date)))) broken.push(`${f}: correction has an unparseable date ${c.date}`)
      // A correction predating the article it corrects is a data error, and it
      // would push the story backwards in the Atom feed rather than surfacing it.
      else if (meta.date && Date.parse(String(c.date)) < Date.parse(String(meta.date)))
        broken.push(`${f}: correction dated before publication`)
    }
  }
  assert.deepEqual(broken, [], `${total} corrections on file, violations:\n  ${broken.slice(0, 20).join('\n  ')}`)
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
// reflected an unfixed intra-batch dedup gap. Any *new* dupe increases the
// count; the ratchet catches the regression while allowing the debt to
// be paid down (lowering the baseline) over time.
//
// 75, 2026-08-09: skyroot-vikram-1-india-first-private-orbital-launch /
// skyroot-vikram-1-india-private-orbital-rocket (both 2026-07-18, 83% slug-word
// overlap) — the same intra-batch gap the note above describes, both selected
// in one cycle and neither existed in content/articles/ yet when the other was
// checked, so dedup-selection.js's corpus-only lookup passed both. The *cause*
// is fixed (dedup-selection.js now also fuzzy-matches each candidate against
// the others already accepted from the same selection), so this baseline moves
// to record the one pair that had already shipped before the fix landed, not to
// mask a new unfixed one. Paying it down means merging or redirecting one of
// the two articles, which is an editorial call.
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
  const BASELINE = 75 // 2026-08-09: +1 for the skyroot pair above; lower this when backfilled
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

// --- Desk-prose ratchets ---
//
// The dispatch files are the desk's prose about instruments, and they fail in
// ways the article ratchets above cannot see. Both checks below are quoted from
// the 2026-09-05 run that shipped them.

import { promptEcho, promptExamples } from './grounding.js'

/** `{ items: { id: { standing, recent } } }`, or `{}` where the stage has never
 *  run in this checkout. Absent is not a failure — these files are pipeline
 *  outputs and a fresh clone carries whatever the last cycle committed. */
const loadDispatch = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')).items || {}
  } catch {
    return {}
  }
}

test('no shipped sentence is its own prompt\'s worked example', () => {
  // On 2026-09-05 the live definition of Brent crude was
  // `narrate-indicators-prompt.md`'s sample sentence at 100%, and three FOMC
  // events shipped one shared ✓ example between them at 49–63%. Both prompts
  // now illustrate with instruments this pipeline does not carry; this is how
  // you find out that stopped being true.
  const pairs = [
    ['scripts/narrate-indicators-prompt.md', 'content/.indicator-dispatch.json'],
    ['scripts/narrate-events-prompt.md', 'content/.events-dispatch.json'],
  ]
  const offenders = []
  for (const [promptPath, dispatchPath] of pairs) {
    const examples = promptExamples(readFileSync(promptPath, 'utf8'))
    assert.ok(examples.length > 0, `${promptPath} has no extractable examples`)
    for (const [id, v] of Object.entries(loadDispatch(dispatchPath))) {
      for (const field of ['standing', 'recent']) {
        const text = (v[field] || '').trim()
        if (!text) continue
        const echo = promptEcho(text, examples)
        if (echo && echo.frac >= 0.5) {
          offenders.push(`${id}.${field} is ${(echo.frac * 100).toFixed(0)}% a prompt example: "${text.slice(0, 120)}"`)
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `\n${offenders.join('\n')}\n`)
})

test('no two instruments ship the same explanation', () => {
  // "Five central-bank events recited the same two figures, so five cards said
  // one thing" was fixed by a prompt edit that produced three cards reciting
  // one *sentence* instead. The shape of the duplication changes; that several
  // cards say one thing is the thing to catch.
  const shingles = (s) => {
    const w = String(s).toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter(Boolean)
    const out = new Set()
    for (let i = 0; i + 6 <= w.length; i++) out.add(w.slice(i, i + 6).join(' '))
    return out
  }
  const rows = []
  for (const path of ['content/.indicator-dispatch.json', 'content/.events-dispatch.json']) {
    for (const [id, v] of Object.entries(loadDispatch(path))) {
      if (v.recent?.trim()) rows.push({ id, s: shingles(v.recent), text: v.recent })
    }
  }
  const dupes = []
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i].s
      const b = rows[j].s
      if (!a.size || !b.size) continue
      let hit = 0
      for (const x of a) if (b.has(x)) hit++
      const jaccard = hit / (a.size + b.size - hit)
      // 0.30 is the ratchet: the three FOMC pairs measured 0.30, 0.39 and 0.43,
      // and the highest genuinely-distinct pair in the same run was 0.25 — two
      // Ukraine ceasefire markets that really are about one diplomatic trip.
      if (jaccard >= 0.3) dupes.push(`${rows[i].id} ~ ${rows[j].id} (${(jaccard * 100).toFixed(0)}%)`)
    }
  }
  /**
   * The debt this ratchet was written against, and it is expected to empty.
   *
   * These three shipped on 2026-09-05 because `narrate-events-prompt.md`'s ✓
   * example named the Federal Reserve, so all three FOMC cards handed it back.
   * The prompt now illustrates with an institution this pipeline does not
   * carry, and both dispatch stages run only at 04:00 UTC — so the next full
   * pass rewrites them and **these three entries should be deleted**, not
   * carried. Per this file's header: baselines are observed values, and the
   * point is to fail on a *new* pair, not on the pre-existing debt.
   */
  const KNOWN = new Set([
    'fomc-2026-09 ~ fomc-2026-10',
    'fomc-2026-09 ~ fomc-2026-12',
    'fomc-2026-10 ~ fomc-2026-12',
  ])
  const fresh = dupes.filter((d) => !KNOWN.has(d.replace(/ \(\d+%\)$/, '')))
  assert.deepEqual(fresh, [], `\ncards saying one thing:\n${fresh.join('\n')}\n`)
})
