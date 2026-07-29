// Thermal anomalies, as arithmetic.
//
// NASA FIRMS publishes active-fire detections: one row per satellite pixel where
// a VIIRS or MODIS pass measured infrared radiance above the local background.
// Turning that into something a news map may draw takes four steps, and three of
// them exist because of what the product does *not* say.
//
//   1. Where to ask (`aoiCells`). Global VIIRS is 50–150k detections a day,
//      overwhelmingly agricultural burning. This layer is scoped to places the
//      map already asserts something is happening, so the query set is derived
//      from the corpus rather than from the world.
//   2. What came back (`parseFirmsCsv`).
//   3. Which of it is infrastructure (`classifyCells`). **The NRT products drop
//      the `type` field** that would have said "other static land source" — the
//      classification that names a gas flare, a steel mill, a volcano. So the
//      only flare filter available is persistence: a place alight every day is
//      not news. Getting this wrong in the obvious way — dropping anything
//      multi-day — would also delete every large wildfire, which is why the rule
//      has an escalation branch.
//   4. What is one event (`clusterEvents`). A fire is many pixels; a map that
//      drew each pixel would be drawing a texture, not a mark.
//
// Then `nearestStories` is the join that makes the layer mean anything: an
// anomaly beside a story we published is a second transmitter for the same
// event, from a different kind of witness. Nothing here touches the network, so
// all of it is testable against fixtures — see `firms.test.js`.

import { parseCsv } from './conflict.js'

/**
 * Columns we read. VIIRS and MODIS differ in exactly one of them — VIIRS
 * reports `bright_ti4`, MODIS `brightness` — and neither is load-bearing here,
 * so the header check covers only what is.
 *
 * A missing column means the product changed shape, and the right response is
 * to throw rather than emit rows with `undefined` coordinates that would later
 * be filtered out silently as "no detections today".
 */
export const REQUIRED_COLUMNS = [
  'latitude',
  'longitude',
  'acq_date',
  'acq_time',
  'confidence',
  'frp',
]

/** Side of an AOI cell, in degrees. */
export const AOI_CELL_DEG = 10

/**
 * How many AOI cells one cycle may ask for.
 *
 * FIRMS allows 5000 transactions per 10 minutes, so the cap is not about the
 * quota — it is about wall time inside a pipeline stage, and about not asking a
 * public service for the whole world one box at a time.
 *
 * Measured, not guessed: a real 14-day corpus of 688 geo-located stories plus 89
 * GDACS alerts lands in **116 cells**, and 60 of them took 13.5s. So the first
 * value here was low enough to silently drop half the map's own coverage — the
 * failure `dropped` was added to make visible. 140 covers a corpus half again as
 * scattered as the one measured, at around thirty seconds.
 */
export const AOI_CELL_CAP = 140

/**
 * Side of a persistence bin, in degrees. ~1.1 km at the equator.
 *
 * A VIIRS pixel is 375 m (about 0.0034°), so this bins a handful of adjacent
 * pixels together. That is deliberate: the same flare stack does not land on the
 * same pixel centre on consecutive passes, so a bin finer than the wobble would
 * read one steady source as several one-day ones and defeat the whole filter.
 */
export const PERSIST_BIN_DEG = 0.01

/** How recent a detection has to be to count as "this pass" rather than baseline. */
export const RECENT_WINDOW_MS = 24 * 3600_000

/**
 * Distinct days alight, at or above which a bin is presumed to be a fixed
 * installation rather than an event.
 *
 * Four of a five-day window. Three would catch more flares and also catch the
 * third day of every serious wildfire.
 */
export const PERSIST_DROP_DAYS = 4

/**
 * How far above its own baseline a persistent bin has to burn to be kept anyway.
 *
 * Without this the filter is wrong in the expensive direction: a fire that has
 * been running for a week is exactly the kind this map should carry, and it
 * looks identical to a flare under a plain day-count. Doubling is a real step
 * for a quantity as noisy as FRP, and it is measured against the bin's own
 * earlier days, not against any global figure.
 */
export const ESCALATION_FACTOR = 2

/** Total FRP, in megawatts, below which a clustered event is not drawn. */
export const MIN_EVENT_FRP = 5

/** How far a story may be from an anomaly and still be related, in km. */
export const JOIN_RADIUS_KM = 75

/** How long before / after a story's event time a detection may fall, in ms. */
export const JOIN_BEFORE_MS = 24 * 3600_000
export const JOIN_AFTER_MS = 72 * 3600_000

const CONFIDENCE_RANK = { low: 0, nominal: 1, high: 2 }

