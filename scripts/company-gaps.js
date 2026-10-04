#!/usr/bin/env node
// Coverage-gap signal for the selector: the largest companies whose share
// moved sharply this week with no story on the site to say why
// (`lib/company-gaps.js`).
//
// Output: up to three lines of "Name (what it does): up 8.6% in a week" on
// stdout; empty output (exit 0) when there are none or on any failure, so
// run-cycle.sh simply skips the injection.
//
// Usage:
//   node scripts/company-gaps.js
//   node scripts/company-gaps.js --companies /path/to/companies.json   # replay

import { moverLine, readUnexplainedMovers } from './lib/company-gaps.js'

const at = process.argv.indexOf('--companies')
const companiesPath = at > -1 ? process.argv[at + 1] : undefined

try {
  const lines = readUnexplainedMovers(companiesPath ? { companiesPath } : {}).map(moverLine)
  if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`)
} catch {
  // Fail-soft: empty output, exit 0.
}
