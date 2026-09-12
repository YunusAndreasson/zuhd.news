import type { MarketSignal } from '@shared/market-signals';
import type { Chokepoint, GdacsAlert } from '@shared/types';
import type { SwipeCard } from '../lib/cards/rank';
import type { GraphCard, ReadingCard } from '../lib/cards/types';
import type { RiverArticle } from '../lib/news-order';
import {
  buildNowSurfaces,
  coverageRanks,
  HAZARD_MAX_AGE_DAYS,
  NOW_LIMIT,
  STRIP_SLOTS,
} from '../lib/now';

const NOW = Date.parse('2026-09-12T09:00:00Z');
const DAY = 86_400_000;

function reading(id: string, extra: Partial<ReadingCard> = {}): GraphCard {
  return {
    id,
    kind: 'reading',
    kicker: `${id} desk`,
    title: `${id} title`,
    reading: '100',
    why: `${id} explained`,
    series: { values: [1, 2], periods: ['p0', 'p1'], label: id },
    ...extra,
  };
}

function chokepoint(id: string, lat: number, lng: number): Chokepoint {
  return {
    id,
    name: id,
    blurb: '',
    lat,
    lng,
    topicTags: [],
    primaryField: 'n_total',
    last7Avg: {},
    baseline90Avg: {},
    delta7vs90: {},
    series: { periods: [], total: [] },
    asOf: '2026-09-10',
  };
}

function signal(id: string, extra: Partial<MarketSignal> = {}): MarketSignal {
  return {
    id,
    eventId: `${id}:evt`,
    revision: 'r1',
    title: id,
    sourceLabel: 'Market data',
    asOf: '2026-09-11',
    pattern: {
      kind: 'streak',
      sessions: 4,
      changePct: -4.8,
      direction: -1,
      score: 2,
      startDate: '2026-09-07',
      endDate: '2026-09-11',
    },
    series: { values: [1, 2], dates: ['2026-09-10', '2026-09-11'] },
    facts: '',
    commentary: '',
    citations: [],
    ...extra,
  };
}

function alert(id: string, extra: Partial<GdacsAlert> = {}): GdacsAlert {
  return {
    eventid: id,
    eventtype: 'TC',
    alertlevel: 'Red',
    name: `Cyclone ${id}`,
    country: 'Philippines',
    iso3: 'PHL',
    affectedCountries: [],
    lat: 14.6,
    lng: 121,
    fromDate: '2026-09-10T00:00:00Z',
    toDate: null,
    modifiedDate: '2026-09-11T00:00:00Z',
    severityText: '',
    severityValue: null,
    severityUnit: '',
    description: '',
    source: 'GDACS',
    reportUrl: '',
    ...extra,
  };
}

function base(over: Partial<Parameters<typeof buildNowSurfaces>[0]> = {}) {
  return buildNowSurfaces({
    ranked: [],
    chokepoints: [],
    signals: [],
    gdacsAlerts: [],
    now: NOW,
    ...over,
  });
}

