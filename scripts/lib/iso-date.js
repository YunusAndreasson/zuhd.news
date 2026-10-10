// The app's date test, on this side of the wire.
//
// The shipped app holds every date in a layer to `isIsoDate`
// (`mobile/lib/data-freshness.ts`), and its validators take a layer whole or
// not at all: `alerts.every(isGdacsAlert)`, `events.every(isConflictEvent)`,
// and inside an event `sources.every(...)`. One alert whose `fromDate` is an
// empty string, or one reported source whose date slot holds half an outlet's
// name, and every installed app refuses the whole layer until that row ages
// out of the feed — with nothing logged on this side, because the fetcher
// thought it had published a good snapshot.
//
// So whatever a fetcher publishes as a date passes this first. It is the app's
// test to the letter; change neither alone.

/**
 * A real calendar day (`2026-10-09`), or a timestamp that begins with one and
 * parses (`2026-10-09T09:29:18`, with or without an offset).
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return false
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return false
  // The pattern admits 30 February, and an engine may roll it into March
  // rather than fail to parse it, so a day is also read back.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(parsed).toISOString().slice(0, 10) === value
  return true
}