/**
 * A number, or `NaN` — never a zero standing in for an absence.
 *
 * `Number(null)` and `Number('')` are both `0`, which on a pair of coordinates
 * means null island: a detection in the Gulf of Guinea, at a perfectly plausible
 * latitude and longitude, that no filter downstream has any reason to doubt. An
 * empty `frp` column and a missing one are the same string here, and so are an
 * article whose `lat` was never set and one that genuinely sits on the equator.
 */
const num = (v) => {
  if (v == null) return Number.NaN
  const s = typeof v === 'string' ? v.trim() : v
  if (s === '') return Number.NaN
  return Number(s)
}

// --- 1. Where to ask ------------------------------------------------------

const clampLat = (v) => Math.max(-90, Math.min(90, v))
const clampLng = (v) => Math.max(-180, Math.min(180, v))

/** Floor to the cell's south-west corner. */
const cellFloor = (v, size) => Math.floor(v / size) * size

/**
 * The AOI set, as a coarse world grid over the seed points.
 *
 * A grid rather than a padded-and-merged box list, for one reason: merging
 * overlapping rectangles is a real algorithm with real edge cases, and the thing
 * it would buy — a slightly tighter query area — is worth nothing here, because
 * everything outside the join radius is discarded locally anyway. A grid is
 * deterministic, has no ordering dependence, and the cell a point falls in can
 * be checked by hand.
 *
 * Busiest cells survive the cap, so what gets dropped is always the sparsest
 * corner of the map rather than whichever cell happened to sort last.
 */
export function aoiCells(points, { size = AOI_CELL_DEG, cap = AOI_CELL_CAP } = {}) {
  const counts = new Map()
  for (const p of points ?? []) {
    const lat = num(p?.lat)
    const lng = num(p?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
    const south = cellFloor(clampLat(lat), size)
    const west = cellFloor(clampLng(lng), size)
    const key = `${south},${west}`
    const seen = counts.get(key)
    if (seen) seen.weight++
    else counts.set(key, { key, south, west, weight: 1 })
  }

  const all = [...counts.values()].sort(
    // Weight decides; the key breaks ties so the same corpus always produces
    // the same request list, which is what makes a slow run reproducible.
    (a, b) => b.weight - a.weight || a.key.localeCompare(b.key),
  )
  const kept = all.slice(0, cap)
  return {
    cells: kept.map((c) => ({
      key: c.key,
      weight: c.weight,
      // FIRMS wants west,south,east,north.
      bbox: [
        clampLng(c.west),
        clampLat(c.south),
        clampLng(c.west + size),
        clampLat(c.south + size),
      ],
    })),
    dropped: all.length - kept.length,
  }
}

// --- 2. What came back ----------------------------------------------------

/** `"0142"` / `"142"` → minutes past midnight UTC. */
const acqMinutes = (raw) => {
  const digits = String(raw ?? '').replace(/\D/g, '').padStart(4, '0')
  const h = Number(digits.slice(0, 2))
  const m = Number(digits.slice(2, 4))
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null
  return h * 60 + m
}

/**
 * VIIRS reports `l` / `n` / `h`; MODIS reports a 0–100 integer. Both arrive in
 * the same column, so both are normalised to the three words the card prints.
 *
 * The MODIS thresholds are the ones FIRMS itself uses in its own legend.
 */
const normalizeConfidence = (raw) => {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v) return 'nominal'
  if (v === 'l' || v === 'low') return 'low'
  if (v === 'n' || v === 'nominal') return 'nominal'
  if (v === 'h' || v === 'high') return 'high'
  const n = Number(v)
  if (!Number.isFinite(n)) return 'nominal'
  if (n < 30) return 'low'
  if (n < 80) return 'nominal'
  return 'high'
}

/**
 * One CSV response → detection rows.
 *
 * Rows that cannot be placed in space or time are dropped rather than defaulted:
 * a detection at (0, 0) on the epoch would be drawn in the Gulf of Guinea at the
 * left-hand end of the scrubber, which is a mark that looks like data.
 */
