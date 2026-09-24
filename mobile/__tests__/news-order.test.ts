import type { Article, Category } from '@shared/types';
import { CATEGORIES } from '../constants/theme';
import { articleTime } from '../lib/article-utils';
import { buildStoryRows } from '../lib/map-feed';
import {
  leadWithTopStories,
  orderNewsRiver,
  RIVER_WINDOW_MS,
  type RiverArticle,
  recentRiver,
  TOP_STORIES,
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
    grouped.economy = [makeArticle({ slug: 'e-2500', eventAt: 2500, eventCoverage: 999 })];
    expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual([
      'p-4000',
      'p-3000',
      'e-2500',
      'p-2000',
      'p-1000',
    ]);
  });

  it('uses event time, then date, then addedAt for legacy stories', () => {
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
    grouped.politics = [makeArticle({ slug: 'b', eventCoverage: 999 }), makeArticle({ slug: 'a' })];
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
    const times = out.map(articleTime);
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
});

describe('recentRiver', () => {
  const now = Date.parse('2026-09-13T12:00:00Z');
  const hoursAgo = (h: number) => now - h * 3_600_000;
  const at = (slug: string, t: number) => makeArticle({ slug, eventAt: t });

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

describe('leadWithTopStories', () => {
  const NOW = 100 * RIVER_WINDOW_MS;
  const HOUR = RIVER_WINDOW_MS / 24;
  const at = (slug: string, hoursAgo: number, eventCoverage: number | null = null) =>
    makeArticle({ slug, eventAt: NOW - hoursAgo * HOUR, eventCoverage });

  it('leads with the most reported, then the rest of the day newest first', () => {
    const river = [at('a', 1), at('b', 3, 643), at('c', 5), at('d', 11, 884), at('e', 20, 90)];
    const { river: led, lead } = leadWithTopStories(river, NOW);
    expect(led.map((a) => a.slug)).toEqual(['d', 'b', 'a', 'c', 'e']);
    expect(lead).toBe(2);
  });

  it('leaves a quiet day in plain time order', () => {
    const river = [at('a', 1, 120), at('b', 3), at('c', 5, 399)];
    expect(leadWithTopStories(river, NOW)).toEqual({ river, lead: 0 });
  });

  it('keeps the lead short and to the day', () => {
    const many = Array.from({ length: 8 }, (_, i) => at(`t${i}`, i + 1, 400 + i));
    const pinnedOld = at('old', 40, 5000);
    const { river: led, lead } = leadWithTopStories([...many, pinnedOld], NOW);
    expect(lead).toBe(TOP_STORIES);
    expect(led.slice(0, lead).map((a) => a.slug)).not.toContain('old');
    expect(led).toHaveLength(9);
  });

  // `earlier` marks where the new stories end in time order; the lead is out
  // of it, so the boundary is looked for after it.
  it('draws the caught-up boundary after the lead', () => {
    const river = [at('top', 11, 884), at('n1', 1), at('n2', 2), at('old', 5)];
    const rows = buildStoryRows({ river, fresh: new Set(['n1', 'n2']), lead: 1 });
    expect(rows.map((r) => r.mark)).toEqual([null, 'new', 'new', 'earlier']);
  });

  it('marks nothing new when every story is: there is nothing it is new beside', () => {
    const river = [at('a', 1), at('b', 2), at('c', 3)];
    const rows = buildStoryRows({ river, fresh: new Set(['a', 'b', 'c']) });
    expect(rows.map((r) => r.mark)).toEqual([null, null, null]);
    expect(rows.some((r) => r.fresh)).toBe(false);
  });
});
