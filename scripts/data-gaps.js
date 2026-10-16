#!/usr/bin/env node
// Coverage-gap signal for the selector: the disasters, contract swings and
// currency moves in the last cycle's snapshots that no story on the site has
// reported (`lib/data-gaps.js`).
//
// Output: up to seven lines on stdout, and nothing else there: the selector
// step pastes stdout into the prompt. No lines when nothing moved; a snapshot
// that could not be read is named on stderr (`skipped`), and the other's gaps
// still print. A failure exits non-zero with the error on stderr, which the
// step reads as no injection.
//
// Usage:
//   node scripts/data-gaps.js
//   node scripts/data-gaps.js --gdacs /path/to/gdacs.json --trends /path/to/trends.json   # replay

import { argAt } from './lib/argv.js'
import { loadDataGaps } from './lib/data-gaps.js'
import { runStage } from './lib/stage.js'

export function main() {
  const gdacsPath = argAt('gdacs')
  const trendsPath = argAt('trends')
  const { gaps, skipped } = loadDataGaps({ ...(gdacsPath ? { gdacsPath } : {}), ...(trendsPath ? { trendsPath } : {}) })
  for (const why of skipped) console.error(`data-gaps: ${why}`)
  if (gaps.length > 0) process.stdout.write(`${gaps.map((g) => g.line).join('\n')}\n`)
  return { counts: Object.fromEntries(['hazard', 'odds', 'fx'].map((k) => [k, gaps.filter((g) => g.kind === k).length])) }
}

await runStage(import.meta, 'data-gaps', main)
