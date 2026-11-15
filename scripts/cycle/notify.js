#!/usr/bin/env node
// Mail what the last cycle left behind. systemd runs this after every cycle
// (`ExecStopPost=` in /etc/systemd/system/zuhd-news-cycle.service.d/notify.conf),
// whatever the cycle's outcome; the cycle itself never calls it.
//
//   node scripts/cycle/notify.js             mail if something changed
//   node scripts/cycle/notify.js --dry-run   print what would be mailed; send and write nothing
//   node scripts/cycle/notify.js --test      send one test mail now
//
// What to send is `lib/cycle-notify.js`, how is `lib/mail.js`. It never fails
// the unit: a mail that cannot go is a line in the journal, and is tried again
// after the next cycle.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { decide, loginWarningIn, tailOf } from '../lib/cycle-notify.js'
import { pathOf } from '../lib/datasets.js'
import { readJson, writeJson } from '../lib/json-file.js'
import { mailConfig, sendMail } from '../lib/mail.js'
import { ROOT } from '../lib/paths.js'

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')

// systemd starts this outside run-cycle.sh, which is what loads .env.
const envFile = join(ROOT, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
const config = mailConfig()

if (argv.includes('--test')) {
  if (!config) {
    console.error('notify: SMTP_USER and SMTP_PASS are not set (in .env) — nothing to send with')
    process.exit(1)
  }
  const text = `A test of the cycle's alert mail, sent by scripts/cycle/notify.js --test on ${hostname()} at ${new Date().toISOString()}.\n\nAlerts go to ${config.to}, from ${config.from}, through ${config.host}:${config.port}.`
  try {
    console.log(`notify: test mail sent to ${config.to} (${await sendMail(config, { subject: 'zuhd.news: alert mail test', text })})`)
  } catch (err) {
    console.error(`notify: the test mail did not go: ${/** @type {Error} */ (err).message}`)
    process.exit(1)
  }
  process.exit(0)
}

/** The newest cycle log: names are stamped, so the last in order is the latest. */
function newestLog() {
  const dir = pathOf('cycleLogs')
  try {
    const name = readdirSync(dir)
      .filter((n) => /^cycle-.*\.log$/.test(n))
      .sort()
      .at(-1)
    return name ? join(dir, name) : undefined
  } catch {
    return undefined
  }
}

const alert = readJson(pathOf('cycleAlert'), null)
const log = alert?.log || newestLog()
let logText = ''
try {
  if (log) logText = readFileSync(log, 'utf8')
} catch {
  /* no log: the mail says so */
}

const { mails, state } = decide({
  alert,
  state: readJson(pathOf('alertMail'), {}) ?? {},
  result: process.env.SERVICE_RESULT,
  loginWarning: loginWarningIn(logText),
  logTail: tailOf(logText),
  log,
  now: Date.now(),
})

if (dryRun) {
  if (mails.length === 0) console.log('notify (dry run): nothing to mail')
  for (const m of mails) console.log(`notify (dry run): to ${config?.to ?? '(no SMTP account set)'}\nSubject: ${m.subject}\n\n${m.text}\n`)
} else if (mails.length > 0 && !config) {
  // State is not written: once an account is set, the open failure is still news.
  for (const m of mails) console.log(`notify: SMTP_USER and SMTP_PASS are not set — not sent: ${m.subject}`)
} else {
  let sent = 0
  for (const m of mails) {
    try {
      console.log(`notify: mailed "${m.subject}" to ${config?.to} (${await sendMail(/** @type {import('../lib/mail.js').MailConfig} */ (config), m)})`)
      sent++
    } catch (err) {
      console.error(`notify: "${m.subject}" did not go: ${/** @type {Error} */ (err).message}`)
    }
  }
  if (mails.length === 0) console.log('notify: nothing to mail')
  // All or nothing: a mail that failed is decided again, and sent, after the
  // next cycle. With nothing to send, the count a stopped cycle adds is kept.
  if (sent === mails.length) writeJson(pathOf('alertMail'), state)
}
