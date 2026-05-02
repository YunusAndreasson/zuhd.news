// Conflict-event transform. JS port of the schema in shared/types.ts ConflictEvent —
// the same shape contract, just running server-side. Currently consumed only by
// scripts/fetch-conflict-prototype.js (writes to mobile/lib/conflict-fixture.json
// for the on-device prototype). When the backend picks this up:
//
//   • Add scripts/fetch-conflict.js — same orchestrator pattern as fetch-gdacs.js,
//     writes to content/.conflict.json, gets mirrored to /api/conflict.json by
//     scripts/build.js exactly the way the GDACS snapshot is mirrored today.
//   • Wire it into run-cycle.sh as a stage between Stage 3.4c (gdacs) and
//     Stage 4 (briefing) — the cadence (every 4h) is appropriate for UCDP's
//     monthly upstream and will also fit ACLED's daily updates later.
//   • Mobile hook (useConflictEvents) swaps the bundled-fixture import for
//     `useFetchJson(`${API_BASE}/api/conflict.json`, isConflictSnapshot)` —
//     the validator is already in place at mobile/lib/validate.ts.
//
// Public surface:
//   parseCsv(text) → string[][]
//   rowsToObjects(rows) → Record<string, string>[]   (validates required columns)
//   mapUcdpRow(row) → ConflictEvent | null            (filters + transforms one row)
//   filterRecentWindow(events, days) → ConflictEvent[]  (cap to last N days of dataset)
//
// Output objects exactly match the ConflictEvent shape declared in
// shared/types.ts, so mobile (or any future consumer) can validate with
// isConflictSnapshot and ship without re-parsing.

// CSV columns we depend on. If any of these are missing from the upstream
// header, UCDP has changed its schema and rowsToObjects throws loudly
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

/** Minimal RFC 4180-ish CSV parser. Handles quoted fields with embedded
 *  commas, newlines, and doubled quotes ("" → "). UCDP's payload is well-
 *  formed so we don't bother with edge cases beyond the standard. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** rows → records keyed by header name. Throws if any REQUIRED_COLUMNS are
 *  missing from the header — protects against silent UCDP schema drift. */
export function rowsToObjects(rows) {
  const [header, ...data] = rows
  if (!header) throw new Error('UCDP CSV is empty')
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c))
  if (missing.length > 0) {
    throw new Error(
      `UCDP CSV is missing expected columns: ${missing.join(', ')}. ` +
        'Upstream may have changed its schema.',
    )
  }
  return data.map((r) => {
    const obj = {}
    for (let i = 0; i < header.length; i++) obj[header[i]] = r[i] ?? ''
    return obj
  })
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

/** Parse UCDP `source_article` into a structured list. The field packs N
 *  records as `;`-joined `"outlet,date,headline"` triplets where outlet
 *  may itself contain commas in rare cases (e.g. "Reuters, India"). We
 *  split conservatively: first comma → outlet, second comma → date, rest
 *  is the headline. Embedded newlines (UCDP appends `\nCR \tSource: ...`
 *  metadata to some headlines) get truncated at the first newline.
 *
 *  Returns [] for empty/malformed input rather than throwing — UCDP's
 *  format is consistent enough that bad rows are individual data
 *  problems, not pipeline failures. */
export function parseSourceArticle(raw) {
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
    out.push({ outlet, date, headline })
  }
  return out
}

function intOrUndef(s) {
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Map one UCDP row to a ConflictEvent, applying all quality gates.
 *  Returns null when the row should be dropped (low precision, no
 *  fatalities, bad coords, placeholder actors, etc.). */
export function mapUcdpRow(r) {
  const wherePrec = parseInt(r.where_prec, 10)
  if (!Number.isFinite(wherePrec) || wherePrec > MAX_WHERE_PREC) return null

  const fatalities = parseInt(r.best, 10)
  if (!Number.isFinite(fatalities) || fatalities < MIN_FATALITIES) return null

  const lat = parseFloat(r.latitude)
  const lng = parseFloat(r.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  // Defensive: drop near-(0,0) records. UCDP shouldn't emit these (every
  // event is geocoded), but Null Island is the universal geocoder failure
  // mode, and one slip would visually anchor a stray marker in the
  // Atlantic off Africa.
  if (Math.abs(lat) < 0.5 && Math.abs(lng) < 0.5) return null

  const dateStart = (r.date_start ?? '').slice(0, 10)
  if (dateStart.length !== 10) return null

  const country = COUNTRY_REWRITES[r.country] ?? r.country
  const iso3 = NAME_TO_ISO3[country] ?? ''
  const sideA = (r.side_a ?? '').trim()
  const sideB = (r.side_b ?? '').trim()

  // UCDP's "XXX###" codes are placeholder identifiers for unidentified
  // sub-state actors — meaningless to a reader. Drop the event entirely
  // rather than display "XXX130 vs Civilians" on the sheet.
  if (!sideA || XXX_ACTOR.test(sideA)) return null

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
  if (dateEnd.length === 10 && dateEnd !== dateStart) event.dateEnd = dateEnd

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

  const sources = parseSourceArticle(r.source_article)
  if (sources.length > 0) event.sources = sources

  return event
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
