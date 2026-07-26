// The Hijri calendar, and the exchange closures that follow it.
//
// No library and no table of dates: `Intl` has shipped the Islamic calendars
// since ES2015, in every browser this map runs in and in Node. So the whole
// conversion costs a `DateTimeFormat` and nothing in the bundle — which is the
// only reason this is worth doing at all, because a date the reader can get
// from their own phone does not justify a dependency.
//
// Which variant, and why it matters
// ---------------------------------
// The four Islamic calendars `Intl` exposes disagree by up to two days on the
// same instant:
//
//     islamic-umalqura   12 Safar 1448     ← this one
//     islamic-civil      10 Safar 1448
//     islamic-tbla       11 Safar 1448
//
// `islamic-umalqura` is the Umm al-Qura calendar — the civil calendar of Saudi
// Arabia, and the one the Gulf exchanges publish their trading calendars
// against. Both things this module is for are civil, administrative questions
// ("what is today's date", "is the exchange shut"), so the civil calendar is
// the correct instrument. It is *calculated*, not sighted, and that is the
// caveat carried everywhere its output is used.

const UMALQURA = 'en-u-ca-islamic-umalqura'

/**
 * Month names, because `Intl`'s own are inconsistent across engines — some
 * emit "Safar", others "Ṣafar", others the numeral. The map prints one string
 * on one line and it should not change shape by browser.
 */
const MONTHS = [
  'Muharram',
  'Safar',
  'Rabiʿ I',
  'Rabiʿ II',
  'Jumada I',
  'Jumada II',
  'Rajab',
  'Shaʿban',
  'Ramadan',
  'Shawwal',
  'Dhu al-Qaʿda',
  'Dhu al-Hijja',
]

export interface HijriDate {
  /** Day of the month, 1–30. */
  day: number
  /** Month, 1–12. `9` is Ramadan, `10` Shawwal, `12` Dhu al-Hijja. */
  month: number
  year: number
  monthName: string
}

/**
 * The civil Hijri date for an instant, in a given IANA zone.
 *
 * The zone is not optional in practice even though it looks it: a Hijri date
 * is a *local* fact, and reading one instant in UTC and in Asia/Jakarta can
 * legitimately give two different days. Callers state the frame they mean.
 *
 * Returns null rather than throwing if the engine has no Islamic calendar
 * data. That is not expected anywhere this ships, but the alternative is a
 * date helper that can take the map down, and no line of type is worth that.
 */
export const hijriDate = (at: Date | number, timeZone = 'UTC'): HijriDate | null => {
  try {
    const parts = new Intl.DateTimeFormat(UMALQURA, {
      timeZone,
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).formatToParts(new Date(at))
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    const day = get('day')
    const month = get('month')
    const year = get('year')
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null
    return { day, month, year, monthName: MONTHS[month - 1] ?? String(month) }
  } catch {
    return null
  }
}

/** `12 Safar 1448`. The form the readout prints. */
export const hijriLabel = (at: Date | number, timeZone = 'UTC'): string => {
  const h = hijriDate(at, timeZone)
  return h ? `${h.day} ${h.monthName} ${h.year}` : ''
}

/**
 * Why the readout does not claim more than it does.
 *
 * The Hijri day turns at maghrib, not at midnight — so at any moment there are
 * two Hijri dates in the world at once, and the boundary between them is the
 * sunset line this map already draws in `solar.ts`. `Intl` gives the civil
 * midnight-to-midnight mapping, which is what an exchange calendar uses and
 * what a printed date means, but it is an approximation of the thing itself.
 *
 * Stated rather than silently assumed, in the register the rest of this map
 * uses for its own gaps.
 */
export const HIJRI_NOTE =
  'Umm al-Qura, calculated rather than sighted. The Hijri day turns at maghrib, so it is not the same everywhere at once.'

// --- Eid ------------------------------------------------------------------

/**
 * The two Eids, as windows rather than days.
 *
 * An exchange does not shut for a date, it shuts for a holiday block, and the
 * block differs by country: Tadawul takes most of a week around Eid al-Fitr,
 * Borsa İstanbul takes three days and a half-day before. Modelling each
 * national schedule would mean maintaining twelve calendars that change by
 * royal decree, so this does not attempt it.
 *
 * What it models is the window inside which "this exchange is trading right
 * now" stops being a claim we can make. That is a deliberately weaker
 * statement, and it is the one that can be made honestly — see `eidClosure`.
 *
 * The bounds are widened by a day on each side of the canonical dates because
 * Umm al-Qura is calculated and the actual Eid is sighted; the two can differ
 * by a day in either direction, and countries within the same window do not
 * always agree with each other.
 */
const EID_WINDOWS = [
  // Eid al-Fitr — 1 Shawwal. The last day or two of Ramadan is already shut
  // at most of these exchanges, so the window opens in the preceding month.
  { name: 'Eid al-Fitr', from: { month: 9, day: 29 }, to: { month: 10, day: 4 } },
  // Eid al-Adha — 10 Dhu al-Hijja, with Yawm ʿArafa the day before.
  { name: 'Eid al-Adha', from: { month: 12, day: 8 }, to: { month: 12, day: 14 } },
] as const

/** Is `(month, day)` inside a window that may straddle a month boundary? */
const within = (
  h: HijriDate,
  w: { from: { month: number; day: number }; to: { month: number; day: number } },
): boolean => {
  if (w.from.month === w.to.month) {
    return h.month === w.from.month && h.day >= w.from.day && h.day <= w.to.day
  }
  if (h.month === w.from.month) return h.day >= w.from.day
  if (h.month === w.to.month) return h.day <= w.to.day
  return false
}

/**
 * The Eid this date falls in, or null.
 *
 * Named rather than boolean because the caller wants to say *which* — "closed
 * for Eid al-Adha" is information, "closed for a holiday" is a shrug.
 */
export const eidWindow = (at: Date | number, timeZone = 'UTC'): string | null => {
  const h = hijriDate(at, timeZone)
  if (!h) return null
  for (const w of EID_WINDOWS) if (within(h, w)) return w.name
  return null
}

/**
 * Does this exchange observe Eid, and is it inside the window right now?
 *
 * `holidays: 'islamic'` on the catalog entry is what opts an exchange in — the
 * flag is editorial, not derived from the country code, because an exchange in
 * a Muslim-majority country need not close for Eid and one elsewhere might.
 *
 * The exchange's own zone is used rather than UTC: an exchange is shut on its
 * own local calendar day, and for the Asian markets in this set the two are
 * a third of a day apart.
 */
export const eidClosure = (
  ex: { tz: string; holidays?: string },
  now: Date | number = Date.now(),
): string | null => (ex.holidays === 'islamic' ? eidWindow(now, ex.tz) : null)
