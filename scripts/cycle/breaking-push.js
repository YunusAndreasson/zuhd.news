#!/usr/bin/env node
// The two things the cycle does to the push log around a breaking push.
//
//   node scripts/cycle/breaking-push.js pick
//       Choose the story to push from the cycle just deployed, add the
//       decision to the push log, and print `{"articles":[…]}` for the one
//       chosen; nothing when there is none.
//
//   BJSON=<payload> PRESP=<response> node scripts/cycle/breaking-push.js sent
//       Mark that decision as sent, with what went out and what came back.
//
// Who is chosen and what is logged is `lib/breaking.js`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { choosePush, markPushSent, pushCandidates, pushDecision, pushFields } from '../lib/breaking.js'
import { pathOf } from '../lib/datasets.js'
import { postLog } from '../lib/post-log.js'

/** @param {string} path */
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))

function pick() {
  const ledger = json(pathOf('storyLedger'))
  const cycle = json(pathOf('lastCycle'))
  const candidates = pushCandidates(ledger, cycle, (slug) => {
    try {
      return pushFields(readFileSync(join(pathOf('articles'), `${slug}.md`), 'utf8'))
    } catch {
      return {}
    }
  })
  let chosen = null
  try {
    chosen = json(pathOf('breakingPick'))
  } catch { /* no pick this cycle: coverage order stands */ }
  const choice = choosePush(candidates, chosen)

  // A log that cannot be read is left as it is and said so. It used to be
  // taken for "the first decision ever logged" and replaced by a log of one
  // entry. It does not stop the push: the endpoint keeps its own record of
  // what it has sent, and nothing here is decided from this log.
  try {
    postLog('pushLog').add(pushDecision(candidates, choice, Date.now()))
  } catch (e) {
    process.stderr.write(`push log not written: ${/** @type {Error} */ (e).message}\n`)
  }

  if (choice.selected.length) console.log(JSON.stringify({ articles: choice.selected }))
}

function sent() {
  try {
    // Title and body come from the payload that was sent, not from the shell.
    const payload = JSON.parse(/** @type {string} */ (process.env.BJSON))
    const art = payload.articles?.[0] || {}
    const log = postLog('pushLog')
    if (log.entries.length === 0) throw new Error('no decision in the log to mark')
    markPushSent(log.entries, art, process.env.PRESP)
    log.save()
  } catch (e) {
    process.stderr.write(`push-log update failed: ${/** @type {Error} */ (e).message}\n`)
  }
}

const command = { pick, sent }[process.argv[2] ?? '']
if (!command) {
  console.error('usage: breaking-push.js pick | sent')
  process.exit(2)
}
command()
