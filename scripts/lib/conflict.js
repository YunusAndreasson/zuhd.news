// Conflict events, as arithmetic: a UCDP candidate release in, the snapshot's
// events out. `scripts/fetch-conflict.js` does the network and the file; the
// build mirrors what it writes to `/api/conflict.json`, and the app takes that
// payload whole or not at all (`isConflictSnapshot`, `mobile/lib/validate.ts`).
//
// So an event here is the `ConflictEvent` of `shared/types.ts` exactly, and
// every gate is a row that must not be drawn: a location known only to the
// country, nobody killed, an actor with no name, a date the app cannot read.
//
//   REQUIRED_COLUMNS                                    what `csvObjects` (`lib/csv.js`) is asked to find
//   mapUcdpRow(row, tally?, { today }?) → ConflictEvent | null
//   newGateTally(), droppedRowsReport(tally)            what the gates dropped, counted and in words
//   filterRecentWindow(events, days) → { kept, windowStart, windowEnd }
//   emptyReleaseReport(rows, events) → string | null    a release with no event in it
//   candidateCsvUrl(version), nextReleases(version)     the release's file, and what follows it
//
// Nothing here touches the network or the clock, so all of it is tested
// against fixtures: `conflict.test.js`.

import { isIsoDate } from './iso-date.js'

/**
 * Where UCDP publishes a candidate release: `26.0.8` is `GEDEvent_v26_0_8.csv`.
 *
 * @param {string} version
 */
export const candidateCsvUrl = (version) =>
  `https://ucdp.uu.se/downloads/candidateged/GEDEvent_v${version.replace(/\./g, '_')}.csv`

/**
 * The releases that can follow `version`, for the fetcher to ask after.
 *
 * A candidate's last number is its month: 26.0.8 is August 2026. So what
 * follows is next month's, and after a December the first of the next year's,
 * 27.0.1, which no amount of adding one to 26.0.12 arrives at. Both are
 * returned every month rather than the second only in December: the question
 * costs one HEAD, and a release that skips a number is found too.
 *
 * @param {string} version `year.0.month`
 * @returns {string[]}
 */
export function nextReleases(version) {
  const [year, minor, month] = version.split('.').map(Number)
  return [`${year}.${minor}.${month + 1}`, `${year + 1}.${minor}.1`]
}

// CSV columns we depend on. If any of these are missing from the upstream
// header, UCDP has changed its schema and `csvObjects` throws loudly
// rather than emit silent garbage. Codebook:
//   https://ucdp.uu.se/downloads/candidateged/ucdp-candidate-codebook1.4.pdf
export const REQUIRED_COLUMNS = [
  'id',
  'relid',
  'date_start',
  'type_of_violence',
  'side_a',
  'side_b',
  'country',
  'adm_1',
  'adm_2',
  'where_coordinates',
  'where_prec',
  'latitude',
  'longitude',
  'best',
  'source_office',
  'source_headline',
]

// Drop low-precision records (where_prec 4-7 = country/region centroid).
// These cluster every event in a country at a single fake centroid and
// would render as a misleading dot pile on the globe.
const MAX_WHERE_PREC = 3

// Drop zero-fatality companion records. UCDP's candidate dataset publishes
// many records with best=0 that document follow-on reports of bigger
// events — useful for academic reconciliation but redundant on a visual
// layer. ≥1 removes ~30% of rows without losing meaningful theatres.
const MIN_FATALITIES = 1

// UCDP country names → our shared/countries names. Most align; these are
// the historical-suffix forms that won't match COUNTRY_DATA on first try.
// Expand as needed — missing entries fall through to the raw UCDP name and
// the country chip just hides if there's no flag.
export const COUNTRY_REWRITES = {
  'DR Congo (Zaire)': 'Democratic Republic of the Congo',
  'Yemen (North Yemen)': 'Yemen',
  'Myanmar (Burma)': 'Myanmar',
  'Russia (Soviet Union)': 'Russia',
  'Cambodia (Kampuchea)': 'Cambodia',
  'Madagascar (Malagasy)': 'Madagascar',
  Macedonia: 'North Macedonia',
}

