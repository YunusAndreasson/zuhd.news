// GDACS parser + per-event detail fetcher. JS port of mobile/lib/gdacs.ts —
// the same shape contract, just running server-side now so every install
// reads from /api/gdacs.json instead of hammering gdacs.org N times/day.
//
// Public surface used by fetch-gdacs.js:
//   collectionToAlerts(collection, now?) → GdacsAlert[]
//   fetchGdacsDetail(alert, fetchImpl?, signal?) → GdacsDetail
//
// The output shape mirrors the GdacsAlert / GdacsDetail TS types declared in
// shared/types.ts so mobile can consume the snapshot with structural validation
// and zero parsing.

import { fetchOk } from './http.js'
import { isIsoDate } from './iso-date.js'

export const GDACS_GEOJSON_URL =
  'https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP'

export function gdacsEventDetailUrl(eventtype, eventid) {
  return `https://www.gdacs.org/gdacsapi/api/Events/geteventdata?eventtype=${eventtype}&eventid=${encodeURIComponent(eventid)}`
}

const EVENT_TYPES = new Set(['EQ', 'TC', 'FL', 'VO', 'DR', 'WF'])
const ALERT_LEVELS = new Set(['Green', 'Orange', 'Red'])

// Hard age cliff. Beyond this, drop entirely rather than fade — GDACS keeps
// long-running events on the feed indefinitely and a half-faded marker from
// 8 months ago is not "happening now."
const MAX_ALERT_AGE_DAYS = 30

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Count one drop under `reason`, where the caller is keeping count. */
const count = (tally, reason) => {
  if (tally) tally[reason] = (tally[reason] ?? 0) + 1
}
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)

const isGdacsFeature = (v) => {
  if (!isObject(v)) return false
  if (v.type !== 'Feature') return false
  if (!isObject(v.geometry)) return false
  if (!isObject(v.properties)) return false
  if (v.geometry.type !== 'Point') return false
  const coords = v.geometry.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return false
  if (!isFiniteNumber(coords[0]) || !isFiniteNumber(coords[1])) return false
  return true
}

export const isGdacsFeatureCollection = (v) => {
  if (!isObject(v)) return false
  if (v.type !== 'FeatureCollection') return false
  if (!Array.isArray(v.features)) return false
  return true
}

