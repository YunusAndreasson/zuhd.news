// Which cached narrative an alert may carry. The rule `narrate-gdacs.js`
// applies, here so a test can reach it: the script runs on import.

/**
 * The narrative a cache entry gives an alert, or `null`.
 *
 * **Only at the level it was written for.** An entry is keyed by the event,
 * the event's level changes under it, and only Orange and Red alerts are
 * narrated again. So a storm written up at Red ("The Red alert reflects…")
 * and then downgraded to Green would keep that paragraph for as long as it
 * stayed in the feed, and an alert whose rewrite failed after a change of
 * level would keep the one written for the level before. No Green alert
 * carried one on 2026-10-09; nothing stopped it.
 *
 * An entry from before entries recorded their level was written at Orange or
 * Red, the only two that are narrated: it is applied at either of those, and
 * never to a Green alert.
 *
 * @param {{ narrative?: string, alertlevel?: string } | undefined} entry
 * @param {{ alertlevel?: string }} alert
 * @returns {string | null}
 */
export function narrativeFor(entry, alert) {
  if (!entry?.narrative) return null
  if (entry.alertlevel) return entry.alertlevel === alert.alertlevel ? entry.narrative : null
  return alert.alertlevel === 'Orange' || alert.alertlevel === 'Red' ? entry.narrative : null
}
