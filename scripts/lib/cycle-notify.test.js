import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REMIND_EVERY, decide, loginWarningIn, tailOf } from './cycle-notify.js'
import { mailConfig } from './mail.js'

const NOW = Date.parse('2026-11-15T18:05:00Z')
const AUTH = "claude CLI authentication failed — re-run 'claude' interactively on the server to log in"
const alertOf = (consecutive, reason = AUTH) => ({ at: '2026-11-15T18:05:00.000Z', reason, log: '/logs/x.log', consecutive, since: '2026-11-14T05:01:45.578Z' })
const seen = (o) => ({ alert: null, state: {}, result: 'success', loginWarning: undefined, logTail: 'tail', log: '/logs/x.log', now: NOW, ...o })

test('the first failed cycle is mailed at once, with what to do about a login', () => {
  const { mails, state } = decide(seen({ alert: alertOf(1), result: 'exit-code' }))
  assert.equal(mails.length, 1)
  assert.match(mails[0].subject, /a cycle failed: claude CLI authentication failed/)
  assert.match(mails[0].text, /claude setup-token/)
  assert.match(mails[0].text, /--- end of the log ---\ntail/)
  assert.deepEqual(state, { since: '2026-11-14T05:01:45.578Z', count: 1, mailedAt: 1, reason: AUTH })
})

test('one quiet cycle is not mailed; a second in a row is', () => {
  const quiet = 'no articles published'
  const one = decide(seen({ alert: alertOf(1, quiet), result: 'success' }))
  assert.equal(one.mails.length, 0)
  assert.deepEqual(one.state, {})
  const two = decide(seen({ alert: alertOf(2, quiet), result: 'success', state: one.state }))
  assert.equal(two.mails.length, 1)
  assert.doesNotMatch(two.mails[0].text, /setup-token/, 'no login advice for a reason that is not the login')
})

test('a failure that lasts is mailed again about once a day, not every cycle', () => {
  let state = decide(seen({ alert: alertOf(1), result: 'exit-code' })).state
  const sent = []
  for (let n = 2; n <= 1 + 2 * REMIND_EVERY; n++) {
    const r = decide(seen({ alert: alertOf(n), result: 'exit-code', state }))
    state = r.state
    if (r.mails.length) sent.push(n)
  }
  assert.deepEqual(sent, [1 + REMIND_EVERY, 1 + 2 * REMIND_EVERY])
  assert.match(decide(seen({ alert: alertOf(1 + 3 * REMIND_EVERY), result: 'exit-code', state })).mails[0].subject, /still failing, 16 cycles/)
})

test('the first cycle that publishes after a mailed failure says so, once', () => {
  const failing = decide(seen({ alert: alertOf(8), result: 'exit-code' })).state
  const back = decide(seen({ alert: null, result: 'success', state: failing }))
  assert.equal(back.mails.length, 1)
  assert.match(back.mails[0].subject, /publishing again/)
  assert.match(back.mails[0].text, /after 8 cycles that did not \(since 2026-11-14T05:01:45.578Z\)/)
  assert.deepEqual(back.state, {})
  assert.equal(decide(seen({ alert: null, state: back.state })).mails.length, 0)
})

test('a cycle the unit stopped before it wrote a record is a failure too', () => {
  const first = decide(seen({ alert: null, result: 'timeout' }))
  assert.equal(first.mails.length, 1)
  assert.match(first.mails[0].text, /ended with "timeout"/)
  let state = first.state
  let mailed = 0
  for (let n = 2; n <= 1 + REMIND_EVERY; n++) {
    const r = decide(seen({ alert: null, result: 'timeout', state }))
    state = r.state
    mailed += r.mails.length
  }
  assert.equal(mailed, 1, 'the count it keeps itself reaches the reminder')
  assert.equal(state.count, 1 + REMIND_EVERY)
})

test('a quiet success with nothing open sends nothing; outside systemd a record still counts', () => {
  assert.deepEqual(decide(seen({})), { mails: [], state: {} })
  assert.equal(decide(seen({ alert: alertOf(1), result: undefined })).mails.length, 1)
})

test('the login warning is mailed once a day, beside whatever else is sent', () => {
  const warning = 'Warning: this sign-in ends between 2026-11-11 and 2026-11-14 (in 1 day at the earliest).'
  const first = decide(seen({ loginWarning: warning }))
  assert.equal(first.mails.length, 1)
  assert.match(first.mails[0].subject, /login on the server is ending/)
  assert.equal(first.state.loginWarnedOn, '2026-11-15')
  assert.equal(decide(seen({ loginWarning: warning, state: first.state })).mails.length, 0)
  assert.equal(decide(seen({ loginWarning: warning, state: first.state, now: NOW + 86_400_000 })).mails.length, 1)
  assert.equal(decide(seen({ loginWarning: warning, alert: alertOf(1), result: 'exit-code' })).mails.length, 2)
})

test('the log is read for the CLI warning and cut to a tail a mail can carry', () => {
  const log = `--- Stage 2: Writer ---\nWarning: this sign-in can end at any time from now until 2026-11-14. Renewing it does not move that date.\nWriter exit: 0\n`
  assert.equal(loginWarningIn(log), 'Warning: this sign-in can end at any time from now until 2026-11-14. Renewing it does not move that date.')
  assert.equal(loginWarningIn('Writer exit: 0\n'), undefined)
  const long = Array.from({ length: 50 }, (_, i) => `line ${i} ${'x'.repeat(i === 49 ? 400 : 1)}`).join('\n')
  const tail = tailOf(`${long}\n\n`).split('\n')
  assert.equal(tail.length, 30)
  assert.equal(tail[0], 'line 20 x')
  assert.ok(tail[29].endsWith('…') && tail[29].length === 241)
})

test('mail is off without an account, Gmail and the support address by default', () => {
  assert.equal(mailConfig({}), null)
  assert.equal(mailConfig({ SMTP_USER: 'a@example.com' }), null)
  assert.deepEqual(mailConfig({ SMTP_USER: ' a@example.com ', SMTP_PASS: 'abcd efgh ijkl mnop' }), {
    host: 'smtp.gmail.com',
    port: 465,
    user: 'a@example.com',
    pass: 'abcdefghijklmnop',
    to: 'support@zuhd.news',
    from: 'zuhd.news cycle <a@example.com>',
  })
  const other = mailConfig({ SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_HOST: 'mail.example.com', SMTP_PORT: '587', ALERT_EMAIL_TO: 'ops@example.com', ALERT_EMAIL_FROM: 'Ops <u@example.com>' })
  assert.deepEqual([other?.host, other?.port, other?.to, other?.from], ['mail.example.com', 587, 'ops@example.com', 'Ops <u@example.com>'])
})
