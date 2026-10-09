// Parser invariants for GDACS feed → snapshot conversion. Pinned bugs:
//   • polygon features used to leak through and crash mobile projection
//   • iscurrent=false events used to render after they'd already ended
//   • auto-caption descriptions used to duplicate the sheet header verbatim
//   • alerts older than 30 days used to accumulate into a graveyard layer
//
// Run with: node --test scripts/lib/gdacs.test.js

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  carryNarratives,
  collectionToAlerts,
  detailKey,
  detailsInAlertOrder,
  emptyListReport,
  featureToDetail,
  isGdacsFeatureCollection,
  readImpactScalar,
} from './gdacs.js'

const validFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [37.0, 35.0] },
  properties: {
    eventid: 1234567,
    eventtype: 'EQ',
    alertlevel: 'Red',
    name: 'M 7.4 Honshu, Japan',
    eventname: 'M 7.4 Honshu, Japan',
    country: 'Japan',
    iso3: 'JPN',
    fromdate: '2026-04-30T03:00:00',
    todate: '',
    datemodified: '2026-05-01T08:00:00',
    htmldescription: '<p>A magnitude 7.4 earthquake struck off Honshu.</p>',
    severitydata: { severity: 7.4, severitytext: 'Magnitude 7.4M, Depth:23km', severityunit: 'M' },
    affectedcountries: [{ iso2: 'JP', iso3: 'JPN', countryname: 'Japan' }],
    url: { report: 'https://www.gdacs.org/report.aspx?eventid=1234567' },
    iscurrent: true,
  },
}

// Anchor `now` to a fixed point relative to the fixture so the 30-day-age
// cliff inside collectionToAlerts is deterministic regardless of when the
// suite runs.
const FIXTURE_NOW = Date.parse('2026-05-02T00:00:00Z') + 86_400_000

test('isGdacsFeatureCollection accepts well-formed, rejects malformed', () => {
  assert.equal(isGdacsFeatureCollection({ type: 'FeatureCollection', features: [] }), true)
  assert.equal(isGdacsFeatureCollection({ type: 'FeatureCollection', features: [validFeature] }), true)
  assert.equal(isGdacsFeatureCollection(null), false)
  assert.equal(isGdacsFeatureCollection({}), false)
  assert.equal(isGdacsFeatureCollection({ type: 'Other', features: [] }), false)
  assert.equal(isGdacsFeatureCollection({ type: 'FeatureCollection' }), false)
})

test('collectionToAlerts flattens valid features and skips polygon / non-current', () => {
  const collection = {
    type: 'FeatureCollection',
    features: [
      validFeature,
      { ...validFeature, properties: { ...validFeature.properties, iscurrent: false } },
      { ...validFeature, geometry: { type: 'Polygon', coordinates: [] } },
    ],
  }
  const out = collectionToAlerts(collection, FIXTURE_NOW)
  assert.equal(out.length, 1)
  const a = out[0]
  assert.equal(a.eventid, '1234567')
  assert.equal(a.eventtype, 'EQ')
  assert.equal(a.alertlevel, 'Red')
  assert.equal(a.country, 'Japan')
  assert.equal(a.lat, 35)
  assert.equal(a.lng, 37)
  assert.equal(a.severityText, 'Magnitude 7.4M, Depth:23km')
  assert.equal(a.reportUrl, 'https://www.gdacs.org/report.aspx?eventid=1234567')
  assert.deepEqual(a.affectedCountries, ['Japan'])
  assert.match(a.description, /magnitude 7\.4 earthquake/i)
  assert.doesNotMatch(a.description, /<p>/)
})

test('collectionToAlerts keeps Green alerts and drops unknown event types', () => {
  const collection = {
    type: 'FeatureCollection',
    features: [
      { ...validFeature, properties: { ...validFeature.properties, alertlevel: 'Green' } },
      { ...validFeature, properties: { ...validFeature.properties, eventtype: 'XX' } },
    ],
  }
  const out = collectionToAlerts(collection, FIXTURE_NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].alertlevel, 'Green')
})

test('collectionToAlerts rejects unrecognized alert levels', () => {
  const collection = {
    type: 'FeatureCollection',
    features: [{ ...validFeature, properties: { ...validFeature.properties, alertlevel: 'Yellow' } }],
  }
  assert.equal(collectionToAlerts(collection, FIXTURE_NOW).length, 0)
})

test('collectionToAlerts exposes structured severity, source, substantive description', () => {
  const collection = {
    type: 'FeatureCollection',
    features: [{ ...validFeature, properties: { ...validFeature.properties, source: 'NEIC' } }],
  }
  const out = collectionToAlerts(collection, FIXTURE_NOW)
  assert.equal(out[0].severityValue, 7.4)
  assert.equal(out[0].severityUnit, 'M')
  assert.equal(out[0].source, 'NEIC')
  assert.match(out[0].description, /magnitude 7\.4 earthquake/i)
})

