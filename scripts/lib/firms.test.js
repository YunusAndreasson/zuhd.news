// The thermal layer's arithmetic.
//
// Each test pins one way this could be wrong while still producing a payload
// that looks fine — which is the whole failure mode of a satellite feed: there
// is no shape to a wrong hotspot, it is a plausible mark in a plausible place.
//
// The two that matter most are the flare filter in both directions. Dropping
// steady sources is the only tool available (NRT has no `type` column), and the
// naive version of it deletes every large wildfire on its fourth day.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AOI_CELL_CAP,
  aoiCells,
  binKey,
  classifyCells,
  clusterEvents,
  haversineKm,
  isThermallyRelevant,
  minDistanceKm,
  nearestStories,
  parseFirmsCsv,
} from './firms.js'

const NOW = Date.UTC(2026, 6, 29, 12)
const HOUR = 3600_000
const DAY = 24 * HOUR

/** A detection row as `parseFirmsCsv` would have produced it. */
const det = (lat, lng, date, hourUtc, frp, extra = {}) => ({
  lat,
  lng,
  date,
  t: Date.parse(`${date}T00:00:00Z`) + hourUtc * HOUR,
  frp,
  confidence: 'nominal',
  satellite: 'N',
  daynight: 'N',
  ...extra,
})

// ---------------------------------------------------------------------------
// 1. Where to ask
// ---------------------------------------------------------------------------

test('AOI cells are the 10° boxes the seed points fall in', () => {
  const { cells, dropped } = aoiCells([
    { lat: 33.5, lng: 36.3 }, // Damascus
    { lat: 31.5, lng: 34.5 }, // Gaza — same 30..40 / 30..40 cell
    { lat: -1.3, lng: 36.8 }, // Nairobi
  ])
  assert.equal(dropped, 0)
  assert.equal(cells.length, 2)
  // The busiest cell leads, which is what makes the cap drop the sparsest corner.
  assert.equal(cells[0].weight, 2)
  assert.deepEqual(cells[0].bbox, [30, 30, 40, 40])
  const nairobi = cells.find((c) => c.weight === 1)
  assert.deepEqual(nairobi.bbox, [30, -10, 40, 0])
})

test('AOI cells clamp at the poles and the antimeridian', () => {
  const { cells } = aoiCells([
    { lat: -89.5, lng: 179.5 },
    { lat: 88, lng: -179.5 },
  ])
  for (const c of cells) {
    const [w, s, e, n] = c.bbox
    assert.ok(w >= -180 && e <= 180, `bbox ${c.bbox} runs off the antimeridian`)
    assert.ok(s >= -90 && n <= 90, `bbox ${c.bbox} runs off the pole`)
  }
})

test('the AOI cap reports what it dropped rather than truncating silently', () => {
  // One point per cell on a lattice, more cells than the cap allows. A single
  // band cannot do it: 36 cells of longitude is under the cap.
  const points = []
  for (let band = 0; points.length < AOI_CELL_CAP + 7; band++) {
    for (let i = 0; i < 36 && points.length < AOI_CELL_CAP + 7; i++) {
      points.push({ lat: 5 + band * 10, lng: -180 + i * 10 })
    }
  }
  const { cells, dropped } = aoiCells(points)
  assert.equal(cells.length, AOI_CELL_CAP)
  assert.equal(cells.length + dropped, points.length, 'every distinct cell is kept or counted')
  assert.equal(dropped, 7)
})

test('unplaceable seed points are ignored, not defaulted to null island', () => {
  const { cells } = aoiCells([
    { lat: null, lng: 30 },
    { lat: 'x', lng: 'y' },
    { lat: 200, lng: 400 },
    { lat: 12, lng: 13 },
  ])
  assert.equal(cells.length, 1)
  assert.deepEqual(cells[0].bbox, [10, 10, 20, 20])
})

// ---------------------------------------------------------------------------
// 2. What came back
// ---------------------------------------------------------------------------

const CSV_HEADER =
  'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight'

test('a VIIRS response parses into placed, timed detections', () => {
  const rows = parseFirmsCsv(
    `${CSV_HEADER}\n` +
      '33.512,36.291,325.1,0.4,0.4,2026-07-29,0142,N,VIIRS,n,2.0NRT,289.3,12.7,N\n' +
      '33.515,36.295,340.8,0.4,0.4,2026-07-29,142,N,VIIRS,h,2.0NRT,291.0,48.2,N\n',
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0].t, Date.parse('2026-07-29T01:42:00Z'))
  // "142" and "0142" are the same time — FIRMS is inconsistent about the pad.
  assert.equal(rows[1].t, rows[0].t)
  assert.equal(rows[0].confidence, 'nominal')
  assert.equal(rows[1].confidence, 'high')
  assert.equal(rows[0].frp, 12.7)
  assert.equal(rows[0].daynight, 'N')
})

