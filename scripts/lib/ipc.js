// Acute food insecurity, as arithmetic.
//
// The IPC — Integrated Food Security Phase Classification — is a multi-agency
// process in which a national Technical Working Group classifies a subnational
// area into one of five phases, on a date, from evidence it publishes. That makes
// it the same kind of object as `shared/genocide.ts`: a **determination by a
// named body**, not a machine reading. It is a condition rather than an event, so
// the map draws it outside the scrubber, and the layer's whole honesty rests on
// three facts that are easy to get wrong and produce a plausible map either way.
//
// ── The phase is read, never derived ───────────────────────────────────────
//
// IPC classifies an area on population *thresholds* — roughly, 20% of the
// population in Phase 3 or above puts the area in Phase 3 — not on which phase
// holds the most people. Deriving the phase from the population columns by taking
// the largest share puts **2,122 of 2,804 areas in Phase 1**, measured against a
// real payload: a famine layer that draws the world as mostly fine, with nothing
// anywhere failing. `overall_phase` exists in the IPC's own GeoJSON and is the
// only phase this module will accept.
//
// ── Which is why two files are required, not one ───────────────────────────
//
// The published CSV carries the analysis date, the window dates and the
// per-phase populations, and **no `overall_phase` and no geometry**. The
// per-country GeoJSON carries `overall_phase`, `confidence_level` and geometry,
// and **no dates at all** — only `ipc_period: "C"`. Neither file can produce a
// mark alone. They are joined on the area's name, normalised: measured 100% on
// Somalia (107/107) and Sudan (196/196).
//
// ── The classification drawn is the current period, and it has a vintage ───
//
// The CSV also carries two projection windows, and they are deliberately *not*
// drawn. A projection has its own population columns but no published
// `overall_phase`, so drawing one would mean deriving a phase — the first rule
// here — or pairing the current period's phase with a later period's numbers,
// which is worse because it looks right. So the mark is the IPC's current-period
// classification, and what varies between marks is how old the analysis is.
//
// That age is the real quantity. IPC current windows run two to three months and
// analyses are re-published every few months, so at any instant almost every
// area's window has closed: **49 of 3,096** brackets today. A "lapsed" flag would
// therefore be true of 98% of the layer, which is not a flag, it is a constant.
// `analysisAgeMonths` runs 0 to 12 across the gated set — Somalia at 3.9 months,
// Sudan 6.9, Gaza 8.9, Afghanistan 9.9 — and that is a signal a reader can use,
// in the same way the conflict layer decays on its own dataset's recency rather
// than on wall-clock.
//
// Nothing here touches the network, so all of it is testable against fixtures —
// see `ipc.test.js`.

import { parseCsv } from './conflict.js'

/**
 * How old an analysis may be and still describe a place.
 *
 * Twelve months, and the bound is doing real work rather than tidying: the
 * published file still carries **Ethiopia's May 2021 analysis** in its "current"
 * columns, five years on, and those three areas hold the three largest Phase 5
 * populations in the whole dataset. Ungated, any "worst areas" read puts 2021
 * Ethiopia above 2026 Gaza — a five-year-old number winning on a news map
 * because nothing asked how old it was.
 *
 * Twelve rather than six because IPC analysis cycles are annual in much of the
 * Sahel and West Africa, so a six-month bound would drop countries that are
 * being assessed on schedule. It keeps 2,804 of 3,096 areas and 37 of 50
 * countries.
 */
export const AGE_LIMIT_MONTHS = 12

/**
 * The phase at or above which an area gets a mark.
 *
 * Phase 4 is Emergency and Phase 5 is Catastrophe, which is 620 areas of the
 * 2,804 gated — comparable to the 705-story corpus, and an order of magnitude
 * under the conflict layer. Drawing Phase 1 and 2 as well would mean most marks
 * on the layer say "this place is fine", which is not a thing a news map is for;
 * drawing Phase 3 takes it to roughly 2,000 and crowds the Sahel and the Horn at
 * the opening zoom. This is the `genocide` bar applied to a graded scale: the
 * gravest end, drawn, and the rest recorded.
 */
export const PUBLISH_MIN_PHASE = 4

/** The IPC's phase names, as the IPC names them. */
export const PHASE_NAMES = {
  1: 'Minimal',
  2: 'Stressed',
  3: 'Crisis',
  4: 'Emergency',
  5: 'Catastrophe',
}

