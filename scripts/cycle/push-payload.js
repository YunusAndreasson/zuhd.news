#!/usr/bin/env node
// The steps the cycle takes to shape what it posts to the push endpoint.
//
//   … | node scripts/cycle/push-payload.js slug
//       The slug in a breaking payload on stdin.
//
//   NOTIF=<the model's answer> node scripts/cycle/push-payload.js inject < payload
//       The payload with the model's line as its body. Exits 2, saying so,
//       when the answer holds no line.
//
//   node scripts/cycle/push-payload.js briefing-top
//       The briefing's lead and the first story of each of its sections, for
//       the topic line: read out of the script that was recorded. The
//       ledger's newest rows when there is no script to read.
//
//   BODY=<topic line> DATE=<YYYY-MM-DD> node scripts/cycle/push-payload.js briefing
//       The daily briefing's payload. Exits 2 when there is no line.
//
// Each is `lib/push-payload.js`. Nothing here ends its output with a newline
// except `slug`: bash compares two of these with the empty string.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseBriefingScript } from '../lib/briefing-script.js'
import { pathOf } from '../lib/datasets.js'
import { briefingPayload, briefingTop, briefingTopFromScript, firstLine, pushSlug, withPushBody } from '../lib/push-payload.js'

const stdinJson = () => JSON.parse(readFileSync(0, 'utf8'))

/**
 * The stories the topic line is written from. The briefing's own: the script
 * `generate-briefing.js` saved beside the recording the metadata names. A push
 * that says what is in the briefing has to be written from the briefing.
 *
 * With no script to read the ledger's rows stand in, as they always did, and
 * the log says so: the push still goes out.
 */
function briefingStories() {
  try {
    const { date } = JSON.parse(readFileSync(pathOf('briefingMeta'), 'utf8'))
    const script = readFileSync(join(pathOf('audio'), `briefing-${date}.txt`), 'utf8')
    const top = briefingTopFromScript(parseBriefingScript(script).sections)
    if (top.length) return top
    process.stderr.write(`briefing-top: no story found in the script for ${date}, using the ledger\n`)
  } catch (e) {
    process.stderr.write(`briefing-top: no script to read (${/** @type {Error} */ (e).message}), using the ledger\n`)
  }
  return briefingTop(JSON.parse(readFileSync(pathOf('storyLedger'), 'utf8')))
}

const commands = {
  slug() {
    console.log(pushSlug(stdinJson()))
  },
  inject() {
    const payload = stdinJson()
    const body = firstLine(process.env.NOTIF)
    if (!body) {
      process.stderr.write('empty push body from claude\n')
      process.exit(2)
    }
    process.stdout.write(JSON.stringify(withPushBody(payload, body)))
  },
  'briefing-top'() {
    try {
      process.stdout.write(JSON.stringify(briefingStories()))
    } catch (e) {
      process.stderr.write(`briefing-top failed: ${/** @type {Error} */ (e).message}\n`)
    }
  },
  briefing() {
    const body = (process.env.BODY || '').trim()
    if (!body) process.exit(2)
    process.stdout.write(JSON.stringify(briefingPayload(body, process.env.DATE)))
  },
}

const command = commands[/** @type {keyof typeof commands} */ (process.argv[2] ?? '')]
if (!command) {
  console.error('usage: push-payload.js slug | inject | briefing-top | briefing')
  process.exit(2)
}
command()
