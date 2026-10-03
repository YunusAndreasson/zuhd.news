#!/usr/bin/env node
// How capable each AI lab's models are, for the app's `AI models` list.
//
// Output: content/.ai-models.json
// Shape:  { generated, fetched, source, sourceUrl, license, models, frontier:
//          { score, model, lab }, labs: [{ id, name, iso2, blurb, model, score,
//          low?, high?, asOf, series: { periods, values, models }, revenue?,
//          valuation? }], skipped }
//
// Reads AI_LABS from lib/ai-lab-metadata.js and three CSVs from Epoch AI
// (CC BY 4.0, no key): the Capabilities Index scores, and the company revenue
// and funding reports. `lib/ai-models.js` does the arithmetic.
//
// Once a day, not once a cycle: the files change a few times a week at most,
// and five requests a day for the same bytes is not how to treat a source
// that asks nothing for them. The cycle calls this every run and the snapshot's
// own `fetched` stamp decides; `--force` fetches regardless. A weekly clock
// gate was the alternative, and it skips a whole week when one cycle is missed.
//
// Best-effort, like every fetcher: if the scores do not come back, or are not
// what they were, the script logs and exits 0 with the previous snapshot in
// place. The company files are a side dish — one failing keeps the figures the
// last snapshot had.

import { join } from 'node:path'
import { AI_LABS } from './lib/ai-lab-metadata.js'
import { aiModelsSnapshot } from './lib/ai-models.js'
import { hasFlag } from './lib/argv.js'
import { fetchText } from './lib/http.js'
import { readJson, writeJson } from './lib/json-file.js'
import { ROOT } from './lib/paths.js'

const OUTPUT_PATH = join(ROOT, 'content', '.ai-models.json')
const BASE = 'https://epoch.ai/data'
const REFETCH_AFTER_MS = 20 * 3600_000
// The scores file is 33KB; the deadline is for a slow day, not a large body.
const TIMEOUT_MS = 30_000

const started = Date.now()
const previous = readJson(OUTPUT_PATH)

const age = previous?.fetched ? started - Date.parse(previous.fetched) : Number.POSITIVE_INFINITY
if (!hasFlag('force') && age >= 0 && age < REFETCH_AFTER_MS) {
  console.log(`AI models: fetched ${(age / 3600_000).toFixed(1)}h ago — keeping the snapshot`)
  process.exit(0)
}

console.log(`Fetching AI model scores (Epoch AI, ${AI_LABS.length} labs)`)

/** A file's text, or null with the reason logged. */
const get = async (name) => {
  try {
    return await fetchText(`${BASE}/${name}`, { timeoutMs: TIMEOUT_MS })
  } catch (err) {
    console.error(`  ⚠ ${name}: ${err?.message || err}`)
    return null
  }
}

const [eci, revenue, funding] = await Promise.all([
  get('eci_scores.csv'),
  get('ai_companies_revenue_reports.csv'),
  get('ai_companies_funding_rounds.csv'),
])

if (eci === null) {
  console.error('  ✗ no scores returned — leaving previous snapshot in place')
  process.exit(0)
}

const { snapshot, rejected, notes } = aiModelsSnapshot(
  { eci, revenue, funding },
  { labs: AI_LABS, now: started, previous },
)
for (const note of notes) console.error(`  ⚠ ${note}`)

if (!snapshot) {
  console.error(`  ✗ rejected: ${rejected} — leaving previous snapshot in place`)
  process.exit(0)
}

for (const s of snapshot.skipped) console.error(`  ⚠ left out ${s.id}: ${s.reason}`)

writeJson(OUTPUT_PATH, snapshot)

const withMoney = snapshot.labs.filter((l) => l.revenue || l.valuation).length
console.log(
  `  ✓ wrote ${snapshot.labs.length}/${AI_LABS.length} labs from ${snapshot.models} scored models` +
    ` (${withMoney} with revenue or valuation; best: ${snapshot.frontier.model}, ${snapshot.frontier.score})` +
    ` in ${((Date.now() - started) / 1000).toFixed(1)}s`,
)
