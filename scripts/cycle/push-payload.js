#!/usr/bin/env node
// The steps `run-cycle.sh` takes to shape what it posts to the push endpoint.
//
//   … | node scripts/cycle/push-payload.js slug
//       The slug in a breaking payload on stdin.
//
//   NOTIF=<the model's answer> node scripts/cycle/push-payload.js inject < payload
//       The payload with the model's line as its body. Exits 2, saying so,
//       when the answer holds no line.
//
//   node scripts/cycle/push-payload.js briefing-top
//       The ledger's top stories, for the briefing's topic line.
//
//   BODY=<topic line> DATE=<YYYY-MM-DD> node scripts/cycle/push-payload.js briefing
//       The daily briefing's payload. Exits 2 when there is no line.
//
// Each is `lib/push-payload.js`. Nothing here ends its output with a newline
// except `slug`: bash compares two of these with the empty string.

import { readFileSync } from 'node:fs'
import { pathOf } from '../lib/datasets.js'
import { briefingPayload, briefingTop, firstLine, pushSlug, withPushBody } from '../lib/push-payload.js'

const stdinJson = () => JSON.parse(readFileSync(0, 'utf8'))

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
      process.stdout.write(JSON.stringify(briefingTop(JSON.parse(readFileSync(pathOf('storyLedger'), 'utf8')))))
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
