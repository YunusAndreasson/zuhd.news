import type { Article, Category } from '@shared/types';
import { articleTime } from '../lib/article-utils';
import { orderNewsRiver, type RiverArticle } from '../lib/news-order';

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
  it('puts newer stories first regardless of coverage or category', () => {
    const grouped = emptyGrouped();
    grouped.science = [makeArticle({ slug: 'old', eventAt: 1000, eventCoverage: 294 })];
    grouped.tech = [makeArticle({ slug: 'new', eventAt: 3000 })];
    grouped.politics = [makeArticle({ slug: 'middle', eventAt: 2000, eventCoverage: 12 })];
    expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual(['new', 'middle', 'old']);
    expect(orderNewsRiver(grouped)[0]?.category).toBe('tech');
  });

  it('keeps consecutive newer stories from the same category ahead of older stories', () => {
    const grouped = emptyGrouped();
    grouped.politics = [1000, 4000, 3000, 2000].map((eventAt) =>
      makeArticle({ slug: `p-${eventAt}`, eventAt }),
    );
    grouped.economy = [makeArticle({ slug: 'older', eventAt: 500, eventCoverage: 999 })];
    expect(orderNewsRiver(grouped).map((a) => a.slug)).toEqual([
      'p-4000',
      'p-3000',
      'p-2000',
      'p-1000',
      'older',
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

  it('keeps all 40 stories in chronological order without mutating the input', () => {
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
    expect(out.map(articleTime)).toEqual(Array.from({ length: 40 }, (_, i) => (40 - i) * 1000));
    expect(JSON.stringify(grouped)).toBe(before);
  });

  it('handles an empty feed', () => {
    expect(orderNewsRiver(emptyGrouped())).toEqual([]);
  });
});
