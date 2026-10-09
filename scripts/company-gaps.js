#!/usr/bin/env node
// Coverage-gap signal for the selector: the largest companies whose share
// moved sharply this week with no story on the site to say why
// (`lib/company-gaps.js`).
//
// Output: up to three lines of "Name (what it does): up 8.6% in a week" on
// stdout, and nothing else there: the selector step pastes stdout into the
// prompt. No lines when no share moved, when there is no snapshot to read
// (`skipped`, with the reason) and when the stage fails, which it now does
// out loud: a non-zero exit and the error on stderr. The step reads only
// stdout, so each of those is still "no injection".
//
// Usage:
//   node scripts/company-gaps.js
//   node scripts/company-gaps.js --companies /path/to/companies.json   # replay

import { argAt } from './lib/argv.js'
import { loadUnexplainedMovers, moverLine } from './lib/company-gaps.js'
import { runStage } from './lib/stage.js'

export function main() {
  const companiesPath = argAt('companies')
  const { movers, skipped } = loadUnexplainedMovers(companiesPath ? { companiesPath } : {})
  if (skipped) {
    console.error(`company-gaps: ${skipped}`)
    return { skipped }
  }
  const lines = movers.map(moverLine)
  if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`)
  return { counts: { movers: lines.length } }
}

await runStage(import.meta, 'company-gaps', main)
