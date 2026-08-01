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
 * The frame the map tells the time in.
 *
 * It read UTC, which is nobody's day. A world map has to pick some frame — the
 * reader's own is wrong here, because two readers would then see the same rail
 * labelled differently and neither could quote a time to the other — and of the
 * frames that are the same for everyone, this is the one this site should keep.
 * It also makes the Hijri date beside it *more* correct rather than less: the
 * calendar shown is Umm al-Qura, Saudi Arabia's own civil calendar, so reading
 * it in Saudi Arabia's own zone is the frame it is actually defined in.
 *
 * `Asia/Riyadh` because there is no `Asia/Mecca` in the IANA database; it is
 * the canonical zone for the whole country. AST is UTC+3 and Saudi Arabia has
 * never observed daylight saving, so the offset is fixed in practice — but it
 * is resolved through `Intl` rather than hardcoded as `3 * HOUR_MS`, because a
 * hardcoded offset is a silent lie the day it stops being true.
 */
export const MAKKAH_TZ = 'Asia/Riyadh'

/** What the clock says, printed after the time. Not `AST` — that also means
 *  Atlantic Standard Time, and the place is the point of the change. */
export const MAKKAH_LABEL = 'Makkah'

/**
 * Local mean solar time at a longitude, as `HH:MM`.
 *
 * The one exception to the Makkah rule above, and it is not a competing clock:
 * every other time on this map is the map speaking, where one shared frame is
 * the whole point, and this one answers "what o'clock is it *there*" for a
 * place the pointer is on. Makkah would be useless for that and the reader's
 * own zone would be worse.
 *
 * Solar rather than civil because it is exact and needs nothing: a civil time
 * would want a lat/lng → IANA-zone dataset this site does not ship, and the
 * nautical approximation (round the longitude to the nearest hour) is a guess
 * dressed as a clock. It is the right frame here anyway — the thing being
 * timed is the sun's position, and solar noon is where the sun actually is.
 * Callers must say "solar", because up to about an hour and a half separates
 * this from what a phone in that place would show.
 */
export const solarClock = (t: number, lng: number): string =>
  new Date(t + (lng / 15) * 3_600_000).toISOString().slice(11, 16)

/**
 * How far ahead of UTC `tz` is at instant `t`, in milliseconds.
 *
 * Formats the instant in the zone, reads the fields back as though they were
 * UTC, and takes the difference — the standard way to get a zone offset out of
 * `Intl`, which exposes no direct accessor. Seconds are included because a few
 * historical zones are offset by a non-whole number of minutes.
 *
 * Callers in this file's consumers resolve it once per render rather than per
 * formatted value. That is safe for Makkah, which has no daylight saving, and
 * would need revisiting for a zone that does.
 */
export const zoneOffset = (t: number, tz: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(t)
  const f: Record<string, string> = {}
  for (const p of parts) f[p.type] = p.value
  // `hourCycle: h23` is what `hour12: false` asks for, but some ICU builds
  // still answer midnight with "24". Left unhandled it puts the offset a full
  // day out, once a day, in the one hour nobody tests.
  const hour = f.hour === '24' ? 0 : Number(f.hour)
  const asIfUtc = Date.UTC(
    Number(f.year),
    Number(f.month) - 1,
    Number(f.day),
    hour,
    Number(f.minute),
    Number(f.second),
  )
  // `t` may carry milliseconds the formatter dropped; floor both to the second.
  return asIfUtc - Math.floor(t / 1000) * 1000
}

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
 * A coordinate, as a place rather than as two numbers.
 *
 * `21.4°N 39.8°E`, not `21.423, 39.826`. One decimal is about 11 km, which is
 * the honest precision for a sub-point that moves 15° an hour and is stated on
 * a card a reader glances at — and a signed pair with no hemisphere letters is
 * the form that gets read backwards.
 */
export const coordinate = (lat: number, lng: number): string =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ` +
  `${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`

/**
 * A stellar magnitude. `−1.46`, `2.50`.
 *
 * Not `signed()`, which is the *other* thing a sign can mean on this map: there
 * it carries a direction and always prints one, so a magnitude would come out
 * `+2.50` and read as a rise. Here the minus is part of the value — Sirius is
 * brighter than zero, not "up 1.46" — so a positive magnitude takes no sign.
 * The glyph is still U+2212, for the reason `signed` states: `toFixed` emits an
 * ASCII hyphen, which is the wrong width beside the site's own minus.
 */
export const magnitude = (n: number): string =>
  `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`

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