test('MODIS numeric confidence maps onto the three words the card prints', () => {
  const rows = parseFirmsCsv(
    `${CSV_HEADER}\n` +
      '1,1,300,1,1,2026-07-29,0100,T,MODIS,12,x,280,5,D\n' +
      '2,2,300,1,1,2026-07-29,0100,T,MODIS,55,x,280,5,D\n' +
      '3,3,300,1,1,2026-07-29,0100,T,MODIS,95,x,280,5,D\n',
  )
  assert.deepEqual(
    rows.map((r) => r.confidence),
    ['low', 'nominal', 'high'],
  )
})

test('a row that cannot be placed or timed is dropped, not defaulted', () => {
  const rows = parseFirmsCsv(
    `${CSV_HEADER}\n` +
      ',,300,1,1,2026-07-29,0100,N,VIIRS,n,x,280,5,N\n' + // no coordinates
      '10,10,300,1,1,not-a-date,0100,N,VIIRS,n,x,280,5,N\n' + // no date
      '10,10,300,1,1,2026-07-29,9999,N,VIIRS,n,x,280,5,N\n' + // no such time
      '10,10,300,1,1,2026-07-29,0100,N,VIIRS,n,x,280,5,N\n',
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].lat, 10)
})

test('a changed upstream schema throws instead of yielding empty rows', () => {
  assert.throws(
    () => parseFirmsCsv('lat,lon,acq_date,acq_time,confidence,frp\n1,2,2026-07-29,0100,n,5\n'),
    /missing expected columns/,
  )
})

test('an empty or header-only response is no detections, not an error', () => {
  assert.deepEqual(parseFirmsCsv(''), [])
  assert.deepEqual(parseFirmsCsv(`${CSV_HEADER}\n`), [])
})

// ---------------------------------------------------------------------------
// 3. Which of it is infrastructure — the flare filter, both ways
// ---------------------------------------------------------------------------

/** Five days in one bin at a steady rate: a flare stack, not an event. */
const STEADY = [
  det(10.005, 20.005, '2026-07-25', 2, 10),
  det(10.005, 20.005, '2026-07-26', 2, 10),
  det(10.005, 20.005, '2026-07-27', 2, 10),
  det(10.005, 20.005, '2026-07-28', 2, 10),
  det(10.005, 20.005, '2026-07-29', 2, 10),
]

test('a bin alight every day at a steady rate is infrastructure', () => {
  const cells = classifyCells(STEADY, { now: NOW })
  const bin = cells.get(binKey(10.005, 20.005))
  assert.equal(bin.persistDays, 5)
  assert.equal(bin.baselineFrpPerDay, 10)
  assert.equal(bin.escalating, false)
  assert.equal(bin.persistent, true)
})

test('the same bin burning far above its own baseline is kept', () => {
  // This is the branch that stops the filter deleting every large wildfire on
  // its fourth day. Same five days, same bin — only today is different.
  const escalated = [...STEADY.slice(0, 4), det(10.005, 20.005, '2026-07-29', 2, 90)]
  const bin = classifyCells(escalated, { now: NOW }).get(binKey(10.005, 20.005))
  assert.equal(bin.persistDays, 5)
  assert.equal(bin.escalating, true)
  assert.equal(bin.persistent, false, 'an escalating multi-day fire must survive the flare filter')
})

test('two passes on one day is one day', () => {
  // Without this the filter counts overpasses instead of days, and every bin
  // under a busy schedule looks permanent.
  const rows = [
    det(10.005, 20.005, '2026-07-27', 2, 10),
    det(10.005, 20.005, '2026-07-27', 13, 10),
    det(10.005, 20.005, '2026-07-28', 2, 10),
    det(10.005, 20.005, '2026-07-28', 11, 10),
  ]
  const bin = classifyCells(rows, { now: NOW }).get(binKey(10.005, 20.005))
  assert.equal(bin.persistDays, 2)
  assert.equal(bin.persistent, false)
})