export function parseFirmsCsv(text) {
  const rows = parseCsv(String(text ?? ''))
  const header = rows[0]
  if (!header) return []
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c))
  if (missing.length > 0) {
    throw new Error(
      `FIRMS CSV is missing expected columns: ${missing.join(', ')}. ` +
        'Upstream may have changed its schema.',
    )
  }
  const col = {}
  for (let i = 0; i < header.length; i++) col[header[i]] = i

  const out = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    // A trailing newline yields a one-empty-field row; not an error.
    if (!row || row.length < 2) continue
    const lat = num(row[col.latitude])
    const lng = num(row[col.longitude])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
    const date = String(row[col.acq_date] ?? '').trim()
    const mins = acqMinutes(row[col.acq_time])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || mins == null) continue
    const t = Date.parse(`${date}T00:00:00Z`) + mins * 60_000
    if (!Number.isFinite(t)) continue
    const frp = num(row[col.frp])
    out.push({
      lat,
      lng,
      t,
      date,
      frp: Number.isFinite(frp) && frp > 0 ? frp : 0,
      confidence: normalizeConfidence(row[col.confidence]),
      satellite: String(row[col.satellite] ?? '').trim(),
      daynight: String(row[col.daynight] ?? '').trim().toUpperCase() === 'N' ? 'N' : 'D',
    })
  }
  return out
}

// --- 3. Which of it is infrastructure -------------------------------------

/** Which persistence bin a detection falls in. */
export const binKey = (lat, lng, size = PERSIST_BIN_DEG) =>
  `${Math.floor(lat / size)},${Math.floor(lng / size)}`

/**
 * Per-bin persistence, and the verdict that follows from it.
 *
 * `persistDays` counts *distinct acquisition dates*, not detections: two passes
 * on one day is one day, or every bin under a satellite with a busy overpass
 * schedule would look permanent.
 *
 * The escalation test compares this pass against the bin's own earlier days,
 * per day rather than in total, because a bin with four baseline days would
 * otherwise have to burn four times as hard as one with a single baseline day
 * to clear the same bar.
 */
export function classifyCells(
  rows,
  {
    now = Date.now(),
    recentWindowMs = RECENT_WINDOW_MS,
    dropDays = PERSIST_DROP_DAYS,
    escalation = ESCALATION_FACTOR,
    binSize = PERSIST_BIN_DEG,
  } = {},
) {
  const recentFrom = now - recentWindowMs
  const bins = new Map()
  for (const row of rows) {
    const key = binKey(row.lat, row.lng, binSize)
    let bin = bins.get(key)
    if (!bin) {
      bin = { key, days: new Set(), recentFrp: 0, baseFrp: 0, baseDays: new Set() }
      bins.set(key, bin)
    }
    bin.days.add(row.date)
    if (row.t >= recentFrom) {
      bin.recentFrp += row.frp
    } else {
      bin.baseFrp += row.frp
      bin.baseDays.add(row.date)
    }
  }

  const out = new Map()
  for (const bin of bins.values()) {
    const persistDays = bin.days.size
    const baseDayCount = bin.baseDays.size
    const basePerDay = baseDayCount > 0 ? bin.baseFrp / baseDayCount : 0
    const escalating = basePerDay > 0 && bin.recentFrp > basePerDay * escalation
    out.set(bin.key, {
      persistDays,
      recentFrp: bin.recentFrp,
      baselineFrpPerDay: basePerDay,
      escalating,
      persistent: persistDays >= dropDays && !escalating,
    })
  }
  return out
}

// --- 4. What is one event -------------------------------------------------

/**
 * Contiguous detections → one event.
 *
 * Breadth-first over the persistence grid with 8-neighbour adjacency, so bins
 * that touch at a corner join. That tolerates a gap of about a bin — roughly
 * two kilometres — which is what keeps a fire front with a cool patch in the
 * middle from being published as two fires.
 *
 * Only bins the classifier cleared, and only the recent pass: the baseline days
 * exist to judge the bin, not to be drawn.
 */
