// The record a cycle leaves when it ends without publishing.
//
// On 2026-09-19 four cycles in a row died on an expired Claude OAuth token —
// "Failed to authenticate", 0 articles, exit 1 — and nothing anywhere said so;
// the next human look was the next day. The record carries the consecutive
// count so a single quiet cycle (everything already covered) reads differently
// from a dead pipeline. `run-cycle.sh` clears it on the first cycle that
// publishes, and carried this arithmetic inline until it moved here.

/**
 * @typedef {object} CycleAlert
 * @property {string} at ISO, when this cycle ended
 * @property {string | undefined} reason
 * @property {string | undefined} log the cycle's log file
 * @property {number} consecutive how many cycles in a row have ended this way
 * @property {string} since ISO, when the first of them ended
 */

/**
 * The alert after one more cycle without a publish.
 *
 * @param {Partial<CycleAlert>} prev the alert on disk; empty when there is none
 * @param {{ reason: string | undefined, log: string | undefined, now: number }} ended
 * @returns {CycleAlert}
 */
export function nextAlert(prev, { reason, log, now }) {
  const at = new Date(now).toISOString()
  return { at, reason, log, consecutive: (prev.consecutive || 0) + 1, since: prev.since || at }
}

/**
 * The line that goes into the cycle log.
 *
 * @param {CycleAlert} alert
 */
export const alertLine = (alert) => `ALERT: ${alert.reason} (${alert.consecutive} cycle(s) in a row since ${alert.since})`
