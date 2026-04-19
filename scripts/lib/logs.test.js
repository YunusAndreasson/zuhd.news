// Run: node --test scripts/lib/logs.test.js
//
// Audits recent cycle logs for symptoms that would otherwise go unnoticed.
// Every assertion here was added because the audit on 2026-04-19 found
// something real and silent: stage failures that didn't halt the cycle,
// git push failures demoted to warnings, validator moves to .bad files,
// feed-volume anomalies, or publish rate collapse.
//
// Each check ratchets against an observed window, not a wishful target —
// failures mean "something new has broken", not "the pipeline isn't perfect".
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync, existsSync } from 'fs'

const LOG_DIR = 'logs'
const WINDOW = 14 // last N cycles

function loadRecent() {
  if (!existsSync(LOG_DIR)) return []
  const files = readdirSync(LOG_DIR).filter(f => f.startsWith('cycle-') && f.endsWith('.log')).sort()
  return files.slice(-WINDOW).map(f => ({ f, raw: readFileSync(`${LOG_DIR}/${f}`, 'utf8') }))
}

const num = (raw, re) => { const m = raw.match(re); return m ? +m[1] : null }

// Silent stage failures: 2026-04-14 22:01 and 2026-04-17 17:03 both emitted
// `Edu context exit: 1` with empty stderr. The cycle continued; articles
// shipped without educational context briefs. Catch any NEW non-zero exit
// beyond this known-bad set — which itself is a TODO to investigate.
test('no new silent stage failures', () => {
  const KNOWN_BAD = new Set([
    'cycle-2026-04-14_2201.log: Edu context exit=1', // 40s — immediate error, empty stderr
    'cycle-2026-04-17_1703.log: Edu context exit=1', // 301s — ran then failed, empty stderr
  ])
  const failures = []
  const stages = ['Selector', 'Writer', 'Editor', 'Edu context', 'Build', 'Deploy', 'Briefing']
  for (const { f, raw } of loadRecent()) {
    for (const stage of stages) {
      const re = new RegExp(`^${stage} exit: ([1-9]\\d*)`, 'm')
      const m = raw.match(re)
      if (m) {
        const key = `${f}: ${stage} exit=${m[1]}`
        if (!KNOWN_BAD.has(key)) failures.push(key)
      }
    }
  }
  assert.deepEqual(failures, [], `new stage failures:\n  ${failures.join('\n  ')}`)
})

// Git push failure is logged only as WARNING in run-cycle.sh and the cycle
// proceeds. Deploy still works (wrangler uploads local files) but the git
// remote drifts, and the next cycle's pull can conflict. 5 occurrences
// total across the corpus, 3 clustered on 2026-04-18→19 — that cluster is
// the current debt; the ratchet prevents growth.
test('git push failure rate does not grow', () => {
  const all = readdirSync(LOG_DIR).filter(f => f.startsWith('cycle-') && f.endsWith('.log'))
  const failed = all.filter(f => /WARNING: git push failed/.test(readFileSync(`${LOG_DIR}/${f}`, 'utf8')))
  const BASELINE = 5 // 2026-04-19 audit
  assert.ok(failed.length <= BASELINE,
    `git push failures ${failed.length} > baseline ${BASELINE}; new:\n  ${failed.slice(BASELINE).join('\n  ')}`)
})

// Validator SKIPs move files to .bad. Every SKIP is an article lost.
// Pre-sentence-splitter-fix the SKIP lines were: 2026-04-13, 2026-04-19.
// Post-fix there should be zero SKIPs in new cycles; if one appears it's
// either a real content problem or a new splitter regression.
test('no validator SKIPs in recent cycles after splitter fix', () => {
  const FIX_CUTOFF = 'cycle-2026-04-19_0803.log' // splitter fix applied after this cycle
  const recent = loadRecent().filter(({ f }) => f > FIX_CUTOFF)
  const skips = []
  for (const { f, raw } of recent) {
    for (const line of raw.split('\n')) if (/^SKIP \(/.test(line)) skips.push(`${f}: ${line}`)
  }
  assert.deepEqual(skips, [], `validator SKIPs after splitter fix:\n  ${skips.join('\n  ')}`)
})

// Publish-rate collapse: 2026-04-19 08:03 produced only 3 articles (mean
// is ~9.4, min was 3 before today). A single cycle <6 is a smell, a
// trend below mean is a regression. Ratchet on mean-over-window.
test('publish rate does not collapse', () => {
  const counts = []
  for (const { raw } of loadRecent()) {
    const p = num(raw, /^Published:\s+(\d+)/m)
    if (p != null) counts.push(p)
  }
  if (counts.length < 3) return
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length
  const FLOOR = 7 // historical mean 9.4, min 3; 7 = two-thirds of mean
  assert.ok(mean >= FLOOR, `publish mean ${mean.toFixed(1)} < floor ${FLOOR} over last ${counts.length} cycles`)
})

// Feed-volume drops signal upstream source issues (RSS parser broke, API
// quota hit, or a site redesigned its feed). Observed niche mean ~72,
// with a 2026-04-12→13 dip into the 40s (unexplained) and a 2026-04-19
// dip to 65. A floor at 50 catches cataclysmic drops while tolerating
// normal variance.
test('feed niche volume above catastrophic floor', () => {
  const vols = []
  for (const { raw } of loadRecent()) {
    const v = num(raw, /Merged feed: \d+ multi \+ (\d+) niche/)
    if (v != null) vols.push(v)
  }
  const FLOOR = 50
  const low = vols.filter(v => v < FLOOR)
  assert.equal(low.length, 0, `cycles with niche volume < ${FLOOR}: ${JSON.stringify(low)}`)
})

// Data-integrity sanity: Selected = (items after dedup) + (already published).
// If these stop balancing, either dedup-selection.js changed its log format
// or a new stage is silently dropping items. Cheap sentinel for prompt drift.
test('funnel arithmetic balances', () => {
  const broken = []
  for (const { f, raw } of loadRecent()) {
    const selected = num(raw, /^Selected:\s+(\d+)/m)
    const remaining = num(raw, /^Deduped:\s+(\d+)/m)
    const alreadyPub = num(raw, /\((\d+) already published\)/) ?? 0
    if (selected != null && remaining != null && selected !== remaining + alreadyPub) {
      broken.push(`${f}: ${selected} !== ${remaining} + ${alreadyPub}`)
    }
  }
  assert.deepEqual(broken, [], `funnel imbalance:\n  ${broken.join('\n  ')}`)
})
