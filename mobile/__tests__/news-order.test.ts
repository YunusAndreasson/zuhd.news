import type { Article, Category } from '@shared/types';
import { CATEGORIES } from '../constants/theme';
import { articleTime, eventTime } from '../lib/article-utils';
import { buildStoryRows } from '../lib/map-feed';
import {
  orderNewsRiver,
  RIVER_WINDOW_MS,
  RUN_GAP_MS,
  type RiverArticle,
  recentRiver,
} from '../lib/news-order';

function makeArticle(overrides: Partial<RiverArticle> = {}): RiverArticle {
  return {
    slug: 'test',
    title: 'Test',
    date: new Date(1000).toISOString(),
    addedAt: 1000,
    source: null,
    sourceUrl: null,
    sources: [],
    concepts: [],
    eventCoverage: null,
    location: null,
    lat: null,
    lng: null,
    sentences: ['A test sentence.'],
    category: 'politics',
    ...overrides,
  };
}

const emptyGrouped = (): Record<Category, Article[]> => ({
  politics: [],
  economy: [],
  science: [],
  tech: [],
});

describe('orderNewsRiver', () => {
  it('puts the newest story first whatever its category', () => {
    const grouped = emptyGrouped();
    grouped.science = [makeArticle({ slug: 'old', eventAt: 1000, eventCoverage: 294 })];
    grouped.tech = [makeArticle({ slug: 'new', eventAt: 3000 })];
    grouped.politics = [makeArticle({ slug: 'middle', eventAt: 2000, eventCoverage: 12 })];
    expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual(['new', 'middle', 'old']);
    expect(orderNewsRiver(grouped).map((a) => a.category)).toEqual(['tech', 'politics', 'science']);
  });

  it('interleaves categories by time rather than banding them', () => {
    const grouped = emptyGrouped();
    grouped.politics = [1000, 4000, 3000, 2000].map((eventAt) =>
      makeArticle({ slug: `p-${eventAt}`, eventAt }),
    );
    grouped.economy = [makeArticle({ slug: 'e-2500', eventAt: 2500 })];
    expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual([
      'p-4000',
      'p-3000',
      'e-2500',
      'p-2000',
      'p-1000',
    ]);
  });

  it('orders a run by event time, then date, then addedAt', () => {
    const grouped = emptyGrouped();
    grouped.tech = [
      makeArticle({ slug: 'event', eventAt: 5000, addedAt: 9000 }),
      makeArticle({ slug: 'date', date: new Date(4000).toISOString(), addedAt: 10000 }),
      makeArticle({ slug: 'fallback', date: 'invalid', addedAt: 3000 }),
    ];
    expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual(['event', 'date', 'fallback']);
  });

  it('orders timestamp ties deterministically by slug', () => {
    const grouped = emptyGrouped();
    grouped.politics = [makeArticle({ slug: 'b' }), makeArticle({ slug: 'a' })];
    expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual(['a', 'b']);
    grouped.politics.reverse();
    expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual(['a', 'b']);
  });

  it('keeps all 40 stories in descending time without mutating the input', () => {
    const grouped = emptyGrouped();
    for (const [categoryIndex, category] of (Object.keys(grouped) as Category[]).entries()) {
      grouped[category] = Array.from({ length: 10 }, (_, i) =>
        makeArticle({
          slug: `${category}-${i}`,
          eventAt: (i * 4 + categoryIndex + 1) * 1000,
          eventCoverage: 100 - i,
        }),
      );
    }
    const before = JSON.stringify(grouped);
    const out = orderNewsRiver(grouped);
    expect(out).toHaveLength(40);
    expect(new Set(out.map((a) => a.slug)).size).toBe(40);
    // One run (one addedAt), so newest event first throughout.
    const times = out.map(eventTime);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // Each story keeps the category it was filed under, for its kicker.
    for (const category of CATEGORIES) {
      expect(out.filter((a) => a.category === category)).toHaveLength(10);
      expect(
        out.filter((a) => a.slug.startsWith(`${category}-`)).every((a) => a.category === category),
      ).toBe(true);
    }
    expect(JSON.stringify(grouped)).toBe(before);
  });

  it('handles an empty feed', () => {
    expect(orderNewsRiver(emptyGrouped())).toEqual([]);
  });

  // The user's report of 2026-09-26: new stories did not arrive in order.
  // Ordered by when each story happened, the 10:01 cycle's pick from the day
  // before went 36 places deep, behind stories the reader had read.
  describe('the most reported first, inside its run', () => {
    // The 18:12 run of 2026-09-26, reduced: reports where the API measured
    // them, and the outlets the desk cited.
    const src = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        name: `s${i}`,
        url: '',
        country: null,
        sentiment: null,
      }));
    const run = (slug: string, eventCoverage: number | null, sources: number, eventAt = 1000) =>
      makeArticle({ slug, eventCoverage, sources: src(sources), eventAt, publishedAt: 5000 });

    it('leads with the story past the bar, then the most widely sourced', () => {
      const grouped = emptyGrouped();
      grouped.politics = [
        run('one-source', null, 1, 4000),
        run('four-sources', 227, 4),
        run('over-the-bar', 830, 6),
        run('five-sources', 165, 5),
      ];
      expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual([
        'over-the-bar',
        'five-sources',
        'four-sources',
        'one-source',
      ]);
    });

    it('does not rank below the bar by a count most stories do not have', () => {
      // Unmeasured is not quiet: 300 reports does not outrank no figure.
      const grouped = emptyGrouped();
      grouped.tech = [run('measured', 300, 2), run('unmeasured', null, 2, 2000)];
      expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual(['unmeasured', 'measured']);
    });

    it('falls back to the newest event when reach is equal', () => {
      const grouped = emptyGrouped();
      grouped.tech = [run('older', null, 1, 1000), run('newer', null, 1, 3000)];
      expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual(['newer', 'older']);
    });

    it('never lifts a story out of its run', () => {
      const grouped = emptyGrouped();
      grouped.politics = [
        makeArticle({
          slug: 'hot-earlier-run',
          eventCoverage: 900,
          sources: src(6),
          publishedAt: 1000,
        }),
        makeArticle({ slug: 'quiet-newer-run', sources: src(1), publishedAt: 5 * RUN_GAP_MS }),
      ];
      expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual([
        'quiet-newer-run',
        'hot-earlier-run',
      ]);
    });
  });

  describe('by when zuhd published', () => {
    const MIN = 60_000;
    const HOUR = 60 * MIN;
    const cycle10 = Date.parse('2026-09-26T10:12:57Z');
    const cycle05 = Date.parse('2026-09-26T05:13:40Z');
    const story = (slug: string, publishedAt: number, eventAt: number) =>
      makeArticle({ slug, publishedAt, eventAt, addedAt: publishedAt });

    it('puts what arrived first, even when it happened earlier', () => {
      const grouped = emptyGrouped();
      grouped.politics = [story('houthi-drones', cycle05, cycle05 - 4 * HOUR)];
      grouped.economy = [story('eu-peace-facility', cycle10, cycle10 - 21 * HOUR)];
      grouped.science = [story('bangkok-floods', cycle10, cycle10 - 2 * HOUR)];
      expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual([
        'bangkok-floods',
        'eu-peace-facility',
        'houthi-drones',
      ]);
    });

    it('gives a run of mtimes one time, and orders it by event', () => {
      // No publishedAt: a payload from before it, whose times are file
      // mtimes spread over the minutes a cycle takes to write.
      const grouped = emptyGrouped();
      grouped.tech = [
        makeArticle({
          slug: 'written-last',
          addedAt: cycle10 + 2 * MIN,
          eventAt: cycle10 - 9 * HOUR,
        }),
        makeArticle({ slug: 'written-first', addedAt: cycle10, eventAt: cycle10 - HOUR }),
        makeArticle({ slug: 'earlier-run', addedAt: cycle05, eventAt: cycle05 - HOUR }),
      ];
      const out = orderNewsRiver(grouped);
      expect(out.map((a) => a.slug)).toEqual(['written-first', 'written-last', 'earlier-run']);
      expect(out.map(articleTime)).toEqual([cycle10 + 2 * MIN, cycle10 + 2 * MIN, cycle05]);
    });

    it('chains a run across the minutes, and breaks it at a gap', () => {
      const grouped = emptyGrouped();
      grouped.tech = [0, 20, 40, 40 + RUN_GAP_MS / MIN + 1].map((m) =>
        makeArticle({ slug: `t${m}`, addedAt: cycle05 + m * MIN }),
      );
      const runs = new Set(orderNewsRiver(grouped).map(articleTime));
      expect(runs.size).toBe(2);
    });
  });
});