export function clusterEvents(
  rows,
  cells,
  { now = Date.now(), recentWindowMs = RECENT_WINDOW_MS, minFrp = MIN_EVENT_FRP, binSize = PERSIST_BIN_DEG } = {},
) {
  const recentFrom = now - recentWindowMs
  const byBin = new Map()
  let persistentDropped = 0
  for (const row of rows) {
    if (row.t < recentFrom) continue
    const key = binKey(row.lat, row.lng, binSize)
    if (cells.get(key)?.persistent) {
      persistentDropped++
      continue
    }
    const bucket = byBin.get(key)
    if (bucket) bucket.push(row)
    else byBin.set(key, [row])
  }

  const events = []
  let belowFloor = 0
  const seen = new Set()
  for (const startKey of byBin.keys()) {
    if (seen.has(startKey)) continue
    // One connected component.
    const queue = [startKey]
    seen.add(startKey)
    const members = []
    while (queue.length > 0) {
      const key = queue.pop()
      const bucket = byBin.get(key)
      if (bucket) members.push(...bucket)
      const [by, bx] = key.split(',').map(Number)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const next = `${by + dy},${bx + dx}`
          if (byBin.has(next) && !seen.has(next)) {
            seen.add(next)
            queue.push(next)
          }
        }
      }
    }

    const frp = members.reduce((sum, m) => sum + m.frp, 0)
    if (frp < minFrp) {
      belowFloor++
      continue
    }
    // FRP-weighted centroid, so the mark sits on the hot part rather than on
    // the middle of the bounding box. Falls back to a plain mean when every
    // pixel reported zero, which MODIS occasionally does.
    const weight = frp > 0 ? frp : members.length
    const wLat = members.reduce((s, m) => s + m.lat * (frp > 0 ? m.frp : 1), 0) / weight
    const wLng = members.reduce((s, m) => s + m.lng * (frp > 0 ? m.frp : 1), 0) / weight
    const peak = members.reduce((best, m) => (m.frp > best.frp ? m : best), members[0])
    const confidence = members.reduce(
      (best, m) => (CONFIDENCE_RANK[m.confidence] > CONFIDENCE_RANK[best] ? m.confidence : best),
      'low',
    )
    const times = members.map((m) => m.t)
    const persistDays = members.reduce(
      (max, m) => Math.max(max, cells.get(binKey(m.lat, m.lng, binSize))?.persistDays ?? 1),
      1,
    )
    const escalating = members.some(
      (m) => cells.get(binKey(m.lat, m.lng, binSize))?.escalating === true,
    )
    const lat = round(wLat, 4)
    const lng = round(wLng, 4)
    events.push({
      // Stable enough to survive a re-fetch of the same fire: the first date it
      // was seen, plus its centroid to ~5 km. Nothing persists per-event state
      // across sessions, so this only has to be unique within a payload and
      // steady across the cycles one fire lives through.
      id: `${peak.date}-${round(lat, 1).toFixed(1)}-${round(lng, 1).toFixed(1)}`,
      lat,
      lng,
      t: Math.min(...times),
      tEnd: Math.max(...times),
      frp: round(frp, 1),
      frpPeak: round(peak.frp, 1),
      pixels: members.length,
      confidence,
      daynight: peak.daynight,
      persistDays,
      ...(escalating ? { escalating: true } : {}),
      satellites: [...new Set(members.map((m) => m.satellite).filter(Boolean))].sort(),
    })
  }

  events.sort((a, b) => b.frp - a.frp)
  return { events, skipped: { persistent: persistentDropped, belowFloor } }
}

const round = (v, places) => {
  const f = 10 ** places
  return Math.round(v * f) / f
}

// --- The join -------------------------------------------------------------

const EARTH_KM = 6371
const DEG = Math.PI / 180