function htmlToPlain(html) {
  return html
    .replace(/<br\s*\/?>(?:\s*\n)?/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(s, max) {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastDot = cut.lastIndexOf('. ')
  if (lastDot > max * 0.6) return cut.slice(0, lastDot + 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`
}

function readAffectedCountryNames(raw) {
  if (Array.isArray(raw)) {
    const out = []
    for (const entry of raw) {
      if (isObject(entry) && typeof entry.countryname === 'string' && entry.countryname.length > 0) {
        out.push(entry.countryname)
      }
    }
    return out
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  }
  return []
}

function readSeverityText(props) {
  const sev = props.severitydata
  if (isObject(sev) && typeof sev.severitytext === 'string' && sev.severitytext.length > 0) {
    return sev.severitytext
  }
  return ''
}

function readSeverityValue(props) {
  const sev = props.severitydata
  if (isObject(sev) && isFiniteNumber(sev.severity)) return sev.severity
  return null
}

function readSeverityUnit(props) {
  const sev = props.severitydata
  if (isObject(sev) && typeof sev.severityunit === 'string') return sev.severityunit
  return ''
}

// GDACS auto-caption shape: "Green M 5 Earthquake in <region> at: <date>" —
// every component is already in name + severityText + fromDate. Anchored on
// both ends to avoid stripping real "Red Cross teams have deployed…" prose.
const AUTO_CAPTION = /^(Green|Orange|Red)\s.+\sat:\s\d/i
function dropAutoCaption(description) {
  return AUTO_CAPTION.test(description) ? '' : description
}

function readReportUrl(props) {
  const url = props.url
  if (isObject(url) && typeof url.report === 'string' && /^https?:\/\//.test(url.report)) {
    return url.report
  }
  return null
}

/**
 * A GDACS time with its zone said.
 *
 * GDACS keeps UTC and writes it bare: `2026-10-09T09:59:42`. A date-time with
 * no offset is local time to `Date.parse`, by the language's own rule, so each
 * reader of the snapshot placed an alert by its own clock: the app's "updated
 * 3h ago" and the map's scrubber were out by the viewer's offset from UTC,
 * three hours in Makkah. This box reads it right only because it runs on UTC.
 * A day with no time is UTC already and is left alone; so is a time that
 * states an offset.
 *
 * @param {string} iso one that `isIsoDate` has passed
 */
const inUtc = (iso) => (iso.includes('T') && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? `${iso}Z` : iso)

/**
 * One feature as an alert, or null when it is not one this layer draws.
 *
 * The three dates are held to the app's own test (`isIsoDate`), because the app
 * takes the list whole or not at all: `fromDate` and `modifiedDate` must be
 * dates in every alert, and `toDate` a date or null. An alert with no readable
 * start has nothing true to put there and is dropped (`tally.undated`). An end
 * that is not a date becomes null, which is what an event still running has;
 * an unreadable modification time falls back to the start, as a missing one
 * always did. Before, any string passed, an empty one included.
 *
 * @param {any} feature one that `isGdacsFeature` has passed
 * @param {Record<string, number>} [tally] counts what is dropped, by reason
 */
function featureToAlert(feature, tally) {
  const p = feature.properties
  const eventtype = p.eventtype
  const alertlevel = p.alertlevel
  const eventid = p.eventid
  const id =
    typeof eventid === 'number' ? String(eventid) : typeof eventid === 'string' ? eventid : null
  if (
    typeof eventtype !== 'string' || !EVENT_TYPES.has(eventtype) ||
    typeof alertlevel !== 'string' || !ALERT_LEVELS.has(alertlevel) ||
    !id
  ) {
    count(tally, 'unknownKind')
    return null
  }
  if (!isIsoDate(p.fromdate)) {
    count(tally, 'undated')
    return null
  }

  const [lng, lat] = feature.geometry.coordinates
  const name =
    typeof p.name === 'string' && p.name.length > 0
      ? p.name
      : typeof p.eventname === 'string'
        ? p.eventname
        : ''
  const country = typeof p.country === 'string' ? p.country : ''
  const iso3 = typeof p.iso3 === 'string' ? p.iso3 : ''
  const fromDate = inUtc(p.fromdate)
  const toDate = isIsoDate(p.todate) ? inUtc(p.todate) : null
  const modifiedDate = isIsoDate(p.datemodified) ? inUtc(p.datemodified) : fromDate
  const rawDescription =
    typeof p.htmldescription === 'string'
      ? truncate(htmlToPlain(p.htmldescription), 280)
      : typeof p.description === 'string'
        ? truncate(p.description, 280)
        : ''
  const description = dropAutoCaption(rawDescription)
  const source = typeof p.source === 'string' ? p.source : ''

  return {
    eventid: id,
    eventtype,
    alertlevel,
    name,
    country,
    iso3,
    affectedCountries: readAffectedCountryNames(p.affectedcountries),
    lat,
    lng,
    fromDate,
    toDate,
    modifiedDate,
    severityText: readSeverityText(p),
    severityValue: readSeverityValue(p),
    severityUnit: readSeverityUnit(p),
    description,
    source,
    reportUrl: readReportUrl(p),
  }
}

export function alertAgeDays(alert, now = Date.now()) {
  const t = Date.parse(alert.modifiedDate)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (now - t) / 86_400_000)
}

/**
 * The list's features as alerts, with what was dropped on the way counted in
 * `tally` by reason: `malformed` (not a point feature), `notCurrent`,
 * `unknownKind` (a type, level or id this layer does not know), `undated`, and
 * `tooOld`. Five filters with nothing counted is how eleven features went
 * missing from the list for five cycles on 2 and 3 October 2026, and the log
 * cannot say to which.
 *
 * @param {{ type?: string, features: any[] }} collection
 * @param {number} [now]
 * @param {Record<string, number>} [tally] counts what is dropped, by reason
 */
export function collectionToAlerts(collection, now = Date.now(), tally) {
  const out = []
  for (const feature of collection.features) {
    if (!isGdacsFeature(feature)) {
      count(tally, 'malformed')
      continue
    }
    if (feature.properties.iscurrent !== true && feature.properties.iscurrent !== 'true') {
      count(tally, 'notCurrent')
      continue
    }
    const alert = featureToAlert(feature, tally)
    if (!alert) continue
    if (alertAgeDays(alert, now) > MAX_ALERT_AGE_DAYS) {
      count(tally, 'tooOld')
      continue
    }
    out.push(alert)
  }
  return out
}

/** What each of `collectionToAlerts`' reasons is called in the log. */
const DROPPED_AS = {
  malformed: 'not a point feature',
  notCurrent: 'not current',
  unknownKind: 'of an unknown type, level or id',
  undated: 'with no readable start date',
  tooOld: `older than ${MAX_ALERT_AGE_DAYS} days`,
}

/**
 * A tally from `collectionToAlerts` as words: `11 not current, 2 older than 30
 * days`. Empty when nothing was dropped.
 *
 * @param {Record<string, number>} tally
 */
export const droppedAlertsReport = (tally) =>
  Object.entries(DROPPED_AS)
    .filter(([reason]) => tally[reason] > 0)
    .map(([reason, words]) => `${tally[reason]} ${words}`)
    .join(', ')

/** What `collectionToAlerts` reads of a feature before it keeps or drops it. */
const FILTERED_ON = ['iscurrent', 'eventtype', 'alertlevel', 'eventid', 'datemodified']

/**
 * What to say of a list that gave no alert, or null when it gave some.
 *
 * GDACS lists about a hundred events at any hour, so a list with none is not a
 * quiet world: it is a response that stopped meaning what it did. `iscurrent`
 * has already arrived as both `true` and `'true'`, and a third spelling drops
 * every feature at the first filter. Written to the snapshot, that would be an
 * empty disaster layer in the app and every narration pruned as stale. So the
 * fetcher keeps the last snapshot, and this is the line it leaves: what the
 * first feature held under the fields the filters read.
 *
 * @param {{ type?: string, features: any[] }} collection
 * @param {unknown[]} alerts what `collectionToAlerts` made of it
 * @returns {string | null}
 */
export function emptyListReport(collection, alerts) {
  if (alerts.length > 0) return null
  const { features } = collection
  if (features.length === 0) return 'the list held no features'
  const first = features[0]
  const saw = FILTERED_ON.map((key) => `${key}=${JSON.stringify(first?.properties?.[key])}`)
  saw.push(`geometry=${JSON.stringify(first?.geometry?.type)}`)
  return `${features.length} features and no usable alert; the first has ${saw.join(' ')}`
}

/**
 * Put the desk's narratives back on the alerts they were written for.
 *
 * The fetcher writes the alerts fresh every cycle, and a fresh alert has no
 * `narrative`: that is added by `narrate-gdacs.js`, four stages and one Opus
 * session later, from `content/.gdacs-narrations.json`. Between the two the
 * snapshot on disk is bare, and it stays bare if the narrator times out or
 * never starts, while the cache it would have read still holds every
 * paragraph. The build publishes what is on disk. So the fetcher carries them
 * itself, exactly as the narrator applies them: by event, whatever the
 * fingerprint, since an account of yesterday's severity is what the narrator
 * also leaves standing when a rewrite fails.
 *
 * `narrative` is set last, where the narrator sets it, so an alert it then
 * leaves alone serialises to the bytes it always did.
 *
 * @param {{ eventtype: string, eventid: string, narrative?: string }[]} alerts changed in place
 * @param {Record<string, { narrative?: unknown }> | null | undefined} narrations the cache, by `eventtype:eventid`
 * @returns {number} how many alerts carry one
 */
export function carryNarratives(alerts, narrations) {
  let carried = 0
  for (const alert of alerts) {
    const narrative = narrations?.[detailKey(alert)]?.narrative
    if (typeof narrative !== 'string' || narrative.length === 0) continue
    alert.narrative = narrative
    carried++
  }
  return carried
}

// ── Per-event detail (population estimates) ────────────────────────────────

/**
 * What an alert's detail and its narration are filed under. `shared/gdacs.ts`
 * has the same key for the readers and says what forgetting the prefix cost.
 *
 * @param {{ eventtype: string, eventid: string }} alert
 */
export const detailKey = (alert) => `${alert.eventtype}:${alert.eventid}`

/**
 * The snapshot's `details`: one entry for each alert whose detail arrived, in
 * the alerts' own order.
 *
 * The details are fetched six at a time, and they used to be filed as each
 * answer landed, so the object's keys came out in the order the network
 * answered: on 2026-10-09 the list began `EQ:1570274, TC:1001335, TC:1001334`
 * and the keys `EQ:1570261, EQ:1570260, EQ:1570274`, with not one of 23 in its
 * place. The build publishes this file under a stamp that holds only while the
 * bytes do (`stable-stamp.js`), and an order that follows the network is bytes
 * that move when nothing in the world has.
 *
 * @template D
 * @param {{ eventtype: string, eventid: string }[]} alerts
 * @param {(D | undefined)[]} fetched each alert's detail by position (`runSettled`), `undefined` where its fetch failed
 * @returns {Record<string, D>}
 */
export function detailsInAlertOrder(alerts, fetched) {
  /** @type {Record<string, D>} */
  const details = {}
  alerts.forEach((alert, i) => {
    const detail = fetched[i]
    if (detail !== undefined) details[detailKey(alert)] = detail
  })
  return details
}

const EMPTY_DETAIL = {
  criticalPopulation: null,
  criticalClause: '',
  widerPopulation: null,
  widerClause: '',
}

function readPopulationField(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v > 0 ? v : null
  if (typeof v !== 'string' || v.length === 0) return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

const isGdacsDetailFeature = (v) => {
  if (!isObject(v)) return false
  if (v.type !== 'Feature') return false
  if (!isObject(v.properties)) return false
  return true
}

export function featureToDetail(feature) {
  const eq = feature.properties.earthquakedetails
  if (!isObject(eq)) return EMPTY_DETAIL
  return {
    criticalPopulation: readPopulationField(eq.shakepop),
    criticalClause: 'felt strong shaking',
    widerPopulation: readPopulationField(eq.rapidpop),
    widerClause: 'in the wider affected area',
  }
}

export function readImpactScalar(impact, fieldName) {
  if (impact === null || typeof impact !== 'object') return null
  if (Array.isArray(impact)) {
    for (const item of impact) {
      const v = readImpactScalar(item, fieldName)
      if (v !== null) return v
    }
    return null
  }
  if (impact.name === fieldName) {
    if (typeof impact.value === 'number' && Number.isFinite(impact.value) && impact.value > 0) {
      return impact.value
    }
    if (typeof impact.value === 'string' && impact.value.length > 0) {
      const n = Number(impact.value)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  for (const k of Object.keys(impact)) {
    const v = readImpactScalar(impact[k], fieldName)
    if (v !== null) return v
  }
  return null
}

function findBufferImpactUrl(props, kind) {
  const impacts = props.impacts
  if (!Array.isArray(impacts)) return null
  for (const imp of impacts) {
    if (!isObject(imp)) continue
    const res = imp.resource
    if (!isObject(res)) continue
    const url = res[kind]
    if (typeof url === 'string' && /^https?:\/\//.test(url)) return url
  }
  return null
}

/**
 * @param {string} url
 * @param {(v: any) => boolean} validate
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [opts]
 *        Annotated because a destructured bag with an `= {}` default infers
 *        only the keys that carry their own default — `signal` was silently
 *        not part of this function's type.
 */
async function fetchJson(url, validate, { signal, timeoutMs = 8000 } = {}) {
  const json = await fetchOk(url, { signal, timeoutMs }).then((res) => res.json())
  if (!validate(json)) throw new Error('schema mismatch')
  return json
}

export async function fetchGdacsDetail(alert, signal) {
  if (alert.eventtype === 'EQ') {
    const feature = await fetchJson(
      gdacsEventDetailUrl(alert.eventtype, alert.eventid),
      isGdacsDetailFeature,
      { signal, timeoutMs: 8000 },
    )
    return featureToDetail(feature)
  }
  if (alert.eventtype === 'TC') {
    const feature = await fetchJson(
      gdacsEventDetailUrl(alert.eventtype, alert.eventid),
      isGdacsDetailFeature,
      { signal, timeoutMs: 8000 },
    )
    const props = feature.properties
    const hurricaneUrl = findBufferImpactUrl(props, 'buffer74')
    const tsUrl = findBufferImpactUrl(props, 'buffer39')
    const critical = hurricaneUrl
      ? await fetchImpactPopulation(hurricaneUrl, signal).catch(() => null)
      : null
    const wider = tsUrl
      ? await fetchImpactPopulation(tsUrl, signal).catch(() => null)
      : null
    return {
      criticalPopulation: critical,
      criticalClause: 'in the hurricane wind zone',
      widerPopulation: wider,
      widerClause: 'in the storm path',
    }
  }
  return EMPTY_DETAIL
}

async function fetchImpactPopulation(url, signal) {
  const res = await fetchJson(url, (v) => v !== null && typeof v === 'object', {
    signal,
    timeoutMs: 8000,
  })
  return readImpactScalar(res, 'POP_AFFECTED')
}
