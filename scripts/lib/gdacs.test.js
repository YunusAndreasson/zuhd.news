// Parser invariants for GDACS feed → snapshot conversion. Pinned bugs:
//   • polygon features used to leak through and crash mobile projection
//   • iscurrent=false events used to render after they'd already ended
//   • auto-caption descriptions used to duplicate the sheet header verbatim
//   • alerts older than 30 days used to accumulate into a graveyard layer
//
// Run with: node --test scripts/lib/gdacs.test.js

import test from 'node:test'
import assert from 'node:assert/strict'
import { collectionToAlerts, featureToDetail, isGdacsFeatureCollection, readImpactScalar } from './gdacs.js'

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
const FIXTURE_NOW = Date.parse('2026-05-02T00:00:00') + 86_400_000

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
  assert.equal(out[0].modifiedDate, '2026-05-01T08:00:00')
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
