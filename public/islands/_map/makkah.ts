// What the Makkah card says: the next prayers there, and the days to the
// year's markers in its calendar. Both are computed here from what the map
// already keeps (Umm al-Qura prayer geometry and the Umm al-Qura calendar), so
// the card needs no feed and cannot go stale between cycles.

import { hijriDate, type HijriDate } from './hijri'
import { PRAYERS, prayerInstantAt, type PrayerId } from './prayer'

/** The Kaaba, which the map opens on. [lng, lat]. */
export const MAKKAH_AT: [number, number] = [39.826, 21.423]

const DAY_MS = 86_400_000
const MIN_MS = 60_000

export interface PrayerTime {
  id: PrayerId
  name: string
  at: number
}

/**
 * Each prayer's next entry at Makkah, in the order they come.
 *
 * `prayerInstantAt` answers the occurrence nearest the instant it is given, so
 * asking from twelve hours ahead returns the one in the coming day.
 */
export const nextPrayers = (now: number, at: [number, number] = MAKKAH_AT): PrayerTime[] => {
  const ahead = new Date(now + DAY_MS / 2)
  const out: PrayerTime[] = []
  for (const p of PRAYERS) {
    const t = prayerInstantAt(ahead, p.id, at[1], at[0])
    if (t !== null && t > now) out.push({ id: p.id, name: p.name, at: t })
  }
  return out.sort((a, b) => a.at - b.at)
}

/** `in 1 h 12 min`, `in 8 min`, `now`. */
export const untilLabel = (ms: number): string => {
  const min = Math.ceil(ms / MIN_MS)
  if (min <= 0) return 'now'
  if (min < 60) return `in ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `in ${h} h ${m} min` : `in ${h} h`
}

/** The year's markers, by their Umm al-Qura date. */
const MARKERS = [
  { name: 'Ramadan begins', month: 9, day: 1 },
  { name: 'Eid al-Fitr', month: 10, day: 1 },
  { name: 'Hajj begins', month: 12, day: 8 },
  { name: 'Day of Arafah', month: 12, day: 9 },
  { name: 'Eid al-Adha', month: 12, day: 10 },
] as const

export interface CalendarMark {
  name: string
  /** Whole days from today, Makkah's civil day: 0 is today. */
  days: number
}

/** A Hijri month is 29 or 30 days; this is the mean, for a first guess. */
const MONTH_DAYS = 29.53
const YEAR_DAYS = 354.37

/**
 * The days from today to each marker's next date, nearest first.
 *
 * A guess from the mean month, then a search a few days either side of it:
 * five lookups a marker instead of walking a whole year of dates.
 */
export const comingMarks = (now: number, timeZone: string): CalendarMark[] => {
  const today = hijriDate(now, timeZone)
  if (!today) return []
  const out: CalendarMark[] = []
  for (const m of MARKERS) {
    const guess =
      (((m.month - today.month) * MONTH_DAYS + (m.day - today.day)) % YEAR_DAYS + YEAR_DAYS) %
      YEAR_DAYS
    const days = findDay(now, timeZone, m, Math.round(guess))
    if (days !== null) out.push({ name: m.name, days })
  }
  return out.sort((a, b) => a.days - b.days)
}

const findDay = (
  now: number,
  timeZone: string,
  m: { month: number; day: number },
  guess: number,
): number | null => {
  for (const off of [0, -1, 1, -2, 2, -3, 3]) {
    const d = guess + off
    if (d < 0) continue
    const h: HijriDate | null = hijriDate(now + d * DAY_MS, timeZone)
    if (h && h.month === m.month && h.day === m.day) return d
  }
  return null
}

/** `today`, `tomorrow`, `in 12 days`. */
export const dayWord = (days: number): string =>
  days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`

/** During Ramadan, the day of the fast; null outside it. */
export const ramadanDay = (now: number, timeZone: string): number | null => {
  const h = hijriDate(now, timeZone)
  return h && h.month === 9 ? h.day : null
}
