import type { GdacsAlert } from '@shared/types';
import { alertAgeDays, parseSeverityHero } from '../lib/gdacs';

// Parser/feed tests live in `scripts/lib/gdacs.test.js` — that's where the
// raw-feed parsing now happens. Mobile only ships the snapshot consumer
// (validators in `lib/validate.ts`) and these display helpers.

const baseAlert: GdacsAlert = {
  eventid: '1',
  eventtype: 'EQ',
  alertlevel: 'Green',
  name: '',
  country: '',
  iso3: '',
  affectedCountries: [],
  lat: 0,
  lng: 0,
  fromDate: '',
  toDate: null,
  modifiedDate: '',
  severityText: '',
  severityValue: null,
  severityUnit: '',
  description: '',
  source: '',
  reportUrl: null,
};

describe('parseSeverityHero', () => {
  it('reduces EQ severityText to a focal "M X.X" + depth subtitle', () => {
    expect(
      parseSeverityHero({
        ...baseAlert,
        eventtype: 'EQ',
        severityText: 'Magnitude 7.4M, Depth:23km',
      }),
    ).toEqual({ focal: 'M 7.4', secondary: '23 km deep' });
  });

  // GDACS publishes depth to three decimals on most real events
  // ("Depth:182.779km"), which is false precision for a hypocentre estimate and
  // reads as noise next to a one-decimal magnitude.
  it('rounds a fractional depth to whole kilometres', () => {
    expect(
      parseSeverityHero({
        ...baseAlert,
        eventtype: 'EQ',
        severityText: 'Magnitude 5.1M, Depth:182.779km',
      }),
    ).toEqual({ focal: 'M 5.1', secondary: '183 km deep' });
  });

  it('reduces TC severityText to "<n> km/h" + tier word', () => {
    expect(
      parseSeverityHero({
        ...baseAlert,
        eventtype: 'TC',
        severityText: 'Tropical Storm wind speed of 95 km/h',
      }),
    ).toEqual({ focal: '95 km/h', secondary: 'tropical-storm strength' });
  });

  it('groups WF burn-area thousands and labels it', () => {
    expect(
      parseSeverityHero({
        ...baseAlert,
        eventtype: 'WF',
        severityText: 'Green impact for forestfire in 7559 ha',
      }),
    ).toEqual({ focal: '7,559 ha', secondary: 'burn area' });
  });

  it('falls back to raw severityText when no pattern matches', () => {
    // FL events often publish "Magnitude 0" — nothing parseable, never
    // silently hide. The eyebrow + raw text is honest about the data.
    const result = parseSeverityHero({
      ...baseAlert,
      eventtype: 'FL',
      severityText: 'Magnitude 0 ',
    });
    expect(result.focal).toContain('Magnitude 0');
    expect(result.secondary).toBe('');
  });

  it('returns the eyebrow label when severityText is empty', () => {
    expect(parseSeverityHero({ ...baseAlert, eventtype: 'VO' })).toEqual({
      focal: 'VOLCANO',
      secondary: '',
    });
  });
});

describe('alertAgeDays', () => {
  it('returns 0 for unparsable timestamps', () => {
    expect(alertAgeDays({ ...baseAlert, modifiedDate: 'nope' }, Date.now())).toBe(0);
  });

  it('returns days since modifiedDate', () => {
    const modified = '2026-05-01T08:00:00';
    const t = Date.parse(modified) + 3 * 86_400_000;
    expect(alertAgeDays({ ...baseAlert, modifiedDate: modified }, t)).toBeCloseTo(3, 0);
  });
});
