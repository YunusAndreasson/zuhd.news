#!/usr/bin/env node
// Score the cycle's batch and add the record to the RVS trend, which the
// dashboard draws. The score is `lib/rvs.js`: three clusters from the
// articles alone, no model and no tokens.
//
// After the deploy, and fail-soft: whatever goes wrong here, the cycle has
// already published. The trend file is the only output.

import { existsSync } from 'node:fs'
import { batchFiles } from './lib/article-files.js'
import { pathOf } from './lib/datasets.js'
import { appendRecord, readBatch, rvsRecord } from './lib/rvs.js'
import { runStage } from './lib/stage.js'

export function main() {
  try {
    if (!existsSync(pathOf('newArticles'))) {
      console.log('No new articles list — skipping production RVS scoring')
      return { skipped: 'no new-articles list' }
    }
    const files = batchFiles()
    if (files.length === 0) {
      console.log('Empty article list — skipping production RVS scoring')
      return { skipped: 'the new-articles list is empty' }
    }

    // A story's age is taken against the moment the cycle began, which the
    // runner leaves in the environment beside the cycle's id; a run by hand
    // has only the clock.
    const runStarted = Date.parse(process.env.ZUHD_RUN_STARTED ?? '')
    const record = rvsRecord(readBatch(files), { runId: process.env.ZUHD_RUN_ID || null, ...(Number.isNaN(runStarted) ? {} : { runStarted }) })
    appendRecord(pathOf('rvsTrend'), record)
    const { writing, sourcing, coverage } = record.clusters
    console.log(`Production RVS: ${record.rvs.toFixed(2)}  (writing=${writing.toFixed(0)}  sourcing=${sourcing.toFixed(0)}  coverage=${coverage.toFixed(0)})`)
    return { counts: { articles: record.articleCount } }
  } catch (err) {
    // Never the cycle's failure: it exits 0, as it always has.
    const { message } = /** @type {Error} */ (err)
    console.error(`RVS scoring failed (fail-soft): ${message}`)
    return { degraded: message }
  }
}

await runStage(import.meta, 'score-production-cycle', main)