/**
 * The IPC's own country list, ISO3 → the ISO2 this site keys country pages on.
 *
 * Scoped deliberately: this is the 52 countries the IPC publishes, enumerated
 * from its own resource filenames, not a general alpha-3 table. A general one
 * would be 249 rows of which 197 could never be reached from here, and the
 * failure mode of a *partial* general table is worse than a complete specific
 * one — a missing code is a card with no route to the country profile, which is
 * the `CC_TO_TOPOJSON_NAME` defect (`MK` keyed to a label rather than a join key)
 * in another costume.
 *
 * `PSE → PS` matches `shared/genocide.ts`, which is the point: a famine mark and
 * a genocide mark over Gaza must open the same profile.
 */
export const ISO3_TO_ISO2 = {
  AFG: 'AF', AGO: 'AO', BDI: 'BI', BEN: 'BJ', BFA: 'BF', BGD: 'BD',
  CAF: 'CF', CIV: 'CI', CMR: 'CM', COD: 'CD', CPV: 'CV', DJI: 'DJ',
  DOM: 'DO', ECU: 'EC', ETH: 'ET', GHA: 'GH', GIN: 'GN', GMB: 'GM',
  GNB: 'GW', GTM: 'GT', HND: 'HN', HTI: 'HT', KEN: 'KE', LBN: 'LB',
  LBR: 'LR', LSO: 'LS', MDG: 'MG', MLI: 'ML', MOZ: 'MZ', MRT: 'MR',
  MWI: 'MW', NAM: 'NA', NER: 'NE', NGA: 'NG', PAK: 'PK', PSE: 'PS',
  SDN: 'SD', SEN: 'SN', SLE: 'SL', SLV: 'SV', SOM: 'SO', SSD: 'SS',
  SWZ: 'SZ', TCD: 'TD', TGO: 'TG', TLS: 'TL', TZA: 'TZ', UGA: 'UG',
  YEM: 'YE', ZAF: 'ZA', ZMB: 'ZM', ZWE: 'ZW',
}

/**
 * Columns this module reads.
 *
 * A missing one means the published shape changed, and the right response is to
 * throw. The alternative is rows with `undefined` populations that filter out
 * downstream as "no areas in Phase 4", which is indistinguishable from a world
 * with no famine in it.
 */
export const REQUIRED_COLUMNS = [
  'Date of analysis',
  'Country',
  'Level 1',
  'Area',
  'Current from',
  'Current to',
]

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const AVG_MONTH_MS = 30.44 * 86_400_000

/**
 * A number, or `null` — never a zero standing in for an absence.
 *
 * The same hazard `firms.js` documents on coordinates applies to a population:
 * `Number('')` is 0, and an area with no figure for Phase 5 and an area the IPC
 * assessed as having nobody in Phase 5 are different statements. Only one of
 * them may be printed as "0".
 */
const num = (v) => {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * The area name, reduced to what two files can agree on.
 *
 * The join key is a name because the CSV exposes no id — the GeoJSON has
 * `aar_id` and the CSV does not carry it. Case, punctuation and runs of
 * whitespace differ between the two renderings of names like
 * `Awdal Urban (Baki, Lughaye and Zeylac)`, and nothing else does: measured
 * across Somalia and Sudan this matches every row.
 */
export const normaliseAreaName = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * `"Oct 2025"` → a Date at the first of that month, or `null`.
 *
 * The IPC publishes the analysis date as a month and year and nothing finer, so
 * the first of the month is the only honest instant to place it at. Returning
 * `null` on anything unparseable is what makes the age gate a gate: a vintage
 * that cannot be read is a vintage that cannot be checked, and an area whose age
 * is unknown must not be drawn as current.
 */
export const parseAnalysisDate = (s) => {
  const m = String(s ?? '').trim().match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/)
  if (!m) return null
  const month = MONTHS[m[1].toLowerCase()]
  if (!month) return null
  const d = new Date(Date.UTC(Number(m[2]), month - 1, 1))
  return Number.isNaN(d.getTime()) ? null : d
}

