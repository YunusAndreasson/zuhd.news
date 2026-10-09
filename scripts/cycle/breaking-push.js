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

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { choosePush, markPushSent, pushCandidates, pushFields, withPushDecision } from '../lib/breaking.js'
import { pathOf } from '../lib/datasets.js'

const LOG_PATH = pathOf('pushLog')
/** @param {string} path */
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
/** The log is written without a final newline, as it always has been: it is committed every cycle. @param {any[]} log */
const writeLog = (log) => writeFileSync(LOG_PATH, JSON.stringify(log, null, 2))

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

  let log = []
  try {
    log = json(LOG_PATH)
  } catch { /* the first decision ever logged */ }
  writeLog(withPushDecision(log, candidates, choice, Date.now()))

  if (choice.selected.length) console.log(JSON.stringify({ articles: choice.selected }))
}

function sent() {
  try {
    // Title and body come from the payload that was sent, not from the shell.
    const payload = JSON.parse(/** @type {string} */ (process.env.BJSON))
    const art = payload.articles?.[0] || {}
    writeLog(markPushSent(json(LOG_PATH), art, process.env.PRESP))
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
