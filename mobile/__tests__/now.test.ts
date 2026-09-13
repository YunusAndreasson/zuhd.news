import type { MarketSignal } from '@shared/market-signals';
import type { Chokepoint, GdacsAlert } from '@shared/types';
import type { SwipeCard } from '../lib/cards/rank';
import type { CardDelta, GraphCard, ReadingCard } from '../lib/cards/types';
import type { RiverArticle } from '../lib/news-order';
import {
  buildNowSurfaces,
  coverageRanks,
  HAZARD_MAX_AGE_DAYS,
  NOW_LIMIT,
  rowKicker,
  stripLabel,
} from '../lib/now';

const NOW = Date.parse('2026-09-12T09:00:00Z');

function move(size: number | undefined, direction: 'up' | 'down' = 'down'): CardDelta {
  return { direction, magnitude: `${size}%`, valence: 'neutral', size };
}
const DAY = 86_400_000;

function reading(id: string, extra: Partial<ReadingCard> = {}): GraphCard {
  return {
    id,
    kind: 'reading',
    kicker: `${id} desk`,
    title: `${id} title`,
    reading: '100',
    delta: move(1),
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
  it('holds every reading that moved, not a fixed number of them', () => {
    const ranked: SwipeCard[] = ['a', 'b', 'c', 'd', 'e'].map((id) => reading(id));
    expect(base({ ranked }).strip.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('puts the largest move first, whichever way it went', () => {
    const ranked: SwipeCard[] = [
      reading('gold', { delta: move(0.8, 'up') }),
      reading('strait-hormuz', { delta: move(57) }),
      reading('fx-try', { delta: move(2.4, 'up') }),
      reading('market-signal:bist', { delta: move(4.8) }),
    ];
    expect(base({ ranked }).strip.map((s) => s.id)).toEqual([
      'strait-hormuz',
      'market-signal:bist',
      'fx-try',
      'gold',
    ]);
  });

  it('keeps the ranked order between equal moves', () => {
    const ranked: SwipeCard[] = ['b', 'a', 'c'].map((id) => reading(id, { delta: move(3) }));
    expect(base({ ranked }).strip.map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts a move with no percentage after every move with one', () => {
    const ranked: SwipeCard[] = [
      reading('points', { delta: move(undefined, 'up') }),
      reading('flat', { delta: move(0) }),
    ];
    expect(base({ ranked }).strip.map((s) => s.id)).toEqual(['flat', 'points']);
  });

  it('leaves out a reading with no move — there is nothing to glance at', () => {
    const { strip } = base({ ranked: [reading('nisab', { delta: undefined }), reading('only')] });
    expect(strip.map((s) => s.id)).toEqual(['only']);
  });

  it('labels a slot with what the number measures — the title, not the kicker', () => {
    // A kicker heads a title on a card; alone it is often a category or longer
    // than the thing it heads, and "AUSTRALIAN SECURITIES EXC…" named nothing.
    const { strip } = base({
      ranked: [
        reading('market-signal:asx', {
          kicker: 'Australian Securities Exchange',
          title: 'S&P/ASX 200',
        }),
      ],
    });
    expect(strip[0]?.label).toBe('S&P/ASX 200');
  });

  it('uses the title for a kickerless card too', () => {
    const { strip } = base({ ranked: [reading('x', { kicker: undefined })] });
    expect(strip[0]?.label).toBe('x title');
  });

  it('prints a strait on one line as its short form and keeps the full name to speak', () => {
    // A slot wrapped "STRAIT OF / HORMUZ" onto two lines, which made the whole
    // strip two caps lines tall for one long name.
    const { strip } = base({ ranked: [reading('strait-hormuz', { title: 'Strait of Hormuz' })] });
    expect(strip[0]?.short).toBe('Hormuz Str.');
    expect(strip[0]?.label).toBe('Strait of Hormuz');
  });
});

describe('stripLabel', () => {
  it('shortens both spellings of a strait and leaves everything else alone', () => {
    expect(stripLabel('Strait of Gibraltar')).toBe('Gibraltar Str.');
    expect(stripLabel('Kerch Strait')).toBe('Kerch Str.');
    expect(stripLabel('Bab el-Mandeb')).toBe('Bab el-Mandeb');
    expect(stripLabel('Suez Canal')).toBe('Suez Canal');
    expect(stripLabel('South African rand')).toBe('South African rand');
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
  it('holds no instrument, gated or not, moving or not — the sheet is for news', () => {
    const ranked: SwipeCard[] = [
      reading('moved', { lead: true }),
      reading('still', { lead: true, delta: undefined }),
      reading('quiet'),
    ];
    const { strip, now } = base({ ranked });
    expect(strip.map((s) => s.id)).toEqual(['moved', 'quiet']);
    expect(now).toHaveLength(0);
  });

  it('is empty on a quiet day rather than padded', () => {
    expect(base().now).toEqual([]);
  });

  it('admits a Red alert', () => {
    const { now } = base({ gdacsAlerts: [alert('1')] });
    expect(now).toHaveLength(1);
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

  it('orders newest first', () => {
    const { now } = base({
      gdacsAlerts: [
        alert('old', { modifiedDate: '2026-09-08T00:00:00Z' }),
        alert('new', { modifiedDate: '2026-09-11T00:00:00Z' }),
        alert('mid', { modifiedDate: '2026-09-10T00:00:00Z' }),
      ],
    });
    expect(now.map((n) => n.id)).toEqual(['gdacs:TC:new', 'gdacs:TC:mid', 'gdacs:TC:old']);
  });

  it('caps the block so it cannot become a second river', () => {
    const gdacsAlerts = Array.from({ length: NOW_LIMIT + 2 }, (_, i) => alert(`a${i}`));
    expect(base({ gdacsAlerts }).now).toHaveLength(NOW_LIMIT);
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

describe('buildNowSurfaces — what a slot and a row may say', () => {
  const belief = (id: string, extra: Partial<ReadingCard> = {}): SwipeCard =>
    ({
      ...reading(id, extra),
      kind: 'belief',
      kicker: 'what traders think',
    }) as unknown as SwipeCard;

  it('never gives a slot to a prediction market, whose subject is a question', () => {
    const ranked: SwipeCard[] = [
      belief('poly-ceasefire', { lead: true }),
      reading('a'),
      reading('b'),
      reading('c'),
    ];
    const { strip, now } = base({ ranked });
    expect(strip.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    // Nor a row in the news sheet: it rides the story it settles as an odds
    // chip, and the instruments sheet lists it in full.
    expect(now).toHaveLength(0);
  });

  it('names a strait row by its kind rather than calling it an instrument', () => {
    expect(rowKicker(reading('strait-kerch', { kicker: undefined }))).toBe('shipping');
  });
});
