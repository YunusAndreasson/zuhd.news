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
    'cycle-2026-04-24_2204.log: Editor exit=124',    // editor timeout (1800s); cycle still published via run-cycle.sh
    'cycle-2026-04-23_1800.log: Selector exit=1',    // Claude API usage limit hit ("You've hit your limit · resets 9pm"); 4s — no retry path because the rate limit is per-account
    'cycle-2026-05-08_0404.log: Selector exit=1',    // Anthropic 5xx ("API Error: Internal server error") at 417s — transient upstream failure, no retry wired in run-cycle.sh; missed the 04:00 audio briefing as a side effect
    'cycle-2026-05-27_0801.log: Selector exit=1',    // AUP false-positive block ("appears to violate our Usage Policy", req_011CbSiwiHZX697HL8MVrd4R) at 26s — transient content-policy trip on a conflict/surveillance-heavy feed; no retry path; cycle aborted cleanly (0 published) rather than shipping garbage
    'cycle-2026-05-26_0802.log: Editor exit=124', // editor timeout (1801s) — benign mode: cycle still published 12 via run-cycle.sh (same as 2026-04-24_2204)
    'cycle-2026-05-27_0404.log: Editor exit=124', // editor timeout (1800s) — benign mode: cycle still published 10 via run-cycle.sh
    // Writer API stalls — investigated 2026-05-27. Both ran the full 1800s with zero output and
    // published nothing. Root cause: the `claude -p` request stalled with no response — the
    // service consumed only ~1.5min CPU over the 36min wall window (idle-blocked, not looping;
    // box had 6GB free, no OOM), so the outer `timeout 1800` killed it (and the SIGTERM lost the
    // session transcript, hence the blank log). Same class as the 2026-05-08 selector 5xx entry:
    // transient upstream stall. RESOLVED 2026-06-12: run-cycle.sh now retries the Writer once
    // on exit=124 when zero articles were produced, so a transient stall no longer loses the cycle.
    'cycle-2026-05-24_2201.log: Writer exit=124', // API stall — Published: 0
    'cycle-2026-05-26_1701.log: Writer exit=124', // API stall — Published: 0
    // Audio briefing crashed on Google TTS `3 INVALID_ARGUMENT` while synthesizing
    // category chunk 4/5 — malformed SSML from a chunk-boundary split. The throw was
    // uncaught, so the whole day's briefing died after intro+3 categories had already
    // synthesized. FIXED in generate-briefing.js: synthesizeChunk() now retries a
    // rejected chunk as plain text and drops just that chunk on a second failure
    // instead of crashing. Entry kept only until this log rotates out of the 14-cycle window.
    'cycle-2026-06-12_0403.log: Briefing exit=1',
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
// remote drifts, and the next cycle's pull can conflict. The recurring cause
// is divergence: mobile-app work is pushed to the GitHub remote from a dev
// machine while editorial cycles commit content/ locally, so a plain `git
// push` is rejected non-fast-forward until someone reconciles. History:
//   - 2026-04-18→19: 3 failures (original debt)
//   - 2026-04-23→25: 12 failures from a parallel backlog merge; reconciled
//     manually 2026-04-25, baseline raised to the post-reconciliation count (17)
//   - 2026-05-22→27: 21 failures — every cycle's push rejected because local
//     sat 70 ahead / 30 behind origin/master (30 mobile-only commits upstream).
//     Reconciled 2026-05-27 via `git merge origin/master` (disjoint file sets,
//     clean). Baseline reset below to the post-reconciliation count.
// NOTE: this counts across ALL logs on disk, but cycle logs rotate, so the
// baseline only stays meaningful while the failing logs are still present —
// once they age out the count drops well under baseline (still passes). The
// ratchet's real job is to fire when a NEW divergence cluster starts growing.
test('git push failure rate does not grow', () => {
  const all = readdirSync(LOG_DIR).filter(f => f.startsWith('cycle-') && f.endsWith('.log'))
  const failed = all.filter(f => /WARNING: git push failed/.test(readFileSync(`${LOG_DIR}/${f}`, 'utf8')))
  const BASELINE = 21 // 2026-05-27 reconciliation: May 22→27 divergence cluster (April logs already rotated off disk)
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
//
// Only counts cycles that completed the Editor stage cleanly. An aborted
// cycle (timeout, rate limit, selector failure) trivially has Published=0
// because it never reached the publish step — that's a pipeline-reliability
// problem, not a publish-rate one, and `no new silent stage failures` above
// is the test that catches it. Mixing aborts into the publish mean made
// this test fire on environments running a partially broken local pipeline
// while still publishing fine in CI.
test('publish rate does not collapse', () => {
  const counts = []
  for (const { raw } of loadRecent()) {
    if (!/^Editor exit: 0/m.test(raw)) continue
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
//
// Skips cycles where the multi-source feed didn't fetch at all (multi=0).
// Those are NewsAPI / network failures upstream of the niche pipeline —
// the niche count is still reported but the cycle as a whole was already
// degraded, and the niche feed's RSS sources tend to have a correlated
// drop when the upstream multi fetch dies (same machine, same window).
test('feed niche volume above catastrophic floor', () => {
  const vols = []
  for (const { raw } of loadRecent()) {
    const m = raw.match(/Merged feed: (\d+) multi \+ (\d+) niche/)
    if (!m) continue
    if (+m[1] === 0) continue
    vols.push(+m[2])
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