describe('buildNowSurfaces — the strip', () => {
  it('takes the first three of the ranked order, unchanged', () => {
    const ranked: SwipeCard[] = ['a', 'b', 'c', 'd'].map((id) => reading(id));
    const { strip } = base({ ranked });
    expect(strip).toHaveLength(STRIP_SLOTS);
    expect(strip.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('is short rather than padded when there are fewer instruments', () => {
    const { strip } = base({ ranked: [reading('only')] });
    expect(strip).toHaveLength(1);
  });

  it('labels a slot with the kicker — the subject — not the title', () => {
    const { strip } = base({ ranked: [reading('bist', { kicker: 'Borsa İstanbul' })] });
    expect(strip[0]?.label).toBe('Borsa İstanbul');
  });

  it('falls back to the title when a card has no kicker', () => {
    const { strip } = base({ ranked: [reading('x', { kicker: undefined })] });
    expect(strip[0]?.label).toBe('x title');
  });
});

describe('buildNowSurfaces — placement', () => {
  it('locates a strait card from the chokepoint payload', () => {
    const { strip } = base({
      ranked: [reading('strait-hormuz')],
      chokepoints: [chokepoint('hormuz', 26.297, 56.86)],
    });
    expect(strip[0]?.coords).toEqual([26.297, 56.86]);
  });

  it('locates a market signal from its own coordinates', () => {
    const { strip } = base({
      ranked: [reading('market-signal:mkt:bist')],
      signals: [signal('mkt:bist', { lat: 41.0082, lng: 28.9784 })],
    });
    expect(strip[0]?.coords).toEqual([41.0082, 28.9784]);
  });

  it('falls back to the country centroid while the pipeline lacks coordinates', () => {
    const { strip } = base({
      ranked: [reading('market-signal:mkt:bist')],
      signals: [signal('mkt:bist', { country: 'TR' })],
      countryCentroid: (iso2) => (iso2 === 'TR' ? [39, 35] : null),
    });
    expect(strip[0]?.coords).toEqual([39, 35]);
  });

  it('gives a placeless instrument no coordinates rather than a wrong one', () => {
    const { strip } = base({ ranked: [reading('nisab')] });
    expect(strip[0]?.coords).toBeNull();
  });

  it('gives a signal with neither coordinates nor country no mark', () => {
    const { strip } = base({
      ranked: [reading('market-signal:sp500')],
      signals: [signal('sp500')],
    });
    expect(strip[0]?.coords).toBeNull();
  });
});

describe('buildNowSurfaces — the block', () => {
  it('never repeats a fact the strip already prints', () => {
    const ranked: SwipeCard[] = ['a', 'b', 'c'].map((id) => reading(id, { lead: true }));
    const { strip, now } = base({ ranked });
    expect(strip.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(now).toHaveLength(0);
  });

  it('admits a gated instrument the strip had no room for', () => {
    const ranked: SwipeCard[] = ['a', 'b', 'c', 'd'].map((id) => reading(id, { lead: true }));
    const { now } = base({ ranked });
    expect(now.map((n) => n.id)).toEqual(['d']);
    expect(now[0]?.kind).toBe('instrument');
  });

  it('excludes an ungated instrument — a card must have changed, not merely rank', () => {
    const ranked: SwipeCard[] = ['a', 'b', 'c', 'd'].map((id) => reading(id));
    expect(base({ ranked }).now).toHaveLength(0);
  });

  it('is empty on a quiet day rather than padded', () => {
    expect(base().now).toEqual([]);
  });

  it('admits a Red alert', () => {
    const { now } = base({ gdacsAlerts: [alert('1')] });
    expect(now).toHaveLength(1);
    expect(now[0]?.kind).toBe('hazard');
    expect(now[0]?.gdacsEventId).toBe('1');
    expect(now[0]?.coords).toEqual([14.6, 121]);
  });

  it('refuses an Orange alert — severity stays single-tier', () => {
    expect(base({ gdacsAlerts: [alert('1', { alertlevel: 'Orange' })] }).now).toHaveLength(0);
  });

  it('refuses a Red alert that has aged out', () => {
    const stale = new Date(NOW - (HAZARD_MAX_AGE_DAYS + 1) * DAY).toISOString();
    expect(base({ gdacsAlerts: [alert('1', { modifiedDate: stale })] }).now).toHaveLength(0);
  });

  it('orders newest first across kinds', () => {
    const ranked: SwipeCard[] = [
      reading('s1'),
      reading('s2'),
      reading('s3'),
      reading('old', { lead: true, asOf: '2026-09-08' }),
      reading('new', { lead: true, asOf: '2026-09-11' }),
    ];
    const { now } = base({
      ranked,
      gdacsAlerts: [alert('mid', { modifiedDate: '2026-09-10T00:00:00Z' })],
    });
    expect(now.map((n) => n.id)).toEqual(['new', 'gdacs:TC:mid', 'old']);
  });

  it('caps the block so it cannot become a second river', () => {
    const ranked: SwipeCard[] = Array.from({ length: 3 + NOW_LIMIT + 2 }, (_, i) =>
      reading(`c${i}`, { lead: true, asOf: '2026-09-11' }),
    );
    expect(base({ ranked }).now).toHaveLength(NOW_LIMIT);
  });
});

describe('coverageRanks', () => {
  const story = (slug: string, eventCoverage: number | null): RiverArticle =>
    ({
      slug,
      title: slug,
      date: '2026-09-12',
      addedAt: 1,
      source: null,
      sourceUrl: null,
      sources: [],
      concepts: [],
      eventCoverage,
      location: null,
      lat: null,
      lng: null,
      sentences: [],
      category: 'politics',
    }) as RiverArticle;

  it('ranks by position among the stories that publish a figure', () => {
    const ranks = coverageRanks([story('a', 1), story('b', 5), story('c', 9)]);
    expect(ranks.get('a')).toBe(0);
    expect(ranks.get('b')).toBe(0.5);
    expect(ranks.get('c')).toBe(1);
  });

  it('omits a story with no figure rather than ranking it lowest', () => {
    const ranks = coverageRanks([story('a', 4), story('b', null), story('c', 0)]);
    expect(ranks.has('b')).toBe(false);
    expect(ranks.has('c')).toBe(false);
    expect(ranks.get('a')).toBe(1);
  });

  it('is not distorted by one absurd value', () => {
    // The corpus holds figures like 157957, which is not a number of outlets.
    // A percentile cannot be dragged by it; a log curve could.
    const ranks = coverageRanks([story('a', 3), story('b', 5), story('c', 7), story('d', 157957)]);
    expect(ranks.get('b')).toBeCloseTo(0.33, 2);
    expect(ranks.get('c')).toBeCloseTo(0.67, 2);
  });

  it('returns an empty map when nothing publishes a figure', () => {
    expect(coverageRanks([story('a', null)]).size).toBe(0);
  });

  it('gives a lone figure the top rank rather than dividing by zero', () => {
    expect(coverageRanks([story('a', 12)]).get('a')).toBe(1);
  });
});
