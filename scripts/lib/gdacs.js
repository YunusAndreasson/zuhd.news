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

function featureToAlert(feature) {
  const p = feature.properties
  const eventtype = p.eventtype
  const alertlevel = p.alertlevel
  const eventid = p.eventid
  if (typeof eventtype !== 'string' || !EVENT_TYPES.has(eventtype)) return null
  if (typeof alertlevel !== 'string' || !ALERT_LEVELS.has(alertlevel)) return null
  const id =
    typeof eventid === 'number' ? String(eventid) : typeof eventid === 'string' ? eventid : null
  if (!id) return null

  const [lng, lat] = feature.geometry.coordinates
  const name =
    typeof p.name === 'string' && p.name.length > 0
      ? p.name
      : typeof p.eventname === 'string'
        ? p.eventname
        : ''
  const country = typeof p.country === 'string' ? p.country : ''
  const iso3 = typeof p.iso3 === 'string' ? p.iso3 : ''
  const fromDate = typeof p.fromdate === 'string' ? p.fromdate : ''
  const toDate = typeof p.todate === 'string' && p.todate.length > 0 ? p.todate : null
  const modifiedDate = typeof p.datemodified === 'string' ? p.datemodified : fromDate
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

export function collectionToAlerts(collection, now = Date.now()) {
  const out = []
  for (const feature of collection.features) {
    if (!isGdacsFeature(feature)) continue
    if (feature.properties.iscurrent !== true && feature.properties.iscurrent !== 'true') continue
    const alert = featureToAlert(feature)
    if (!alert) continue
    if (alertAgeDays(alert, now) > MAX_ALERT_AGE_DAYS) continue
    out.push(alert)
  }
  return out
}

// ── Per-event detail (population estimates) ────────────────────────────────

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

async function fetchJson(url, validate, { signal, timeoutMs = 8000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // Chain caller's abort signal into the timeout controller.
  const onAbort = () => controller.abort()
  if (signal) signal.addEventListener('abort', onAbort, { once: true })
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'zuhd-news/1.0 (+https://zuhd.news)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (!validate(json)) throw new Error('schema mismatch')
    return json
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
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
