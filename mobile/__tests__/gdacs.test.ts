import {
  alertAgeDays,
  collectionToAlerts,
  featureToDetail,
  type GdacsFeatureCollection,
  isGdacsDetailFeature,
  isGdacsFeatureCollection,
} from '../lib/gdacs';

const validFeature = {
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [37.0, 35.0] as [number, number] },
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
};

describe('isGdacsFeatureCollection', () => {
  it('accepts a well-formed collection', () => {
    expect(isGdacsFeatureCollection({ type: 'FeatureCollection', features: [] })).toBe(true);
    expect(
      isGdacsFeatureCollection({ type: 'FeatureCollection', features: [validFeature] }),
    ).toBe(true);
  });

  it('rejects non-objects, wrong types, missing features', () => {
    expect(isGdacsFeatureCollection(null)).toBe(false);
    expect(isGdacsFeatureCollection({})).toBe(false);
    expect(isGdacsFeatureCollection({ type: 'Other', features: [] })).toBe(false);
    expect(isGdacsFeatureCollection({ type: 'FeatureCollection' })).toBe(false);
  });
});

// Anchor `now` to a fixed point relative to the fixture so the
// 30-day-age cliff inside collectionToAlerts is deterministic regardless
// of when the suite runs.
const FIXTURE_NOW = Date.parse('2026-05-02T00:00:00') + 86_400_000; // 1 day after datemodified

describe('collectionToAlerts', () => {
  it('flattens valid features and skips polygon / non-current ones', () => {
    const collection: GdacsFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        validFeature,
        // Concluded event — dropped via iscurrent gate
        { ...validFeature, properties: { ...validFeature.properties, iscurrent: false } },
        // Polygon geometry — dropped at feature-validity gate
        {
          ...validFeature,
          geometry: { type: 'Polygon' as unknown as 'Point', coordinates: [] as unknown as [number, number] },
        },
      ],
    };
    const out = collectionToAlerts(collection, FIXTURE_NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      eventid: '1234567',
      eventtype: 'EQ',
      alertlevel: 'Red',
      country: 'Japan',
      lat: 35,
      lng: 37,
      severityText: 'Magnitude 7.4M, Depth:23km',
      reportUrl: 'https://www.gdacs.org/report.aspx?eventid=1234567',
      affectedCountries: ['Japan'],
    });
    expect(out[0]?.description).toMatch(/magnitude 7\.4 earthquake/i);
    expect(out[0]?.description).not.toMatch(/<p>/);
  });

  it('keeps Green alerts (rendered at the ambient tier) and drops unknown event types', () => {
    const collection: GdacsFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { ...validFeature, properties: { ...validFeature.properties, alertlevel: 'Green' } },
        { ...validFeature, properties: { ...validFeature.properties, eventtype: 'XX' } },
      ],
    };
    const out = collectionToAlerts(collection, FIXTURE_NOW);
    expect(out).toHaveLength(1);
    expect(out[0]?.alertlevel).toBe('Green');
  });

  it('rejects unrecognized alert levels', () => {
    const collection: GdacsFeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { ...validFeature, properties: { ...validFeature.properties, alertlevel: 'Yellow' } },
      ],
    };
    expect(collectionToAlerts(collection, FIXTURE_NOW)).toHaveLength(0);
  });

  it('exposes structured severity, source, and a substantive description', () => {
    const collection: GdacsFeatureCollection = {
      type: 'FeatureCollection',
      features: [{ ...validFeature, properties: { ...validFeature.properties, source: 'NEIC' } }],
    };
    const out = collectionToAlerts(collection, FIXTURE_NOW);
    expect(out[0]).toMatchObject({
      severityValue: 7.4,
      severityUnit: 'M',
      source: 'NEIC',
    });
    // Real narrative survives — only auto-captions are filtered.
    expect(out[0]?.description).toMatch(/magnitude 7\.4 earthquake/i);
  });

  it('drops auto-caption descriptions that just restate the header', () => {
    // GDACS publishes templated captions for low-impact events:
    //   "Green M 5 Earthquake in <region> at: <date>."
    // Every component is already in `name` + `severityText` + `fromDate`,
    // so the description is dropped to remove the visual repetition.
    const autoCaption = {
      ...validFeature,
      properties: {
        ...validFeature.properties,
        alertlevel: 'Green',
        htmldescription:
          'Green M 5 Earthquake in South Sandwich Islands Region at: 02 May 2026 10:31:40.',
      },
    };
    const out = collectionToAlerts(
      { type: 'FeatureCollection', features: [autoCaption] },
      FIXTURE_NOW,
    );
    expect(out[0]?.description).toBe('');
  });

  it('drops alerts older than 30 days', () => {
    // Long-running events (multi-month droughts, ongoing wildfires) keep
    // appearing on the GDACS feed forever. The 30-day cliff prevents the
    // map from accumulating stale markers.
    const old = {
      ...validFeature,
      properties: {
        ...validFeature.properties,
        datemodified: '2026-03-15T08:00:00', // ~48 days before FIXTURE_NOW
      },
    };
    const collection: GdacsFeatureCollection = {
      type: 'FeatureCollection',
      features: [old, validFeature],
    };
    const out = collectionToAlerts(collection, FIXTURE_NOW);
    expect(out).toHaveLength(1);
    expect(out[0]?.modifiedDate).toBe('2026-05-01T08:00:00');
  });
});

describe('featureToDetail', () => {
  it('parses non-zero string-typed population fields', () => {
    const feature = {
      type: 'Feature' as const,
      properties: {
        earthquakedetails: {
          rapidpop: '12400000',
          shakepop: '5200000',
        },
      },
    };
    expect(isGdacsDetailFeature(feature)).toBe(true);
    expect(featureToDetail(feature)).toEqual({
      affectedPopulation: 12_400_000,
      shakingPopulation: 5_200_000,
    });
  });

  it('treats zero / empty / missing as null so the sheet hides the row', () => {
    // Low-tier earthquakes typically publish "0" or "" in these fields.
    // Surfacing "0 people affected" as a stat would be misleading; the
    // formatter and parser cooperate to hide the row entirely.
    expect(
      featureToDetail({
        type: 'Feature',
        properties: { earthquakedetails: { rapidpop: '0', shakepop: '' } },
      }),
    ).toEqual({ affectedPopulation: null, shakingPopulation: null });

    // Missing block at all — non-EQ events, defensive default.
    expect(
      featureToDetail({ type: 'Feature', properties: {} }),
    ).toEqual({ affectedPopulation: null, shakingPopulation: null });
  });
});

describe('alertAgeDays', () => {
  it('returns 0 for unparsable timestamps', () => {
    const alert = collectionToAlerts(
      {
        type: 'FeatureCollection',
        features: [
          { ...validFeature, properties: { ...validFeature.properties, datemodified: 'nope' } },
        ],
      },
      FIXTURE_NOW,
    )[0];
    if (!alert) throw new Error('expected one alert');
    expect(alertAgeDays(alert, FIXTURE_NOW)).toBe(0);
  });

  it('returns days since modifiedDate', () => {
    const alert = collectionToAlerts(
      {
        type: 'FeatureCollection',
        features: [validFeature],
      },
      FIXTURE_NOW,
    )[0];
    if (!alert) throw new Error('expected one alert');
    const modified = Date.parse('2026-05-01T08:00:00');
    expect(alertAgeDays(alert, modified + 3 * 86_400_000)).toBeCloseTo(3, 0);
  });
});
