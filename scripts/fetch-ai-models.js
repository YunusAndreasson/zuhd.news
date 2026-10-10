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

import { AI_LABS } from './lib/ai-lab-metadata.js'
import { aiModelsSnapshot } from './lib/ai-models.js'
import { hasFlag } from './lib/argv.js'
import { fetchText } from './lib/http.js'
import { Degrade, snapshotStage } from './lib/snapshot-stage.js'

const BASE = 'https://epoch.ai/data'
const REFETCH_AFTER_MS = 20 * 3600_000
// The scores file is 33KB; the deadline is for a slow day, not a large body.
const TIMEOUT_MS = 30_000

const started = Date.now()

/** A file's text, or null with the reason logged. */
const get = async (name) => {
  try {
    return await fetchText(`${BASE}/${name}`, { timeoutMs: TIMEOUT_MS })
  } catch (err) {
    console.error(`  ⚠ ${name}: ${err?.message || err}`)
    return null
  }
}

const { written, snapshot } = await snapshotStage('fetch-ai-models', 'aiModels', produce, {
  // `aiModelsSnapshot` refuses a scores file with no lab in it itself, and says why.
  isEmpty: (s) => s.labs.length === 0,
  freshFor: REFETCH_AFTER_MS,
  // The fetcher's own clock. `generated` is the stamp the build holds still.
  freshBy: 'fetched',
  force: hasFlag('force'),
  now: started,
})

if (written) {
  const withMoney = snapshot.labs.filter((l) => l.revenue || l.valuation).length
  console.log(
    `  ✓ wrote ${snapshot.labs.length}/${AI_LABS.length} labs from ${snapshot.models} scored models` +
      ` (${withMoney} with revenue or valuation; best: ${snapshot.frontier.model}, ${snapshot.frontier.score})` +
      ` in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  )
}

/** The snapshot from Epoch's three files, with the last one's money where a side file did not come. */
async function produce({ previous }) {
  console.log(`Fetching AI model scores (Epoch AI, ${AI_LABS.length} labs)`)

  const [eci, revenue, funding] = await Promise.all([
    get('eci_scores.csv'),
    get('ai_companies_revenue_reports.csv'),
    get('ai_companies_funding_rounds.csv'),
  ])
  if (eci === null) throw new Degrade('no scores returned')

  const { snapshot, rejected, notes } = aiModelsSnapshot(
    { eci, revenue, funding },
    { labs: AI_LABS, now: started, previous },
  )
  for (const note of notes) console.error(`  ⚠ ${note}`)
  if (!snapshot) throw new Degrade(`rejected: ${rejected}`)

  for (const s of snapshot.skipped) console.error(`  ⚠ left out ${s.id}: ${s.reason}`)
  return snapshot
}
