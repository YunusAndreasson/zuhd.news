// The label a point of a series carries: `Oct 9` for a day, `Oct 2026` for a
// month. Written here and read back here.
//
// Seven source modules each had a `formatPeriod` and an eighth a month table
// of its own. The copies agreed, so this is not a fix: it is the one place the
// format lives, because the format is a contract. The labels are published in
// `/api/trends.json`, `/api/markets.json`, `/api/companies.json` and
// `/api/chokepoints.json`, and they are parsed back for the day they stand
// for: by the writer's offer (`lib/indicator-offer.js`) and by the app
// (`DAY_LABEL`, mobile/lib/cards/week-move.ts), whose shipped versions cannot
// be changed. They are also hashed into the narration's fingerprints, through
// the dates of a series' extremes.
//
// A fixed table, and not `toLocaleDateString`. That asked the runtime's ICU
// for en-US's short month names, which is the same twelve strings until a
// release that spells one differently, and then every label on the wire
// changes and no parser of them matches. `period.test.js` holds the two equal
// over every day of a leap year, so the day they part is a red test here and
// not a blank column in the app.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** What both labels were for a time that is not one: the runtime's own words. */
const NOT_A_DATE = 'Invalid Date NaN'

/**
 * A day's label, `Oct 9`: the UTC day of `ms`, no year, no leading zero.
 *
 * @param {number} ms
 */
export function dayLabel(ms) {
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? NOT_A_DATE : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/**
 * A month's label, `Oct 2026`: the UTC month `ms` falls in.
 *
 * @param {number} ms
 */
export function monthLabel(ms) {
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? NOT_A_DATE : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/**
 * The UTC day a day's label names in `year`, as ms, or NaN for anything that
 * is not a day's label (a month's is not: a monthly series has no days).
 *
 * @param {string} label
 * @param {number} year
 */
export function labelDay(label, year) {
  const m = /^([A-Z][a-z]{2}) (\d{1,2})$/.exec(label)
  const month = m ? MONTHS.indexOf(m[1]) : -1
  return month < 0 ? Number.NaN : Date.UTC(year, month, Number(m?.[2]))
}

/**
 * A time's UTC day, `2026-10-09`.
 *
 * @param {number | Date} t
 */
export const isoDay = (t) => new Date(t).toISOString().slice(0, 10)