test('collectionToAlerts drops auto-caption descriptions', () => {
  // Templated GDACS captions duplicate name + severityText + fromDate. The
  // anchored regex requires both the level prefix and "at: <date>" suffix
  // so real prose like "Red Cross teams have deployed…" survives.
  const autoCaption = {
    ...validFeature,
    properties: {
      ...validFeature.properties,
      alertlevel: 'Green',
      htmldescription: 'Green M 5 Earthquake in South Sandwich Islands Region at: 02 May 2026 10:31:40.',
    },
  }
  const out = collectionToAlerts({ type: 'FeatureCollection', features: [autoCaption] }, FIXTURE_NOW)
  assert.equal(out[0].description, '')
})

test('collectionToAlerts drops alerts older than 30 days', () => {
  // Long-running events (multi-month droughts) keep appearing on the GDACS
  // feed indefinitely. The 30-day cliff prevents the map from accumulating.
  const old = {
    ...validFeature,
    properties: { ...validFeature.properties, datemodified: '2026-03-15T08:00:00' },
  }
  const out = collectionToAlerts({ type: 'FeatureCollection', features: [old, validFeature] }, FIXTURE_NOW)
  assert.equal(out.length, 1)
  assert.equal(out[0].modifiedDate, '2026-05-01T08:00:00Z')
})

test('a GDACS time says it is UTC', () => {
  // GDACS writes UTC with no offset, and a date-time with no offset is local
  // time to every `Date.parse` that reads the snapshot: the app's "updated 3h
  // ago" and the map's scrubber were out by the viewer's distance from UTC.
  const at = (dates) => {
    const feature = { ...validFeature, properties: { ...validFeature.properties, ...dates } }
    return collectionToAlerts({ type: 'FeatureCollection', features: [feature] }, FIXTURE_NOW)[0]
  }
  const bare = at({ todate: '2026-05-01T12:00:00' })
  assert.deepEqual(
    [bare.fromDate, bare.toDate, bare.modifiedDate],
    ['2026-04-30T03:00:00Z', '2026-05-01T12:00:00Z', '2026-05-01T08:00:00Z'],
  )
  // The instant it names no longer depends on where it is read.
  assert.equal(Date.parse(bare.fromDate), Date.UTC(2026, 3, 30, 3))

  // A time that states its zone keeps it, and a day has none to state.
  assert.equal(at({ fromdate: '2026-04-30T03:00:00Z' }).fromDate, '2026-04-30T03:00:00Z')
  assert.equal(at({ fromdate: '2026-04-30T05:00:00+02:00' }).fromDate, '2026-04-30T05:00:00+02:00')
  assert.equal(at({ fromdate: '2026-04-30T03:00:00.250' }).fromDate, '2026-04-30T03:00:00.250Z')
  assert.equal(at({ fromdate: '2026-04-30' }).fromDate, '2026-04-30')
})

test('a list that gives no alert is reported, with what its first feature held', () => {
  // `iscurrent` has arrived as `true` and as `'true'`. A third spelling drops
  // every feature at the first filter, and the snapshot is published as written:
  // an empty one is an empty disaster layer and every narration pruned.
  const respelled = { ...validFeature, properties: { ...validFeature.properties, iscurrent: 'True' } }
  const collection = { type: 'FeatureCollection', features: [respelled, respelled] }
  const alerts = collectionToAlerts(collection, FIXTURE_NOW)
  assert.deepEqual(alerts, [])
  assert.equal(
    emptyListReport(collection, alerts),
    '2 features and no usable alert; the first has iscurrent="True" eventtype="EQ" alertlevel="Red" ' +
      'eventid=1234567 datemodified="2026-05-01T08:00:00" geometry="Point"',
  )
  assert.equal(emptyListReport({ type: 'FeatureCollection', features: [] }, []), 'the list held no features')

  const good = { type: 'FeatureCollection', features: [validFeature] }
  assert.equal(emptyListReport(good, collectionToAlerts(good, FIXTURE_NOW)), null, 'a list with an alert in it is written')
})

test('featureToDetail parses non-zero string-typed population fields', () => {
  const feature = {
    type: 'Feature',
    properties: { earthquakedetails: { rapidpop: '12400000', shakepop: '5200000' } },
  }
  assert.deepEqual(featureToDetail(feature), {
    criticalPopulation: 5_200_000,
    criticalClause: 'felt strong shaking',
    widerPopulation: 12_400_000,
    widerClause: 'in the wider affected area',
  })
})

test('featureToDetail treats zero / empty / missing as null so the row hides', () => {
  // Low-tier earthquakes typically publish "0" or "" — surfacing "0 people
  // affected" would be misleading; null lets the sheet hide the row.
  assert.deepEqual(
    featureToDetail({
      type: 'Feature',
      properties: { earthquakedetails: { rapidpop: '0', shakepop: '' } },
    }),
    {
      criticalPopulation: null,
      criticalClause: 'felt strong shaking',
      widerPopulation: null,
      widerClause: 'in the wider affected area',
    },
  )

  // Missing block at all — non-EQ events, defensive default.
  assert.deepEqual(featureToDetail({ type: 'Feature', properties: {} }), {
    criticalPopulation: null,
    criticalClause: '',
    widerPopulation: null,
    widerClause: '',
  })
})

