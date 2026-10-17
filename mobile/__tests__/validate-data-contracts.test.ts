import {
  isChokepointSnapshot,
  isConflictSnapshot,
  isFeedResponse,
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
  it('accepts a finite briefing duration and rejects unusable timeline metadata', () => {
    const feed = {
      generated: '2026-09-01T08:21:00Z',
      categories: {},
      briefing: { date: '2026-09-01', available: true, duration: 745 },
    };
    expect(isFeedResponse(feed)).toBe(true);
    expect(isFeedResponse({ ...feed, briefing: { ...feed.briefing, duration: 0 } })).toBe(false);
    expect(isFeedResponse({ ...feed, briefing: { ...feed.briefing, duration: Number.NaN } })).toBe(
      false,
    );
  });

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
    // Polymarket's day change is a number, absent, or — for a market with no
    // day-old price — null. Reading null as malformed dropped every market.
    expect(isTrendsSnapshot({ ...valid, indicators: [{ ...indicator, change24h: -10 }] })).toBe(
      true,
    );
    expect(isTrendsSnapshot({ ...valid, indicators: [{ ...indicator, change24h: null }] })).toBe(
      true,
    );
    expect(isTrendsSnapshot({ ...valid, indicators: [{ ...indicator, change24h: 'x' }] })).toBe(
      false,
    );
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

it.each([
  { sources: [null] },
  { sources: [{ name: 'Outlet', country: 4 }] },
  { location: {} },
  { publishedAt: 'yesterday' },
])('rejects an article with unsafe nested display fields: %j', (change) => {
  const article = {
    slug: 'story',
    title: 'Title',
    date: '2026-09-01',
    addedAt: 1,
    sources: [],
    concepts: [],
    sentences: ['Body'],
    ...change,
  };
  expect(
    isFeedResponse({
      generated: '2026-09-01',
      categories: { politics: [article] },
      briefing: null,
    }),
  ).toBe(false);
});

describe('isFeedResponse prunes what it cannot read', () => {
  const good = {
    slug: 'good',
    title: 'Title',
    date: '2026-09-01',
    addedAt: 1,
    sources: [],
    concepts: [],
    sentences: ['Body'],
  };

  // Every installed app reads one file: a single bad article, or a category
  // added on the site, used to reject the feed for all of them at once.
  it('drops an unreadable article and keeps the rest', () => {
    const feed = {
      generated: '2026-09-01T08:21:00Z',
      categories: { politics: [good, { ...good, slug: 'bad', publishedAt: null }] },
      briefing: null,
    };
    expect(isFeedResponse(feed)).toBe(true);
    expect(feed.categories.politics.map((a) => a.slug)).toEqual(['good']);
  });

  it('drops a category this build does not know', () => {
    const feed: { generated: string; categories: Record<string, unknown[]>; briefing: null } = {
      generated: '2026-09-01T08:21:00Z',
      categories: { politics: [good], health: [{ ...good, slug: 'h' }] },
      briefing: null,
    };
    expect(isFeedResponse(feed)).toBe(true);
    expect(Object.keys(feed.categories)).toEqual(['politics']);
  });

  it('reads a missing briefing as none', () => {
    const feed: Record<string, unknown> = {
      generated: '2026-09-01T08:21:00Z',
      categories: { politics: [good] },
    };
    expect(isFeedResponse(feed)).toBe(true);
    expect(feed.briefing).toBeNull();
  });

  it('still rejects a feed with no readable article left', () => {
    expect(
      isFeedResponse({
        generated: '2026-09-01T08:21:00Z',
        categories: { politics: [{ ...good, title: 4 }], tech: [{ ...good, date: 'x' }] },
        briefing: null,
      }),
    ).toBe(false);
  });
});
