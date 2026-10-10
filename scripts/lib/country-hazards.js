// What the hazard sources count inside each country, for its page.
//
// Three payloads the build already holds, joined to the country a page is
// about: the IPC's country totals, the week of conflict from UCDP, and the
// disaster alerts from GDACS. One pass, keyed by ISO2, so 172 pages do not each
// walk two hundred events.
//
// Joined on codes and on where a thing happened wherever the source gives
// either. The app joins on names and misses: GDACS says "United States" and
// "Russian Federation" where a profile is keyed "United States of America" and
// "Russia". And a conflict event counts where it took place, which for Gaza
// and the West Bank is not where UCDP files it.
//
// One field has only names: an alert's `affectedCountries`, the other
// countries it reaches. Those are read through `iso2OfCountryName` below, which
// knows more spellings than the profiles' own name table does.

import { ALPHA3_TO_ALPHA2 } from './country-codes.js'

/**
 * The standard English name of every region code, by name.
 *
 * The profiles are keyed on Natural Earth's spellings, which is one vocabulary
 * among several: measured on the snapshot of 2026-10-10, it resolved neither
 * "United States" nor "Tonga", both of which this does.
 */
const REGION_NAME_TO_ISO2 = (() => {
  const names = new Intl.DisplayNames(['en'], { type: 'region' })
  return new Map(Object.values(ALPHA3_TO_ALPHA2).map((iso2) => [names.of(iso2), iso2]))
})()

/**
 * The UN's formal names, which GDACS uses and neither table above spells.
 * "Russian Federation" and "Northern Mariana Is." are off the same snapshot;
 * the rest are the names the same convention gives the countries it renames.
 */
const FORMAL_NAME_TO_ISO2 = {
  'Russian Federation': 'RU',
  'Northern Mariana Is.': 'MP',
  'Syrian Arab Republic': 'SY',
  'Iran (Islamic Republic of)': 'IR',
  'Viet Nam': 'VN',
  'Republic of Korea': 'KR',
  "Democratic People's Republic of Korea": 'KP',
  "Lao People's Democratic Republic": 'LA',
  'United Republic of Tanzania': 'TZ',
  'Republic of Moldova': 'MD',
  'Venezuela (Bolivarian Republic of)': 'VE',
  'Bolivia (Plurinational State of)': 'BO',
  'Micronesia (Federated States of)': 'FM',
  'Brunei Darussalam': 'BN',
  'Türkiye': 'TR',
}

/**
 * The countries a name names, as ISO2 codes.
 *
 * `profileName` is the caller's own table, tried first. A name none of the
 * three knows may be two names in one string, which is how GDACS writes an
 * alert on a border ("Mongolia, China"): its parts are then tried on their
 * own. A stretch of sea ("Northern Molucca Sea") is no country, and is none.
 *
 * @param {string} name
 * @param {(name: string) => string | undefined} profileName
 * @returns {string[]}
 */
export function iso2OfCountryName(name, profileName) {
  const one = (n) => profileName(n) ?? REGION_NAME_TO_ISO2.get(n) ?? FORMAL_NAME_TO_ISO2[n]
  const whole = one(name.trim())
  if (whole) return [whole]
  if (!name.includes(',')) return []
  return name.split(',').map((part) => one(part.trim())).filter(Boolean)
}

/**
 * @typedef {{ analysed: number, p3plus: number, p5?: number, vintage: string }} Hunger
 * @typedef {{ events: number, killed: number, civilians: number, windowStart: string, windowEnd: string }} Conflict
 * @typedef {{ level: 'Red' | 'Orange', name: string }} Alert
 * @typedef {{ hunger?: Hunger, conflict?: Conflict, alerts: Alert[], lowerAlerts: number }} CountryHazards
 */

const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/**
 * @param {{ totals?: any[], conflict?: { windowStart?: string, windowEnd?: string, events?: any[] } | null, alerts?: any[] }} sources
 * @param {{ iso2At: (lat: number, lng: number) => string | null | undefined,
 *           iso2OfName: (name: string) => string | undefined }} resolve
 *        `iso2At` is where a coordinate falls; `iso2OfName` reads a country
 *        name the way a profile is keyed. Passed in because both need the
 *        shared country tables, which the caller has already loaded.
 * @returns {Map<string, CountryHazards>}
 */
export function countryHazards(sources, resolve) {
  /** @type {Map<string, CountryHazards>} */
  const byCountry = new Map()
  const of = (iso2) => {
    let row = byCountry.get(iso2)
    if (!row) {
      row = { alerts: [], lowerAlerts: 0 }
      byCountry.set(iso2, row)
    }
    return row
  }
  const fromIso3 = (iso3) => ALPHA3_TO_ALPHA2[String(iso3 ?? '').trim().toUpperCase()]

  // Hunger: the IPC's own country totals. A total with nobody in crisis, or
  // more in crisis than analysed, is a row the sentence cannot be written from.
  for (const t of sources.totals ?? []) {
    const iso2 = t?.iso2 || fromIso3(t?.iso3)
    if (!iso2 || !(count(t.p3plus) > 0) || !(count(t.analysed) >= t.p3plus) || !t.vintage) continue
    of(iso2).hunger = {
      analysed: t.analysed,
      p3plus: t.p3plus,
      ...(count(t.p5) > 0 ? { p5: t.p5 } : {}),
      vintage: String(t.vintage),
    }
  }

  // Conflict: counted where it happened. The source's own filing is the
  // fallback, for an event at sea or on a coast the polygons do not reach.
  const conflict = sources.conflict
  if (conflict?.windowStart && conflict?.windowEnd) {
    for (const e of conflict.events ?? []) {
      const at = Number.isFinite(e?.lat) && Number.isFinite(e?.lng) ? resolve.iso2At(e.lat, e.lng) : null
      const iso2 = at || fromIso3(e?.iso3)
      if (!iso2) continue
      const row = of(iso2)
      row.conflict ??= {
        events: 0,
        killed: 0,
        civilians: 0,
        windowStart: conflict.windowStart,
        windowEnd: conflict.windowEnd,
      }
      row.conflict.events += 1
      row.conflict.killed += count(e.fatalities)
      row.conflict.civilians += count(e.deathsCivilians)
    }
  }

  // Alerts: every country an alert names, by its own code and by the names
  // GDACS lists as affected, in whichever spelling it lists them. Orange and Red are rows; Green is the level of an
  // earthquake nobody felt, and Papua New Guinea holds twenty of those.
  for (const a of sources.alerts ?? []) {
    const touched = new Set()
    const home = fromIso3(a?.iso3)
    if (home) touched.add(home)
    for (const name of Array.isArray(a?.affectedCountries) ? a.affectedCountries : []) {
      for (const iso2 of iso2OfCountryName(String(name), resolve.iso2OfName)) touched.add(iso2)
    }
    for (const iso2 of touched) {
      const row = of(iso2)
      if (a.alertlevel === 'Red' || a.alertlevel === 'Orange') {
        row.alerts.push({ level: a.alertlevel, name: String(a.name || '') })
      } else {
        row.lowerAlerts += 1
      }
    }
  }
  for (const row of byCountry.values()) {
    row.alerts.sort((x, y) => (x.level === y.level ? 0 : x.level === 'Red' ? -1 : 1))
  }
  return byCountry
}
