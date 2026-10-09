#!/usr/bin/env node
// Run a cycle: the stage list (`stages.js`), on the engine (`lib/cycle-run.js`).
//
//   node scripts/cycle/run.js                        a cycle; started by scripts/run-cycle.sh, which holds the lock
//   node scripts/cycle/run.js --plan [--at HH] [--dow N]   print what a cycle at that hour would run, and run nothing
//
// A cycle publishes, pushes and commits. It runs only under the lock the
// shell wrapper takes, so two never overlap; started by hand without it, this
// refuses.

import { spawnSync } from 'node:child_process'
import { fstatSync, statSync } from 'node:fs'
import { argAt, hasFlag } from '../lib/argv.js'
import { plan, runCycle, when } from '../lib/cycle-run.js'
import { pathOf } from '../lib/datasets.js'
import { STAGES } from './stages.js'

if (hasFlag('plan')) {
  const now = new Date()
  console.log(plan(STAGES, String(argAt('at', when.hour(now))).padStart(2, '0'), String(argAt('dow', when.weekday(now)))))
  process.exit(0)
}

// The wrapper opens the lock file on descriptor 200, locks it, and hands this
// process the descriptor. Both are checked: that 200 is the lock file, which
// only a process started by the wrapper has, and that the lock is taken. That
// the lock is held by someone is not enough: started by hand during a cycle,
// this would then be a second one.
const LOCK_FD = 200
function startedUnderTheLock() {
  try {
    const mine = fstatSync(LOCK_FD)
    const lock = statSync(pathOf('cycleLock'))
    return mine.dev === lock.dev && mine.ino === lock.ino && spawnSync('flock', ['-n', pathOf('cycleLock'), 'true'], { stdio: 'ignore' }).status !== 0
  } catch {
    return false
  }
}
if (!startedUnderTheLock()) {
  console.error('run.js: not started under the cycle lock. Start a cycle with scripts/run-cycle.sh, or see what one would do with --plan.')
  process.exit(2)
}

process.exitCode = await runCycle(STAGES)
