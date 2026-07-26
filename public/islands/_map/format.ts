// Number and date formatting for the map's cards.
//
// The map island ships no framework, so it can reach none of the repo's
// existing formatters: `formatValue` lives in a Node build script
// (`scripts/build/entity-pages.js`), and `country-preview.ts`'s `formatRank`
// is inside a Preact module whose import would pull preact + hooks + htm into
// `situation-map.js`. Before this file the island's whole numeric vocabulary
// was `relativeTime` plus two expressions inlined at their call sites — the
// delta string in `showChokepoint` and the rank in the country card, which had
// silently drifted apart (`6/145` here, `6 / 145` there).
//
// Everything here is pure and DOM-free.

import { eidClosure } from './hijri'

/**
 * How long ago, in the shortest form that still says it.
 *
 * This lived in `sheet.ts` — a 450-line DOM module that builds dialogs — so the
 * rail and the story popup, neither of which opens a sheet, each imported the
 * whole card renderer to format a timestamp. It is the same kind of pure
 * function as everything else in this file and belongs beside them.
 */
export const relativeTime = (ts: number, now = Date.now()): string => {
  const mins = Math.round((now - ts) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** Thousands separators. `25712` → `25,712`. */
export const grouped = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : ''

/**
 * Population, abbreviated.
 *
 * GDACS exposure figures span four orders of magnitude in a single feed — 124
 * people through 9.3 million — and the card has one line for them. Spelling
 * out the large ones costs more width than the extra digits are worth, and at
 * that scale the precision is false anyway: an exposure model is not counting
 * individuals. Below 10,000 the exact figure is both narrow enough to print
 * and plausibly meaningful, so it stays.
 */
export const population = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 10_000) return grouped(n)
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`
  const m = n / 1_000_000
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`
}

/**
 * A readable label for a chokepoint's change against its 90-day baseline.
 *
 * `delta7vs90` is a *signed fractional change*, not a ratio: PortWatch's
 * `0.141` means last week ran 14% above the baseline, and `-0.174` means 17%
 * below. Reading it as a ratio inverts the story — it put "86% below baseline"
 * on a Panama Canal that was running 9.1 container ships/day against a
 * baseline of 8, and printed impossible figures like "-117%" for a strait that
 * was down 17%. Every one of the eleven chokepoints was mislabelled.
 *
 * Large changes are stated as multiples rather than percentages, which is how
 * shipping traffic is actually discussed: +428% is `5.3× the 90-day baseline`.
 */
export const deltaLabel = (change: number): string | null => {
  if (!Number.isFinite(change)) return null
  const ratio = 1 + change
  if (ratio >= 2) return `${ratio.toFixed(1).replace(/\.0$/, '')}× the 90-day baseline`
  if (ratio <= 0.5 && ratio > 0) return `${Math.round((1 - ratio) * 100)}% below baseline`
  const pct = Math.round(change * 100)
  if (pct === 0) return 'level with the 90-day baseline'
  return `${pct > 0 ? '+' : ''}${pct}% vs 90-day baseline`
}

/** A vessel-count average. One decimal, because these are daily means. */
export const vessels = (n: number | undefined): string =>
  typeof n === 'number' && Number.isFinite(n) ? n.toFixed(1).replace(/\.0$/, '') : ''

/** `12 / 145`. The country card's ranking, spaced. */
export const rank = (r: number, total: number): string => `${r} / ${total}`

/**
 * A source's sentiment, as a signed two-decimal number.
 *
 * Only ever shown on stories the map has already marked contested, where the
 * spread between outlets is the point. Printing it on every card would be
 * editorialising — the figure is a machine estimate of tone, not a judgement
 * we stand behind story by story.
 */
export const sentiment = (v: number): string => signed(v, 2)

/**
 * The one place the sign glyph is chosen.
 *
 * `toFixed` emits an ASCII hyphen, so a falling market printed U+002D while
 * `sentiment` just above hand-wrote U+2212 — two different minus signs in the
 * same card, one of them the wrong width in a tabular column.
 */
