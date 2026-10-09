#!/usr/bin/env node
// Record that a cycle ended without publishing, and say so on stdout.
// Called on a cycle's way out (`Cycle.alert`, `lib/cycle-run.js`):
//
//   CYCLE_ALERT=<file> ALERT_REASON=<why> ALERT_LOG=<log> node scripts/cycle/alert.js
//
// What the record holds is `lib/cycle-alert.js`.

import { readFileSync, writeFileSync } from 'node:fs'
import { alertLine, nextAlert } from '../lib/cycle-alert.js'
import { pathOf } from '../lib/datasets.js'

const path = process.env.CYCLE_ALERT || pathOf('cycleAlert')
let prev = {}
try {
  prev = JSON.parse(readFileSync(path, 'utf8'))
} catch {
  /* the first cycle to end this way */
}
const alert = nextAlert(prev, { reason: process.env.ALERT_REASON, log: process.env.ALERT_LOG, now: Date.now() })
writeFileSync(path, `${JSON.stringify(alert, null, 2)}\n`)
console.log(alertLine(alert))