// Compact country → ISO3. UCDP publishes Gleditsch-Ward country IDs, not
// ISO3, so we map by name. Missing entries get an empty iso3 string (the
// field is optional in our schema).
export const NAME_TO_ISO3 = {
  Afghanistan: 'AFG',
  Algeria: 'DZA',
  Bangladesh: 'BGD',
  Brazil: 'BRA',
  'Burkina Faso': 'BFA',
  Burundi: 'BDI',
  Cameroon: 'CMR',
  'Central African Republic': 'CAF',
  Chad: 'TCD',
  China: 'CHN',
  Colombia: 'COL',
  'Democratic Republic of the Congo': 'COD',
  Ecuador: 'ECU',
  Egypt: 'EGY',
  Ethiopia: 'ETH',
  Haiti: 'HTI',
  India: 'IND',
  Indonesia: 'IDN',
  Iran: 'IRN',
  Iraq: 'IRQ',
  Israel: 'ISR',
  Kenya: 'KEN',
  Lebanon: 'LBN',
  Libya: 'LBY',
  Mali: 'MLI',
  Mexico: 'MEX',
  Mozambique: 'MOZ',
  Myanmar: 'MMR',
  Niger: 'NER',
  Nigeria: 'NGA',
  Pakistan: 'PAK',
  Palestine: 'PSE',
  Philippines: 'PHL',
  Russia: 'RUS',
  Rwanda: 'RWA',
  Senegal: 'SEN',
  Somalia: 'SOM',
  'South Africa': 'ZAF',
  'South Sudan': 'SSD',
  Sudan: 'SDN',
  Syria: 'SYR',
  Tanzania: 'TZA',
  Thailand: 'THA',
  Tunisia: 'TUN',
  Turkey: 'TUR',
  Uganda: 'UGA',
  Ukraine: 'UKR',
  'United States of America': 'USA',
  Venezuela: 'VEN',
  Yemen: 'YEM',
  Zimbabwe: 'ZWE',
}

/** type_of_violence → our subEvent.
 *    1 (state-based, gov vs gov / gov vs rebel) → armed_clash
 *    2 (non-state, rebel vs rebel / communal)   → armed_clash
 *    3 (one-sided, group vs civilians)          → attack_on_civilians  */
function mapSubEvent(typeOfViolence) {
  if (typeOfViolence === '3') return 'attack_on_civilians'
  return 'armed_clash'
}

/** UCDP `where_coordinates` is often a town name with optional admin
 *  qualifiers ("near Bahir Dar town, Amhara region"). Pull out the first
 *  comma-separated chunk for a tight location label, then fall back to
 *  adm_2 / adm_1 when where_coordinates is empty. */
function pickLocation(row) {
  const where = (row.where_coordinates ?? '').trim()
  if (where.length > 0) return where.split(',')[0].trim()
  if (row.adm_2 && row.adm_2.trim().length > 0) return row.adm_2.trim()
  if (row.adm_1 && row.adm_1.trim().length > 0) return row.adm_1.trim()
  return row.country
}

/** Sanitize source_headline for the notes line. UCDP packs "CR Source:"
 *  prefixes and similar wire-service framing into source_headline.
 *  Truncate at ~140 chars so the sheet's notes paragraph stays readable. */
function pickNotes(row) {
  const raw = (row.source_headline ?? '').trim()
  if (raw.length === 0) return ''
  const noPrefix = raw.replace(/^CR\s+/i, '').replace(/^Source:\s*/i, '').trim()
  const oneLine = noPrefix.split(/[\r\n]+/)[0]
  if (oneLine.length <= 140) return oneLine
  return `${oneLine.slice(0, 137)}…`
}

const XXX_ACTOR = /^XXX\d+$/

/** Count one drop under `key`, where the caller is keeping count. */
const count = (tally, key) => {
  if (tally) tally[key] = (tally[key] ?? 0) + 1
}

