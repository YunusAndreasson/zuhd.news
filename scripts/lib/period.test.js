// Run: node --test scripts/lib/period.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dayLabel, isoDay, labelDay, monthLabel } from './period.js'

// The labels are a published format: the app parses them and the narration's
// fingerprints hash them. These hold the one module to what each of the source
// modules wrote before it, for every day of two years, one of them a leap year.

const DAY = 86400_000
const days = []
for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2025, 0, 1); t += DAY) days.push(t)
for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += DAY) days.push(t)

// ── What each module had, word for word ─────────────────────────────────────

/** crypto.js and stocks.js, and portwatch.js under another parameter name. */
const wasFromMs = (ms) => {
  const d = new Date(ms)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${d.getUTCDate()}`
}
/** polymarket.js: seconds. */
const wasFromSeconds = (tsSeconds) => {
  const d = new Date(tsSeconds * 1000)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${d.getUTCDate()}`
}
/** oer.js, and fred.js with its second form for a monthly series. */
const wasFromIso = (dateStr, cadence) => {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  if (cadence === 'monthly') return `${month} ${d.getUTCFullYear()}`
  return `${month} ${d.getUTCDate()}`
}
/** wikipedia.js: the pageviews API's `YYYYMMDDHH`. */
const wasFromStamp = (stamp) => {
  const y = stamp.slice(0, 4)
  const m = stamp.slice(4, 6)
  const d = stamp.slice(6, 8)
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`)
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${date.getUTCDate()}`
}
/** bis.js: its own table, read off the date's digits. */
const BIS_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const wasBis = (date) => `${BIS_MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`
/** The four `ymd`s. */
const wasYmd = (d) => d.toISOString().slice(0, 10)

test('a day’s label is what every source wrote, for every day of 2024 and 2026', () => {
  assert.equal(days.length, 366 + 365)
  for (const t of days) {
    const iso = wasYmd(new Date(t))
    const label = dayLabel(t)
    assert.equal(label, wasFromMs(t), iso)
    // Any time of the day is that UTC day's label.
    assert.equal(dayLabel(t + 23 * 3600_000 + 59 * 60_000), label, iso)
    // As each module now calls it.
    assert.equal(dayLabel((t / 1000) * 1000), wasFromSeconds(t / 1000), iso)
    assert.equal(dayLabel(Date.parse(`${iso}T00:00:00Z`)), wasFromIso(iso), iso)
    assert.equal(dayLabel(Date.parse(new Date(t).toISOString())), wasFromMs(new Date(t).toISOString()), iso)
    const stamp = `${iso.replace(/-/g, '')}00`
    assert.equal(dayLabel(Date.parse(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T00:00:00Z`)), wasFromStamp(stamp), iso)
  }
  assert.deepEqual([dayLabel(Date.UTC(2026, 9, 9)), dayLabel(Date.UTC(2024, 1, 29)), dayLabel(Date.UTC(2026, 0, 1))], ['Oct 9', 'Feb 29', 'Jan 1'])
})

test('a month’s label is what FRED’s and the BIS’s rows carried', () => {
  for (const t of days) {
    const iso = wasYmd(new Date(t))
    assert.equal(monthLabel(t), wasFromIso(iso, 'monthly'), iso)
    assert.equal(monthLabel(Date.parse(`${iso}T00:00:00Z`)), wasBis(iso), iso)
  }
  assert.deepEqual([monthLabel(Date.UTC(2026, 9, 9)), monthLabel(Date.UTC(2025, 11, 31, 23, 59))], ['Oct 2026', 'Dec 2025'])
})

test('a day’s label reads back as the day it was written for', () => {
  for (const t of days) {
    const year = new Date(t).getUTCFullYear()
    assert.equal(labelDay(dayLabel(t), year), t, wasYmd(new Date(t)))
    // And as the offer read it before, through the runtime's own date parser.
    assert.equal(labelDay(dayLabel(t), year), Date.parse(`${dayLabel(t)} ${year} 00:00:00 UTC`))
  }
  // A month's label is not a day, and neither is anything else.
  for (const not of ['Oct 2026', 'October 9', 'Oct 9 2026', '2026-10-09', 'Okt 9', '', 'Oct']) {
    assert.ok(Number.isNaN(labelDay(not, 2026)), JSON.stringify(not))
  }
})

test('a time’s UTC day is the ten characters it always was', () => {
  for (const t of days) {
    assert.equal(isoDay(t), wasYmd(new Date(t)))
    assert.equal(isoDay(new Date(t + 86399_999)), wasYmd(new Date(t)))
  }
  assert.equal(isoDay(Date.UTC(2026, 9, 9, 23, 59, 59)), '2026-10-09')
})

test('a time that is not one is labelled as the runtime labelled it', () => {
  // What `toLocaleDateString` and `getUTCDate` made of an invalid date. Kept
  // to the letter: a refactor is not where a label changes.
  assert.equal(wasFromMs(Number.NaN), 'Invalid Date NaN')
  assert.equal(dayLabel(Number.NaN), 'Invalid Date NaN')
  assert.equal(wasFromIso('not a date', 'monthly'), 'Invalid Date NaN')
  assert.equal(monthLabel(Date.parse('not a dateT00:00:00Z')), 'Invalid Date NaN')
})
