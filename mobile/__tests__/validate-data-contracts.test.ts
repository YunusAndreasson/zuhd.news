import {
  isChokepointSnapshot,
  isConflictSnapshot,
  isHeatmapResponse,
  isTrendsSnapshot,
} from '../lib/validate';

const indicator = {
  id: 'brent',
  label: 'Brent crude',
  source: 'fred',
  sourceLabel: 'FRED',
  cadence: 'daily',
  asOf: '2026-08-25',
  values: [80, 81],
  periods: ['Aug 24', 'Aug 25'],
};

describe('live panel data contracts', () => {
  it('validates indicator observation dates and scheduled-event fields', () => {
    const valid = {
      fetchedAt: '2026-09-01T08:16:00Z',
      asOf: '2026-09-01',
      indicators: [indicator],
      events: [
        {
          id: 'fomc-2026-09',
          title: 'Fed decision',
          institution: 'Federal Reserve',
          kind: 'central-bank',
          date: '2026-09-16',
        },
      ],
    };
    expect(isTrendsSnapshot(valid)).toBe(true);
    expect(isTrendsSnapshot({ ...valid, events: [{ ...valid.events[0], date: 'sometime' }] })).toBe(
      false,
    );
    expect(
      isTrendsSnapshot({
        ...valid,
        indicators: [{ ...indicator, values: [80], periods: ['Aug 24', 'Aug 25'] }],
      }),
    ).toBe(false);
  });

  it('rejects a shipping chart whose dates and measurements do not align', () => {
    const chokepoint = {
      id: 'kerch',
      name: 'Kerch Strait',
      blurb: 'Sea of Azov access.',
      lat: 45,
      lng: 36,
      topicTags: [],
      primaryField: 'n_total',
      last7Avg: { n_total: 1 },
      baseline90Avg: { n_total: 8 },
      delta7vs90: { n_total: -0.875 },
      series: { periods: ['Aug 22', 'Aug 23'], total: [8] },
      asOf: '2026-08-23',
    };
    expect(
      isChokepointSnapshot({
        generated: '2026-09-01T08:16:00Z',
        chokepoints: [chokepoint],
      }),
    ).toBe(false);
  });

  it('rejects non-finite map points and conflict events outside their declared window', () => {
    expect(
      isHeatmapResponse({
        generated: '2026-09-01T08:21:00Z',
        points: [{ lat: 10, lng: 20, c: Number.NaN, t: 1, l: 'x' }],
      }),
    ).toBe(false);

    const event = {
      id: 'event-1',
      eventDate: '2026-08-01',
      family: 'kinetic',
      subEvent: 'armed_clash',
      actor1: 'A',
      country: 'Test',
      iso3: 'TST',
      location: 'Place',
      lat: 1,
      lng: 2,
      fatalities: 0,
      notes: 'Reported clash.',
      source: 'UCDP',
    };
    expect(
      isConflictSnapshot({
        generated: '2026-09-01T04:18:00Z',
        windowStart: '2026-07-25',
        windowEnd: '2026-07-31',
        events: [event],
      }),
    ).toBe(false);
  });
});