test("a bin lit for the first time today is not judged by a baseline it hasn't got", () => {
  const bin = classifyCells([det(1.005, 2.005, '2026-07-29', 2, 40)], { now: NOW }).get(
    binKey(1.005, 2.005),
  )
  assert.equal(bin.persistDays, 1)
  assert.equal(bin.baselineFrpPerDay, 0)
  assert.equal(bin.escalating, false, 'no baseline is not the same as an escalation')
  assert.equal(bin.persistent, false)
})

// ---------------------------------------------------------------------------
// 4. What is one event
// ---------------------------------------------------------------------------

test('touching bins are one fire and distant ones are two', () => {
  const rows = [
    det(10.005, 20.005, '2026-07-29', 2, 20),
    det(10.015, 20.015, '2026-07-29', 2, 20), // diagonal neighbour — same fire
    det(10.105, 20.005, '2026-07-29', 2, 20), // ten bins away — a different one
  ]
  const cells = classifyCells(rows, { now: NOW })
  const { events } = clusterEvents(rows, cells, { now: NOW })
  assert.equal(events.length, 2)
  const big = events[0]
  assert.equal(big.pixels, 2)
  assert.equal(big.frp, 40)
  assert.equal(events[1].pixels, 1)
})

test('a clustered event carries the peak, the extent and the pass that saw it', () => {
  const rows = [
    det(10.005, 20.005, '2026-07-29', 2, 10, { confidence: 'low', satellite: 'N' }),
    det(10.005, 20.006, '2026-07-29', 5, 90, { confidence: 'high', satellite: 'N20', daynight: 'D' }),
  ]
  const cells = classifyCells(rows, { now: NOW })
  const [event] = clusterEvents(rows, cells, { now: NOW }).events
  assert.equal(event.frp, 100)
  assert.equal(event.frpPeak, 90)
  assert.equal(event.pixels, 2)
  // Best confidence in the cluster, and the *peak* pixel's pass — a low-confidence
  // pixel beside a saturated one should not downgrade the mark.
  assert.equal(event.confidence, 'high')
  assert.equal(event.daynight, 'D')
  assert.deepEqual(event.satellites, ['N', 'N20'])
  assert.equal(event.t, Date.parse('2026-07-29T02:00:00Z'))
  assert.equal(event.tEnd, Date.parse('2026-07-29T05:00:00Z'))
  // FRP-weighted, so the mark sits on the hot pixel rather than between them.
  assert.ok(event.lng > 20.0055, `centroid ${event.lng} is not pulled toward the peak`)
})

test('persistent bins and sub-floor events are dropped and counted', () => {
  const rows = [
    ...STEADY,
    det(50.005, 60.005, '2026-07-29', 2, 1), // real, but 1 MW
  ]
  const cells = classifyCells(rows, { now: NOW })
  const { events, skipped } = clusterEvents(rows, cells, { now: NOW })
  assert.equal(events.length, 0)
  assert.equal(skipped.persistent, 1, 'the flare pass should be counted as dropped')
  assert.equal(skipped.belowFloor, 1)
})

test('baseline days are judged on, never drawn', () => {
  // Four quiet days then a jump: the event is today's pass alone, so its extent
  // must not stretch back across the baseline it was measured against.
  const rows = [...STEADY.slice(0, 4), det(10.005, 20.005, '2026-07-29', 2, 90)]
  const cells = classifyCells(rows, { now: NOW })
  const [event] = clusterEvents(rows, cells, { now: NOW }).events
  assert.equal(event.pixels, 1)
  assert.equal(event.frp, 90)
  assert.equal(event.t, Date.parse('2026-07-29T02:00:00Z'))
  assert.equal(event.persistDays, 5, 'the bin has still been alight five days, and says so')
  assert.equal(event.escalating, true)
})

// ---------------------------------------------------------------------------
// The join
// ---------------------------------------------------------------------------

test('haversine agrees with a degree of longitude at the equator', () => {
  assert.ok(Math.abs(haversineKm(0, 0, 0, 1) - 111.19) < 0.1)
  assert.equal(haversineKm(10, 20, 10, 20), 0)
})

test('stories are joined by distance, nearest first, and carry the distance', () => {
  const event = { lat: 0, lng: 0, t: NOW }
  const hits = nearestStories(event, [
    { slug: 'far', lat: 0, lng: 1.0, t: NOW }, // 111 km — outside
    { slug: 'near', lat: 0, lng: 0.1, t: NOW }, // 11 km
    { slug: 'mid', lat: 0, lng: 0.5, t: NOW }, // 56 km
  ])
  assert.deepEqual(
    hits.map((h) => h.slug),
    ['near', 'mid'],
  )
  assert.ok(hits[0].km > 11 && hits[0].km < 12, `expected ~11 km, got ${hits[0].km}`)
})