describe('recentRiver', () => {
  const now = Date.parse('2026-09-13T12:00:00Z');
  const hoursAgo = (h: number) => now - h * 3_600_000;
  const at = (slug: string, t: number) => makeArticle({ slug, publishedAt: t, addedAt: t });

  it('keeps the last 24 hours and drops what is older', () => {
    const river = [at('fresh', hoursAgo(1)), at('edge', hoursAgo(24)), at('stale', hoursAgo(25))];
    expect(recentRiver(river, now).map((a) => a.slug)).toEqual(['fresh', 'edge']);
  });

  it('anchors on the newest story when the pipeline has stalled', () => {
    const river = [
      at('last', hoursAgo(50)),
      at('same-day', hoursAgo(70)),
      at('older', hoursAgo(80)),
    ];
    expect(recentRiver(river, now).map((a) => a.slug)).toEqual(['last', 'same-day']);
  });

  it('finds the newest time across categories', () => {
    const grouped = emptyGrouped();
    grouped.politics = [at('stale-politics', hoursAgo(40))];
    grouped.economy = [at('recent-economy', hoursAgo(2))];
    grouped.tech = [at('fresh-tech', hoursAgo(1))];
    expect(recentRiver(orderNewsRiver(grouped), now).map((a) => a.slug)).toEqual([
      'fresh-tech',
      'recent-economy',
    ]);
    grouped.politics = [at('too-old', hoursAgo(80))];
    grouped.economy = [at('same-day', hoursAgo(70))];
    grouped.tech = [at('latest', hoursAgo(50))];
    expect(recentRiver(orderNewsRiver(grouped), now).map((a) => a.slug)).toEqual([
      'latest',
      'same-day',
    ]);
  });

  it('keeps a story the reader asked for, however old', () => {
    const river = [at('fresh', hoursAgo(2)), at('saved', hoursAgo(90))];
    expect(recentRiver(river, now, new Set(['saved'])).map((a) => a.slug)).toEqual([
      'fresh',
      'saved',
    ]);
  });

  it('is empty only when the river is', () => {
    expect(recentRiver([], now)).toEqual([]);
    expect(RIVER_WINDOW_MS).toBe(86_400_000);
  });
});

describe('buildStoryRows — new and earlier', () => {
  const NOW = 100 * RIVER_WINDOW_MS;
  const HOUR = RIVER_WINDOW_MS / 24;
  const at = (slug: string, hoursAgo: number) =>
    makeArticle({ slug, publishedAt: NOW - hoursAgo * HOUR });

  it('marks the first story the reader already had as earlier', () => {
    const river = [at('n1', 1), at('n2', 2), at('old', 5)];
    const rows = buildStoryRows({ river, fresh: new Set(['n1', 'n2']) });
    expect(rows.map((r) => r.mark)).toEqual(['new', 'new', 'earlier']);
  });

  it('marks nothing new when every story is: there is nothing it is new beside', () => {
    const river = [at('a', 1), at('b', 2), at('c', 3)];
    const rows = buildStoryRows({ river, fresh: new Set(['a', 'b', 'c']) });
    expect(rows.map((r) => r.mark)).toEqual([null, null, null]);
    expect(rows.some((r) => r.fresh)).toBe(false);
  });
});