test('readImpactScalar walks deeply nested model output to find a named scalar', () => {
  // The TC `getimpact` response is generic-model output — recurse generically
  // and stop at the first match. Returns null on missing/non-positive values.
  const impact = {
    datums: [
      {
        datum: [
          { scalars: { scalar: [{ name: 'POP_AFFECTED', value: '4500000' }] } },
        ],
      },
    ],
  }
  assert.equal(readImpactScalar(impact, 'POP_AFFECTED'), 4_500_000)
  assert.equal(readImpactScalar(impact, 'NOT_THERE'), null)
  assert.equal(readImpactScalar({ name: 'POP_AFFECTED', value: 0 }, 'POP_AFFECTED'), null)
  assert.equal(readImpactScalar(null, 'POP_AFFECTED'), null)
})

test('every date an alert carries is one the app will take', () => {
  // The app tests `fromDate` and `modifiedDate` in every alert and takes the
  // list whole or not at all, so one alert published with `fromDate: ''` costs
  // every installed app the disaster layer. Any string used to pass.
  const withDates = (dates) => ({ ...validFeature, properties: { ...validFeature.properties, ...dates } })
  const tally = {}
  const out = collectionToAlerts(
    {
      type: 'FeatureCollection',
      features: [
        withDates({ eventid: 1, fromdate: undefined }),
        withDates({ eventid: 2, fromdate: '' }),
        withDates({ eventid: 3, fromdate: '30 Apr 2026' }),
        withDates({ eventid: 4, todate: 'ongoing', datemodified: 'yesterday' }),
        withDates({ eventid: 5, todate: '2026-05-01T12:00:00' }),
      ],
    },
    FIXTURE_NOW,
    tally,
  )
  assert.deepEqual(
    out.map((a) => [a.eventid, a.fromDate, a.toDate, a.modifiedDate]),
    [
      // No end that can be read is no end; no modification time is the start.
      ['4', '2026-04-30T03:00:00Z', null, '2026-04-30T03:00:00Z'],
      ['5', '2026-04-30T03:00:00Z', '2026-05-01T12:00:00Z', '2026-05-01T08:00:00Z'],
    ],
  )
  assert.deepEqual(tally, { undated: 3 }, 'an alert with no start it can state is dropped, and counted')
})

test("the desk's narratives go back on the alerts they were written for", () => {
  // The fetcher writes alerts fresh and the narrator adds `narrative` four
  // stages later. If it never runs, the build publishes what the fetcher wrote.
  const collection = {
    type: 'FeatureCollection',
    features: [
      { ...validFeature, properties: { ...validFeature.properties, eventtype: 'TC', eventid: 1001335 } },
      validFeature,
    ],
  }
  const alerts = collectionToAlerts(collection, FIXTURE_NOW)
  const narrations = {
    'TC:1001335': { fingerprint: 'a1', narrative: 'Simon bears on Mexico.', generatedAt: '2026-10-09T05:11:20.000Z' },
    'EQ:1234567': { fingerprint: 'b2', narrative: '' },
    'EQ:7654321': { fingerprint: 'c3', narrative: 'An alert that has left the feed.' },
  }
  assert.equal(carryNarratives(alerts, narrations), 1)
  assert.equal(alerts[0].narrative, 'Simon bears on Mexico.')
  assert.equal(Object.keys(alerts[0]).at(-1), 'narrative', 'where the narrator puts it, so the bytes agree')
  assert.equal('narrative' in alerts[1], false, 'an alert nobody has written about gets no key')

  // No cache yet, or one that did not parse: the alerts go out as they are.
  assert.equal(carryNarratives(collectionToAlerts(collection, FIXTURE_NOW), null), 0)
})

test("the details are filed under each alert's key, in the alerts' order", () => {
  // Six are fetched at a time and a cyclone takes three requests to an
  // earthquake's one, so the answers never come back in the list's order. The
  // object's keys did, and the file is published under a stamp that holds only
  // while its bytes do. The pool now hands each detail back at its alert's
  // position; this is what turns those positions into the published keys.
  const alerts = [
    { eventtype: 'EQ', eventid: '1570274' },
    { eventtype: 'TC', eventid: '1001335' },
    { eventtype: 'EQ', eventid: '1570261' },
    { eventtype: 'EQ', eventid: '1570260' },
  ]
  const details = detailsInAlertOrder(alerts, [{ for: 'a' }, { for: 'b' }, undefined, { for: 'd' }])
  assert.deepEqual(Object.keys(details), ['EQ:1570274', 'TC:1001335', 'EQ:1570260'], 'and one that failed has no entry')
  assert.deepEqual(details[detailKey(alerts[3])], { for: 'd' })
})