/** Great-circle distance in km. */
export function haversineKm(aLat, aLng, bLat, bLng) {
  const dLat = (bLat - aLat) * DEG
  const dLng = (bLng - aLng) * DEG
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * What a story has to be about for a nearby anomaly to mean anything.
 *
 * **This list is the difference between a layer and a coincidence generator**,
 * and the first version of this file did not have it. Distance and time alone
 * published, on a real snapshot, a veld fire 36 km from Johannesburg cited
 * against *"Joburg Bills Wrong Owners"* — nine of them — plus fires attached to
 * "Campaign Targets Cookie Banners", "Fossils Show Inbred Cats" and "Korean
 * Traders Drive Shiba Surge". A story's `location` is a city, so a 75 km radius
 * catches every fire in a metropolitan region and hangs it off whatever we
 * happened to publish about that city. That is the IODA failure in a new
 * costume: the join could not separate "our story is about this fire" from "our
 * story is about this city".
 *
 * Gated on subject, the same snapshot published eleven, and every one of them is
 * a real pairing: seven anomalies under a French wildfire, one under "Aramco
 * Shuts Jazan Refinery", one under "ESA Station Cleared After Fire", one under
 * "Strikes Kill Iraqi Paramilitaries".
 *
 * The rule for what belongs here: **things that burn, and violence that sets
 * things alight.** It is editorial and deliberately short, like `STATE_OUTLETS`
 * in `article-chain.js` — a list that grows by argument, not by reflex.
 *
 * Two entries are shaped the way they are on purpose:
 *
 *   - **`strike` is never matched bare.** It is the most valuable word here and
 *     the most dangerous: "Strikes Kill Iraqi Paramilitaries" is exactly the
 *     story a thermal mark corroborates, and "Rail Workers Strike Over Pay" is
 *     exactly the story it must not. So it is matched only in phrases a labour
 *     dispute cannot produce.
 *   - **`plant` was tried and removed.** It reads as botanical at least as often
 *     as industrial, and this list cannot afford a word that is usually wrong.
 */
export const THERMAL_VOCABULARY = [
  // Fire itself.
  /\bfires?\b/,
  /\bfirefighters?\b/,
  /wildfires?/,
  /bushfires?/,
  /\bblaze[sd]?\b/,
  /\bburn(s|ed|t|ing)?\b/,
  /\bablaze\b/,
  /\barson\b/,
  /incendiar/,
  /\btorched?\b/,
  /\bsmoke\b/,
  /\bsmoulder/,
  /\bsmolder/,
  // Things going up at once.
  /explos(ion|ions|ive)/,
  /\bexplode[ds]?\b/,
  /\bblast(s|ed)?\b/,
  /detonat/,
  // Violence that leaves something burning.
  /airstrikes?/,
  /\bair strikes?\b/,
  /bombard/,
  /\bbomb(s|ed|ing)?\b/,
  /\bshell(ed|ing)\b/,
  /\bmissiles?\b/,
  /\bartillery\b/,
  /\bmunitions?\b/,
  /\bstrikes? (kill|hit|target|destroy|damage|wreck)/,
  /\b(air|drone|missile|retaliatory|israeli|russian|us) strikes?\b/,
  // Industry that burns as a matter of course, and so shows up on this feed.
  /refiner(y|ies)/,
  /petrochemical/,
  /\boil ?field/,
  /\bgas ?field/,
  /pipelines?/,
  /\bflar(e|es|ing)\b/,
  /smelter/,
  /furnace/,
  // Conditions and consequences.
  /evacuat/,
  /\bdrought\b/,
  /heatwaves?/,
  /\bheat wave/,
  /volcan/,
  /eruption/,
]

/**
 * Whether a story could plausibly be about something the satellite saw.
 *
 * `hay` is the story's title and concepts, lowercased and joined — the same
 * haystack the chokepoint and market joins build in `build.js`, and deliberately
 * *not* including the body. Measured against a real snapshot the body takes the
 * yield from 11 events to 19, and the nine it adds are matches on a passing
 * mention rather than on what the story is about: "Iran Presses Lamerd Case"
 * qualifying because a sentence somewhere notes gas flaring.
 */
export const isThermallyRelevant = (hay) => {
  const text = String(hay ?? '').toLowerCase()
  return THERMAL_VOCABULARY.some((re) => re.test(text))
}

/**
 * Distance to the nearest of `points`, or `Infinity` if there are none.
 *
 * This is what actually bounds the layer, and the first version of it did not
 * exist — which was a real mistake worth recording. Scoping the *query* to 10°
 * cells around the corpus cut the download from tens of megabytes to under one,
 * and left **7,771 events**, because a 10° cell is 1,100 km across and the ones
 * over Africa, Brazil and India are wall-to-wall agricultural burning. The AOI
 * bounds the bytes; only the join bounds the map.
 */
export function minDistanceKm(event, points) {
  let best = Number.POSITIVE_INFINITY
  for (const p of points ?? []) {
    const lat = num(p?.lat)
    const lng = num(p?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const km = haversineKm(event.lat, event.lng, lat, lng)
    if (km < best) best = km
  }
  return best
}

/**
 * Stories this anomaly might be about, nearest first.
 *
 * The radius is 75 km and that is not a precision claim — it is an admission.
 * A story's `location` is a city, so its coordinate is a city centroid, and a
 * strike or a fire forty kilometres outside the city is still reported from it.
 * Which is exactly why every hit carries its `km`: the card prints the distance
 * rather than asserting the anomaly is *at* the story, and a reader can see for
 * themselves how loose the join is.
 *
 * The time window is asymmetric for the same kind of reason. A satellite pass
 * comes after the event, sometimes hours after, and a fire started by something
 * we reported can still be burning three days later — but a detection a day
 * *before* the story is either the same event reported late or a coincidence,
 * and past that it is just a different fire in the same province.
 */
export function nearestStories(
  event,
  stories,
  {
    radiusKm = JOIN_RADIUS_KM,
    beforeMs = JOIN_BEFORE_MS,
    afterMs = JOIN_AFTER_MS,
    limit = 8,
  } = {},
) {
  const hits = []
  for (const s of stories ?? []) {
    if (!Number.isFinite(s?.lat) || !Number.isFinite(s?.lng)) continue
    if (Number.isFinite(s.t)) {
      if (event.t < s.t - beforeMs) continue
      if (event.t > s.t + afterMs) continue
    }
    const km = haversineKm(event.lat, event.lng, s.lat, s.lng)
    if (km > radiusKm) continue
    hits.push({ ...s, km: round(km, 1) })
  }
  hits.sort((a, b) => a.km - b.km)
  return hits.slice(0, limit)
}
