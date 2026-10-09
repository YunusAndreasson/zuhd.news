#!/usr/bin/env node
// Print one of the counts `run-cycle.sh` takes between stages.
//
//   node scripts/cycle/tally.js feed-api | feed-rss | feed | selection
//
// What each prints, and what it prints when its file is not there, is
// `lib/cycle-tally.js`.

import { readFileSync } from 'node:fs'
import { tally } from '../lib/cycle-tally.js'
import { pathOf } from '../lib/datasets.js'

console.log(tally(process.argv[2], (name) => readFileSync(pathOf(name), 'utf8')))