function signed(n: number, digits: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`
}

/**
 * An ISO date as a plain UTC day. `2026-06-28` → `28 Jun`.
 *
 * Chokepoint and conflict payloads both date themselves in ISO; the cards want
 * the shortest form that still says which day.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const shortDate = (iso: string): string => {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * A date that carries its year.
 *
 * `shortDate` deliberately drops the year, because everything it dates happened
 * inside the map's own fortnight and "16 Sep 2025" on a card about this week is
 * noise. Findings are the opposite case — one of them is from 2018 — and a
 * citation without a year is not a citation.
 */
export const fullDate = (iso: string): string => {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** `YYYY-MM` → "October 2023", for a start date nobody can put a day on. */
export const monthLabel = (iso: string): string => {
  const [y, m] = iso.split('-')
  const i = Number(m) - 1
  return MONTHS_FULL[i] ? `${MONTHS_FULL[i]} ${y}` : y
}

/**
 * How far behind the present a dated snapshot runs, in plain words.
 *
 * Shared by the chokepoint sheet (PortWatch publishes weekly, and the snapshot
 * can sit a month back) and available to anything else with an `asOf`. Returns
 * null inside a fortnight, where "when" is not yet a caveat worth the line.
 */
export const lagLabel = (iso: string, now = Date.now()): string | null => {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const days = Math.round((now - t) / 86_400_000)
  if (days < 14) return null
  const months = Math.round(days / 30)
  return months >= 2 ? `~${months} months old` : `~${days} days old`
}

/**
 * An index level, in the units the exchange quotes it in.
 *
 * Two decimals is the convention for an index, but the MERVAL trades above
 * three million — a currency that has been devalued repeatedly carries the
 * digits — and `3,319,522.41` spends eleven characters saying nothing after
 * the comma. Above six figures the decimals are dropped.
 */
export const indexLevel = (n: number, currency?: string): string => {
  if (!Number.isFinite(n)) return ''
  const body =
    Math.abs(n) >= 100_000
      ? grouped(n)
      : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency ? `${body} ${currency}` : body
}

/** A signed percent move, always carrying its sign. `0.82` → `+0.82%`. */
export const pctChange = (n: number): string => (Number.isFinite(n) ? `${signed(n, 2)}%` : '')

/** The same, at the precision a glance can use. For the markets strip. */
export const pctChangeShort = (n: number): string => (Number.isFinite(n) ? `${signed(n, 1)}%` : '')

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/** Minutes since local midnight, and the local weekday, in an IANA zone. */
const zonedNow = (tz: string, at: number): { day: number; minutes: number } | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(at))
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    const day = WEEKDAY_INDEX[get('weekday')]
    const minutes = Number(get('hour')) * 60 + Number(get('minute'))
    if (day === undefined || !Number.isFinite(minutes)) return null
    return { day, minutes }
  } catch {
    // An unparseable zone is a data problem, not a reason to take the map down.
    return null
  }
}

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '')
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Is this exchange inside its regular session right now?
 *
 * Weekday matters as much as the clock here: Riyadh and Yafa trade Sunday to
 * Thursday while Dubai moved to Monday–Friday in 2022, so a Gulf-wide rule
 * would be wrong about half the Gulf. Lunch breaks are still not modelled —
 * Tokyo and Kuala Lumpur read as open through theirs.
 *
 * Eid is modelled, and it is the only holiday that is. The reasoning is not
 * that Eid matters more than Christmas but that it is the one this map was
 * getting wrong in the layer built specifically to carry the Gulf: five of
 * these exchanges shut for the better part of a week twice a year, and the map
 * drew every one of them as a live disc with last week's number inside it.
 * `eidClosure` reads the exchange's own Hijri calendar day — see `hijri.ts`
 * for why the window is wider than the two feast days themselves.
 *
 * Everything else — Christmas, national days, an unscheduled halt — still
 * reads as trading. That mis-states the *state* only, never the number,
 * because the card prints the actual date of the close beside it.
 */
export const isTrading = (
  ex: {
    tz: string
    sessionStart: string
    sessionEnd: string
    days: number[]
    holidays?: string
  },
  now = Date.now(),
): boolean => {
  const start = toMinutes(ex.sessionStart)
  const end = toMinutes(ex.sessionEnd)
  if (start === null || end === null || !Array.isArray(ex.days) || !ex.days.length) return false
  if (eidClosure(ex, now)) return false
  const local = zonedNow(ex.tz, now)
  if (!local) return false
  if (!ex.days.includes(local.day)) return false
  return local.minutes >= start && local.minutes < end
}

/**
 * What the card says about how fresh the figure is: `trading now`, the Eid the
 * exchange is shut for, or the weekday of the close it is showing.
 *
 * Naming the Eid rather than falling back to `last close · Thu` is the whole
 * point of modelling it. "Last close · Thursday" on a Tadawul that has been
 * shut since Tuesday is *true* and tells the reader nothing about why the
 * number stopped moving; "closed · Eid al-Fitr" answers it.
 */
export const sessionLabel = (
  ex: {
    tz: string
    sessionStart: string
    sessionEnd: string
    days: number[]
    asOf: string
    holidays?: string
  },
  now = Date.now(),
): string => {
  const eid = eidClosure(ex, now)
  if (eid) return `closed · ${eid}`
  if (isTrading(ex, now)) return 'trading now'
  const t = Date.parse(`${ex.asOf}T12:00:00Z`)
  if (!Number.isFinite(t)) return 'last close'
  const weekday = new Date(t).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  return `last close · ${weekday}`
}