/** Parse UCDP `source_article` into a structured list. The field packs N
 *  records as `;`-joined `"outlet,date,headline"` triplets where outlet
 *  may itself contain commas in rare cases (e.g. "Reuters, India"). We
 *  split conservatively: first comma → outlet, second comma → date, rest
 *  is the headline. Embedded newlines (UCDP appends `\nCR \tSource: ...`
 *  metadata to some headlines) get truncated at the first newline.
 *
 *  A record whose date slot is not a date is dropped, and counted in
 *  `tally.undatedSources`. That is what the comma case above produces
 *  ("India" where the date goes), and the app tests every source's date and
 *  takes the conflict layer whole or not at all: published, one such record
 *  costs every installed app the layer.
 *
 *  Returns [] for empty/malformed input rather than throwing — UCDP's
 *  format is consistent enough that bad rows are individual data
 *  problems, not pipeline failures.
 *
 *  @param {string | null | undefined} raw
 *  @param {Record<string, number>} [tally] counts what is dropped, by reason
 */
export function parseSourceArticle(raw, tally) {
  const text = (raw ?? '').trim()
  if (text.length === 0) return []
  const out = []
  // Split on `";"` boundaries between records. Each record is wrapped in
  // its own quotes; we strip them after splitting.
  const records = text.split(/"\s*;\s*"/)
  for (let i = 0; i < records.length; i++) {
    let rec = records[i]
    // Trim leading/trailing quote (only on the first/last entry; the
    // middle ones already had their wrapping quotes consumed by split).
    if (i === 0) rec = rec.replace(/^"/, '')
    if (i === records.length - 1) rec = rec.replace(/"$/, '')
    rec = rec.trim()
    if (!rec) continue

    const firstComma = rec.indexOf(',')
    if (firstComma < 0) continue
    const outlet = rec.slice(0, firstComma).trim()
    const restAfterOutlet = rec.slice(firstComma + 1)
    const secondComma = restAfterOutlet.indexOf(',')
    if (secondComma < 0) continue
    const date = restAfterOutlet.slice(0, secondComma).trim()
    let headline = restAfterOutlet.slice(secondComma + 1).trim()
    // Strip the trailing "\nCR \tSource: ..." metadata UCDP appends.
    headline = headline.split(/[\r\n]+/)[0].trim()
    if (!outlet || !headline) continue
    if (!isIsoDate(date)) {
      count(tally, 'undatedSources')
      continue
    }
    out.push({ outlet, date, headline })
  }
  return out
}

function intOrUndef(s) {
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/**
 * A tally for `mapUcdpRow`, every reason at zero.
 *
 * The gates drop about half of a release (894 of 1,806 rows in August 2026),
 * and until this was counted the snapshot said nothing of it: the conflict
 * layer read as UCDP's month, and the app's toll for a week as UCDP's sum,
 * when both are what is left after these. `outsideWindow` is the fetcher's to
 * fill: the events that passed and fall before the week the snapshot keeps.
 */
export const newGateTally = () => ({
  lowPrecision: 0,
  noFatalities: 0,
  noCoordinates: 0,
  nullIsland: 0,
  undated: 0,
  postdated: 0,
  unnamedActor: 0,
  undatedSources: 0,
  unreadableEnd: 0,
})

/** What each of `mapUcdpRow`'s reasons is called in the log. */
const DROPPED_AS = {
  lowPrecision: 'placed no closer than a region',
  noFatalities: 'with nobody killed',
  noCoordinates: 'with no coordinates',
  nullIsland: 'at null island',
  undated: 'with no readable start date',
  postdated: 'dated after today',
  unnamedActor: 'by an unnamed actor',
}

/**
 * A tally's dropped rows as words: `512 with nobody killed, 330 placed no
 * closer than a region`. Empty when no row was dropped.
 *
 * @param {Record<string, number>} tally
 */
export const droppedRowsReport = (tally) =>
  Object.entries(DROPPED_AS)
    .filter(([reason]) => tally[reason] > 0)
    .map(([reason, words]) => `${tally[reason]} ${words}`)
    .join(', ')

/** Map one UCDP row to a ConflictEvent, applying all quality gates.
 *  Returns null when the row should be dropped (low precision, no
 *  fatalities, bad coords, placeholder actors, etc.), and counts it in
 *  `tally` under its reason: see `newGateTally`.
 *
 *  Every date an event carries is one the app will accept (`isIsoDate`): a
 *  row with no readable start is dropped (`tally.undated`), an end that is
 *  not a date is left off (`tally.unreadableEnd`), and a source without one
 *  is dropped from the event's list. Ten characters was the test before, and
 *  `31/03/2026` is ten characters.
 *
 *  With `today`, a row dated after it is dropped (`tally.postdated`). The
 *  dataset is a month in arrears, so such a date is a slip of the coder's
 *  hand, and it is not harmless: `filterRecentWindow` anchors the window on
 *  the newest date it is given, so one row in next year is a layer of one
 *  event, with a lag alarm that sees a window ending in the future and says
 *  nothing.
 *
 *  @param {Record<string, string>} r
 *  @param {Record<string, number>} [tally] counts what is dropped, by reason
 *  @param {{ today?: string }} [opts] `today` as `YYYY-MM-DD`; the fetcher's, so this stays off the clock
 */
export function mapUcdpRow(r, tally, { today } = {}) {
  const drop = (/** @type {string} */ reason) => {
    count(tally, reason)
    return null
  }

  const wherePrec = parseInt(r.where_prec, 10)
  if (!Number.isFinite(wherePrec) || wherePrec > MAX_WHERE_PREC) return drop('lowPrecision')

  const fatalities = parseInt(r.best, 10)
  if (!Number.isFinite(fatalities) || fatalities < MIN_FATALITIES) return drop('noFatalities')

  const lat = parseFloat(r.latitude)
  const lng = parseFloat(r.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return drop('noCoordinates')

  // Defensive: drop near-(0,0) records. UCDP shouldn't emit these (every
  // event is geocoded), but Null Island is the universal geocoder failure
  // mode, and one slip would visually anchor a stray marker in the
  // Atlantic off Africa.
  if (Math.abs(lat) < 0.5 && Math.abs(lng) < 0.5) return drop('nullIsland')

  const dateStart = (r.date_start ?? '').slice(0, 10)
  if (!isIsoDate(dateStart)) return drop('undated')
  if (today && dateStart > today) return drop('postdated')

  const country = COUNTRY_REWRITES[r.country] ?? r.country
  const iso3 = NAME_TO_ISO3[country] ?? ''
  const sideA = (r.side_a ?? '').trim()
  const sideB = (r.side_b ?? '').trim()

  // UCDP's "XXX###" codes are placeholder identifiers for unidentified
  // sub-state actors — meaningless to a reader. Drop the event entirely
  // rather than display "XXX130 vs Civilians" on the sheet.
  if (!sideA || XXX_ACTOR.test(sideA)) return drop('unnamedActor')

  const event = {
    id: `UCDP-${r.relid || r.id}`,
    eventDate: dateStart,
    family: 'kinetic',
    subEvent: mapSubEvent(r.type_of_violence),
    actor1: sideA,
    country,
    iso3,
    location: pickLocation(r),
    lat,
    lng,
    fatalities,
    notes: pickNotes(r),
    source: (r.source_office ?? '').trim() || 'UCDP',
  }
  if (sideB && sideB !== sideA && !XXX_ACTOR.test(sideB)) event.actor2 = sideB
  if (r.adm_1 && r.adm_1.trim().length > 0) event.admin1 = r.adm_1.trim()

  // Enrichment fields (all optional). The base event above stays
  // backwards-compatible; a consumer that only knows the original 15
  // fields keeps working unchanged.
  const dateEnd = (r.date_end ?? '').slice(0, 10)
  if (isIsoDate(dateEnd)) {
    if (dateEnd !== dateStart) event.dateEnd = dateEnd
  } else if (dateEnd) {
    count(tally, 'unreadableEnd')
  }

  if (r.conflict_name && r.conflict_name.trim().length > 0) {
    event.conflictName = r.conflict_name.trim()
  }
  if (r.region && r.region.trim().length > 0) event.region = r.region.trim()
  if (r.where_description && r.where_description.trim().length > 0) {
    event.locationDetail = r.where_description.trim()
  }

  // Confidence interval — only attach when it carries information beyond
  // `best`. UCDP fills low/high to `best` for tight estimates, in which
  // case the range is uninteresting and the sheet would render "12 (12-12)".
  const low = intOrUndef(r.low)
  const high = intOrUndef(r.high)
  if (low !== undefined && high !== undefined && (low !== fatalities || high !== fatalities)) {
    event.fatalitiesLow = low
    event.fatalitiesHigh = high
  }

  // Casualty breakdown — attach individual fields when non-zero so the
  // sheet can render "12 killed (8 civilian, 4 combatant)".
  const dCiv = intOrUndef(r.deaths_civilians)
  const dA = intOrUndef(r.deaths_a)
  const dB = intOrUndef(r.deaths_b)
  const dU = intOrUndef(r.deaths_unknown)
  if (dCiv !== undefined && dCiv > 0) event.deathsCivilians = dCiv
  if (dA !== undefined && dA > 0) event.deathsSideA = dA
  if (dB !== undefined && dB > 0) event.deathsSideB = dB
  if (dU !== undefined && dU > 0) event.deathsUnknown = dU

  const numSources = intOrUndef(r.number_of_sources)
  if (numSources !== undefined && numSources > 0) event.numSources = numSources

  const sources = parseSourceArticle(r.source_article, tally)
  if (sources.length > 0) event.sources = sources

  return event
}

/** What `mapUcdpRow`'s gates read of a row. */
const GATED_ON = ['date_start', 'where_prec', 'best', 'latitude', 'longitude', 'side_a']

/**
 * What to say of a release that gave no event, or null when it gave some.
 *
 * A candidate month is a couple of thousand rows and about half pass the
 * gates, so none passing is not a peaceful month: it is a file with a header
 * and no body, or a column that changed what it holds. `filterRecentWindow`
 * answers that with an empty window and empty dates, which written out is a
 * blank conflict layer the fetcher's six-hour gate then holds, and a payload
 * the app's validator refuses for its `windowStart: ''`. So the fetcher keeps
 * the last snapshot, and this is the line it leaves: what the first row held
 * under the columns the gates read.
 *
 * @param {Record<string, string>[]} rows
 * @param {unknown[]} events the rows `mapUcdpRow` kept
 * @returns {string | null}
 */
export function emptyReleaseReport(rows, events) {
  if (events.length > 0) return null
  if (rows.length === 0) return 'the release held no rows'
  const saw = GATED_ON.map((key) => `${key}=${JSON.stringify(rows[0]?.[key])}`)
  return `${rows.length} rows and none past the quality gates; the first has ${saw.join(' ')}`
}

/** Filter to the last N days of the dataset's coverage. Anchors on the
 *  *dataset's* max date rather than `Date.now()` because UCDP candidate
 *  trails real-time by 1-3 months — using "today" would produce empty
 *  windows whenever the snapshot is more than N days stale. */
export function filterRecentWindow(events, days) {
  if (events.length === 0) return { kept: [], windowStart: '', windowEnd: '' }
  const sorted = [...events].sort((a, b) =>
    a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0,
  )
  const latestDate = sorted[0].eventDate
  const cutoff = new Date(`${latestDate}T00:00:00.000Z`)
  cutoff.setUTCDate(cutoff.getUTCDate() - (Math.max(1, days) - 1))
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const kept = sorted.filter((e) => e.eventDate >= cutoffStr)
  return { kept, windowStart: cutoffStr, windowEnd: latestDate }
}
