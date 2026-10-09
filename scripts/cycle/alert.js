#!/usr/bin/env node
// Record that a cycle ended without publishing, and say so on stdout.
// Called on a cycle's way out (`Cycle.alert`, `lib/cycle-run.js`):
//
//   CYCLE_ALERT=<file> ALERT_REASON=<why> ALERT_LOG=<log> node scripts/cycle/alert.js
//
// What the record holds is `lib/cycle-alert.js`.

import { alertLine, nextAlert } from '../lib/cycle-alert.js'
import { pathOf } from '../lib/datasets.js'
import { readJson, writeJson } from '../lib/json-file.js'

const path = process.env.CYCLE_ALERT || pathOf('cycleAlert')
// No record: the first cycle to end this way. One that does not parse starts over too.
const alert = nextAlert(readJson(path, {}), { reason: process.env.ALERT_REASON, log: process.env.ALERT_LOG, now: Date.now() })
writeJson(path, alert)
console.log(alertLine(alert))