test('the time window is asymmetric, because a pass comes after the event', () => {
  const event = { lat: 0, lng: 0, t: NOW }
  const at = (offset) => nearestStories(event, [{ slug: 's', lat: 0, lng: 0, t: NOW + offset }])
  // A story three days before the detection: the fire it started may still burn.
  assert.equal(at(-3 * DAY).length, 1)
  assert.equal(at(-3 * DAY - HOUR).length, 0)
  // A story a day after: same event, reported late.
  assert.equal(at(DAY).length, 1)
  assert.equal(at(DAY + HOUR).length, 0)
})

test('distance to the nearest seed is what bounds the snapshot', () => {
  const seeds = [{ lat: 10, lng: 10 }, { lat: 0, lng: 0.2 }]
  assert.ok(minDistanceKm({ lat: 0, lng: 0 }, seeds) < 23)
  assert.equal(minDistanceKm({ lat: 0, lng: 0 }, []), Number.POSITIVE_INFINITY)
  // A seed with no usable coordinate must not resolve to null island and make
  // every anomaly on earth look close to something.
  assert.equal(
    minDistanceKm({ lat: 0, lng: 0 }, [{ lat: null, lng: undefined }]),
    Number.POSITIVE_INFINITY,
  )
})

// ---------------------------------------------------------------------------
// The subject gate — the difference between a layer and a coincidence generator
// ---------------------------------------------------------------------------

test('stories about things that burn qualify', () => {
  for (const title of [
    'Fire Cloud Forms Over Bordeaux',
    'France Evacuates 220,000 From Fires',
    'Aramco Shuts Jazan Refinery',
    'ESA Station Cleared After Fire',
    'Strikes Kill Iraqi Paramilitaries',
    'Air Strikes Hit Sanaa',
    'Explosion Rips Through Beirut Port',
    'Shelling Resumes Across Donbas',
    'Pipeline Ruptures In Nigeria Delta',
    'Volcano Erupts On Sicily',
  ]) {
    assert.ok(isThermallyRelevant(title), `should qualify: ${title}`)
  }
})

test('stories that merely share a city do not', () => {
  // Every one of these was published on a real snapshot with a thermal mark
  // hung off it, because the join was geography alone.
  for (const title of [
    'Joburg Bills Wrong Owners',
    'Campaign Targets Cookie Banners',
    'Fossils Show Inbred Cats',
    'Korean Traders Drive Shiba Surge',
    'Common Scale Fixed Cancer Testing',
    'Singapore Tightens Currency Band',
    'Drug Target Gains Inhibitors',
    'Libya Deal Splits Two Offices',
  ]) {
    assert.ok(!isThermallyRelevant(title), `should not qualify: ${title}`)
  }
})

test('a labour strike is not a military one', () => {
  // `strike` is the most valuable word in the vocabulary and the most dangerous,
  // which is why it is never matched bare.
  for (const title of [
    'Rail Workers Strike Over Pay',
    'Teachers Strike Enters Third Week',
    'Union Strike Halts Ports',
    'Doctors Threaten Strike Action',
  ]) {
    assert.ok(!isThermallyRelevant(title), `should not qualify: ${title}`)
  }
  assert.ok(isThermallyRelevant('Drone Strikes Resume Over Kharkiv'))
})

test('the vocabulary matches on words, not substrings', () => {
  // The lesson from the markets join, where a bare `includes` let `smi` match
  // "transmission" and hung eight tech stories off Zurich.
  assert.ok(!isThermallyRelevant('Bombay Exchange Lists New Fund'))
  assert.ok(!isThermallyRelevant('Firearms Bill Clears Senate'))
  assert.ok(!isThermallyRelevant('Shellfish Quotas Cut In North Sea'))
})

test('a story with no event time is joined on distance alone', () => {
  // The corpus is the map's own point set, so this should not happen — but a
  // silent drop would be worse than a slightly looser join if it ever does.
  const hits = nearestStories({ lat: 0, lng: 0, t: NOW }, [{ slug: 's', lat: 0, lng: 0.1 }])
  assert.equal(hits.length, 1)
})
