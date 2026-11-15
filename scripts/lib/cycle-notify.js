// What to mail after a cycle, from the alert record and what was mailed before.
//
// The alert record (`lib/cycle-alert.js`) said that cycles were failing, and
// only the dashboard read it: from 2026-11-14 05:00 eight cycles in a row died
// on an expired Claude login, and the next human look was a day and a half
// later. `scripts/cycle/notify.js` runs after every cycle and mails from this.

/** Cycles between two mails about the same failure: about a day, at five a day. */
export const REMIND_EVERY = 5

/** Lines of the cycle's log a mail carries, and the width each is cut to. */
const TAIL_LINES = 30
const TAIL_WIDTH = 240

/**
 * What was mailed, kept between cycles.
 *
 * @typedef {object} MailState
 * @property {string} [since] ISO, when the failure the mails are about began; absent when none is open
 * @property {number} [count] how many cycles that failure has lasted, as last seen
 * @property {number} [mailedAt] the count the last mail about it was sent at
 * @property {string} [reason] what the last mail said was wrong
 * @property {string} [loginWarnedOn] the UTC date the login warning was last mailed
 */

/** @typedef {{ subject: string, text: string }} Mail */

/**
 * The mails this cycle calls for, and the state to keep after they are sent.
 *
 * @param {object} seen
 * @param {import('./cycle-alert.js').CycleAlert | null} seen.alert the record on disk after this cycle
 * @param {MailState} seen.state
 * @param {string | undefined} seen.result systemd's `SERVICE_RESULT`; undefined outside systemd
 * @param {string | undefined} seen.loginWarning the CLI's warning that its login is ending, as the log printed it
 * @param {string} seen.logTail the end of the cycle's log
 * @param {string | undefined} seen.log the cycle's log file
 * @param {number} seen.now
 * @returns {{ mails: Mail[], state: MailState }}
 */
export function decide({ alert, state, result, loginWarning, logTail, log, now }) {
  const at = new Date(now).toISOString()
  /** @type {Mail[]} */
  const mails = []
  /** @type {MailState} */
  let next = { ...state }
  // A cycle the unit stopped before the cycle could write a record (a timeout,
  // a kill, a crash in the wrapper) failed all the same.
  const stopped = !alert && result !== undefined && result !== 'success'
  if (alert || stopped) {
    const count = alert ? alert.consecutive : (state.count ?? 0) + 1
    const reason = alert?.reason ?? `the cycle service ended with "${result}" before the cycle could say why`
    const failure = { reason, count, since: state.since ?? alert?.since ?? at, log: alert?.log || log, logTail }
    // A cycle that ran cleanly and found nothing new to publish is not a
    // failure on its own; two in a row are worth a look.
    const quiet = Boolean(alert) && result === 'success'
    if (!state.since) {
      if (count >= (quiet ? 2 : 1)) {
        mails.push(failingMail(failure))
        next = { ...next, since: failure.since, count, mailedAt: count, reason }
      }
    } else {
      next.count = count
      if (count >= (state.mailedAt ?? 0) + REMIND_EVERY) {
        mails.push(failingMail({ ...failure, still: true }))
        next.mailedAt = count
        next.reason = reason
      }
    }
  } else if (state.since) {
    mails.push(recoveredMail({ since: state.since, count: state.count ?? 1, reason: state.reason, at }))
    delete next.since
    delete next.count
    delete next.mailedAt
    delete next.reason
  }
  const today = at.slice(0, 10)
  if (loginWarning && state.loginWarnedOn !== today) {
    mails.push(loginMail(loginWarning))
    next.loginWarnedOn = today
  }
  return { mails, state: next }
}

/**
 * The end of a log, as a mail carries it.
 *
 * @param {string} text
 */
export function tailOf(text) {
  return text
    .trimEnd()
    .split('\n')
    .slice(-TAIL_LINES)
    .map((line) => (line.length > TAIL_WIDTH ? `${line.slice(0, TAIL_WIDTH)}…` : line))
    .join('\n')
}

/** The CLI's own line when its login is about to end, as the cycle's log printed it. */
export function loginWarningIn(text) {
  return /^Warning: this sign-in (?:ends|can end)[^\n]*/m.exec(text)?.[0]
}

const AUTH_HINT =
  'The Claude login on the server has ended. Run `claude setup-token` on the server and put the token in /root/zuhd.news/.env as CLAUDE_CODE_OAUTH_TOKEN (or run `claude auth login`).'

/**
 * @param {{ reason: string, count: number, since: string, log: string | undefined, logTail: string, still?: boolean }} f
 * @returns {Mail}
 */
function failingMail({ reason, count, since, log, logTail, still }) {
  const cycles = `${count} cycle${count === 1 ? '' : 's'}`
  const lines = [
    still ? `Cycles are still not publishing: ${cycles} in a row since ${since}.` : `A cycle ended without publishing (${cycles} in a row since ${since}).`,
    '',
    `Why: ${reason}`,
  ]
  if (/authentication failed/i.test(reason)) lines.push('', AUTH_HINT)
  lines.push('', `Log: ${log || 'none'}`, 'Status: systemctl status zuhd-news-cycle', '', '--- end of the log ---', logTail || '(empty)')
  return { subject: `zuhd.news: ${still ? `still failing, ${cycles}` : 'a cycle failed'}: ${reason}`, text: lines.join('\n') }
}

/**
 * @param {{ since: string, count: number, reason: string | undefined, at: string }} r
 * @returns {Mail}
 */
function recoveredMail({ since, count, reason, at }) {
  const cycles = `${count} cycle${count === 1 ? '' : 's'}`
  return {
    subject: 'zuhd.news: cycles are publishing again',
    text: [`A cycle published at ${at}, after ${cycles} that did not (since ${since}).`, reason ? `The last reason given: ${reason}` : ''].filter(Boolean).join('\n'),
  }
}

/**
 * @param {string} warning
 * @returns {Mail}
 */
function loginMail(warning) {
  return {
    subject: 'zuhd.news: the Claude login on the server is ending',
    text: [`The last cycle's log says:`, '', warning, '', AUTH_HINT.replace('has ended', 'is about to end')].join('\n'),
  }
}
