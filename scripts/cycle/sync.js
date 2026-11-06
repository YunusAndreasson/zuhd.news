#!/usr/bin/env node
// Pull, install, push: what follows each commit of the cycle's that has to
// reach GitHub. Started by name by both orchestrators (`run-cycle.legacy.sh`'s
// `sync_remote`, `Cycle.sync` in `lib/cycle-run.js`), so what runs is this
// file as the last pull left it.
//
// What it settles of a remote that moved, and how it says what it cannot, is
// `lib/git-sync.js`. It reports and never fails the cycle: it exits 0 unless
// it crashed, and the caller says so if it did.

import { syncRemote } from '../lib/git-sync.js'
import { ROOT } from '../lib/paths.js'

syncRemote({ root: ROOT })