/** An ISO date string → Date, or `null`. Blank window columns are common. */
export const parseWindowDate = (s) => {
  const t = String(s ?? '').trim()
  if (!t) return null
  const d = new Date(`${t}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * How many months old an analysis is. Fractional, so the card can say "8.9".
 *
 * Calendar months would be the more careful unit and are not worth it here: the
 * input is only accurate to a month in the first place, and this feeds a
 * twelve-month bound and a line of prose.
 */
/** @param {Date|null|undefined} analysisDate @param {number} [now] Epoch ms; defaults to the wall clock. */
export const analysisAgeMonths = (analysisDate, now = Date.now()) => {
  if (!analysisDate) return null
  return (now - analysisDate.getTime()) / AVG_MONTH_MS
}

/**
 * The window covering a given day, or `null`.
 *
 * Takes ISO `YYYY-MM-DD` strings, which sort lexicographically and so compare
 * correctly without parsing — and, more to the point, is the shape
 * `content/.ipc.json` actually carries, so `build.js` can use this rather than
 * writing the comparison a second time. One rule, one place: a second copy of
 * "which projection covers today" is a second thing to get wrong about a card
 * that already has to be careful about dates.
 *
 * Used only to report a superseding projection on the card, never to pick a
 * phase — see the header. Its job is one line: an eight-month-old classification
 * reads differently when the same analysis carries a forward statement covering
 * today, and a reader weighing the mark deserves to know which case they are in.
 */
export const windowCoveringDay = (windows, isoDay) =>
  (windows ?? []).find((w) => w?.from && w?.to && w.from <= isoDay && isoDay <= w.to) ?? null

/**
 * The published CSV → rows this module understands.
 *
 * `parseCsv` is the one in `conflict.js`, reused for the reason `firms.js` reuses
 * it: three fetchers parsing CSV three ways is three places for a quoted field
 * containing a comma to be handled differently.
 */
export function parseIpcAreaCsv(text) {
  const rows = parseCsv(String(text ?? ''))
  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.trim())
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c))
  if (missing.length > 0) {
    throw new Error(`IPC CSV missing expected columns: ${missing.join(', ')}`)
  }
  const at = (r, name) => {
    const i = header.indexOf(name)
    return i < 0 ? '' : r[i]
  }
  const phases = (r, suffix) => {
    const out = { total: num(at(r, `Population analyzed ${suffix}`)) }
    for (let p = 1; p <= 5; p++) {
      out[`p${p}`] = num(at(r, `Phase ${p} number ${suffix}`))
      out[`p${p}pct`] = num(at(r, `Phase ${p} percentage ${suffix}`))
    }
    out.p3plus = num(at(r, `Phase 3+ number ${suffix}`))
    return out
  }

  const out = []
  for (const r of rows.slice(1)) {
    const area = at(r, 'Area')
    const country = at(r, 'Country')
    // A row with no country or no area cannot be joined to geometry and cannot
    // be attributed, so it is not a partial record — it is not a record.
    if (!country || !area) continue
    out.push({
      country,
      level1: at(r, 'Level 1'),
      area,
      key: normaliseAreaName(area),
      countryPopulation: num(at(r, 'Total country population')),
      analysisLabel: at(r, 'Date of analysis'),
      analysisDate: parseAnalysisDate(at(r, 'Date of analysis')),
      current: {
        kind: 'current',
        from: parseWindowDate(at(r, 'Current from')),
        to: parseWindowDate(at(r, 'Current to')),
      },
      projections: [
        {
          kind: 'projection',
          from: parseWindowDate(at(r, 'First projection from')),
          to: parseWindowDate(at(r, 'First projection to')),
        },
        {
          kind: 'projection',
          from: parseWindowDate(at(r, 'Second projection from')),
          to: parseWindowDate(at(r, 'Second projection to')),
        },
      ],
      population: phases(r, 'current'),
    })
  }
  return out
}

/**
 * Apply the age gate.
 *
 * Returns what survived and a count of what did not, by reason. The counts are
 * not diagnostics — they are published, the way `.firms.json` publishes
 * `skipped`, because a bounded layer that does not say what it left out reads as
 * complete coverage.
 */
/**
 * @param {{ analysisDate?: Date|null }[]} rows
 * @param {{ now?: number, ageLimitMonths?: number }} [opts]
 *        `now` is epoch ms and exists so the tests can pin a vintage; without
 *        the annotation TypeScript infers this bag from the `= {}` default,
 *        which drops every key that has no default of its own.
 */
export function gateByAge(rows, { now, ageLimitMonths = AGE_LIMIT_MONTHS } = {}) {
  const kept = []
  const skipped = { staleAnalysis: 0, unreadableVintage: 0 }
  for (const row of rows) {
    const age = analysisAgeMonths(row.analysisDate, now)
    if (age == null) {
      skipped.unreadableVintage++
      continue
    }
    if (age > ageLimitMonths) {
      skipped.staleAnalysis++
      continue
    }
    kept.push({ ...row, ageMonths: Math.round(age * 10) / 10 })
  }
  return { kept, skipped }
}

/**
 * Read one IPC GeoJSON feature's classification.
 *
 * `overall_phase` only, and `null` when it is absent or out of range rather than
 * a default — an unclassified area drawn at Phase 1 is a claim the IPC did not
 * make, and drawn at Phase 4 it is a much worse one.
 *
 * **Zero is the case that matters**, because it is common and it is not a low
 * phase: the IPC uses it for an area inside an analysis that was not itself
 * assessed. Nigeria publishes **220 of its 795 areas at phase 0** and Benin 56,
 * which is 280 of the set — so a reducer treating the field as a number and
 * comparing it against a threshold gets the right answer by luck, while one that
 * clamped or defaulted it would put a fifth of West Africa on the scale at a
 * position nobody assigned. They are counted as `noPhase` and published as such,
 * for the reason every other bound here is published.
 */
export function featureClassification(feature) {
  const p = feature?.properties ?? {}
  const phase = num(p.overall_phase)
  if (phase == null || phase < 1 || phase > 5) return null
  return {
    phase: Math.round(phase),
    // 1–3 in the IPC's own encoding, ascending in reliability. Passed through
    // rather than named here: it reaches the card as words, and the mapping
    // belongs where the words are.
    confidence: num(p.confidence_level),
    prolongedCrisis: p.prolonged_crisis === true,
    title: typeof p.title === 'string' ? p.title : '',
  }
}

/**
 * Join gated CSV rows to the geometry that carries their phase.
 *
 * `features` is one country's GeoJSON features; `point` is the reducer from
 * `geo-point.js`, injected so this module never resolves `d3-geo`.
 *
 * Only `view_level: 'area'` features are considered, and only the current
 * period. The IPC ships parent-level aggregates in the same collection — Sudan
 * has two, `Al Jazirah` and `Gedaref`, with no CSV row — and an aggregate drawn
 * beside its own children is one place counted twice.
 *
 * `tally` is passed in and mutated rather than returned, because the fetcher
 * accumulates it across every country in one pass. It used to be destructured
 * out of an options object — `{ skipped } = {}` — and the fetcher handed it the
 * tally directly, so the property was `undefined`, every count landed in a
 * throwaway default, and the payload reported `0 names unjoined` no matter what
 * happened. The counts exist to make a bounded layer say what it left out; one
 * that always reports zero is worse than none.
 */
export function joinAreas(rows, features, point, tally = { unjoined: 0, noGeometry: 0, noPhase: 0 }) {
  const byKey = new Map()
  for (const f of features ?? []) {
    const props = f?.properties ?? {}
    if (props.view_level && props.view_level !== 'area') continue
    if (props.ipc_period && props.ipc_period !== 'C') continue
    const k = normaliseAreaName(props.title)
    if (k && !byKey.has(k)) byKey.set(k, f)
  }

  const out = []
  for (const row of rows) {
    const f = byKey.get(row.key)
    if (!f) {
      tally.unjoined++
      continue
    }
    const cls = featureClassification(f)
    if (!cls) {
      tally.noPhase++
      continue
    }
    const at = point(f)
    if (!at) {
      tally.noGeometry++
      continue
    }
    out.push({ ...row, ...cls, lat: at.lat, lng: at.lng })
  }
  return out
}

/**
 * Whether an area is grave enough to draw.
 *
 * Two criteria, because one of them measured wrong. `overall_phase >= 4` is the
 * intended bar — Emergency and Catastrophe — and against a live payload it is
 * **101 areas across six countries**: Sudan 56, Somalia 24, Yemen 12, Nigeria 4,
 * Kenya 3, Djibouti 2. It also silently excludes **Gaza**, whose four areas the
 * November 2025 analysis classifies at Phase 3 while counting 39,885, 37,950,
 * 24,080 and 1,885 people in **Catastrophe** in them. An area classification is a
 * threshold on the whole population, so a place can hold tens of thousands of
 * people in Phase 5 and classify at Phase 3; that is a correct use of the scale
 * and a useless bar for a news map, which would have gone quiet on the gravest
 * caseload it covers.
 *
 * So an area is drawn when the IPC classifies it at Emergency or worse, **or**
 * when the IPC counts anyone at all in Catastrophe. This is not the derived phase
 * the header forbids: nothing is re-classified, the mark still carries
 * `overall_phase`, and the second criterion is another figure the same analysis
 * published. Measured, it adds exactly Palestine — the fifteen Sudanese areas
 * with a Catastrophe caseload are already Phase 4 — taking the layer to **105
 * areas across seven countries**.
 */
export const publishable = (area, minPhase = PUBLISH_MIN_PHASE) => {
  if (!Number.isFinite(area?.phase)) return false
  if (area.phase >= minPhase) return true
  return (area.population?.p5 ?? 0) > 0
}
