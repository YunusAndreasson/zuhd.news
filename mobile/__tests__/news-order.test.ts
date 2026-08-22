import type { Article, Category } from '@shared/types';
import {
  capConsecutive,
  compareNewsworthiness,
  MAX_SAME_CATEGORY_RUN,
  orderNewsRiver,
  type RiverArticle,
} from '../lib/news-order';

function makeArticle(overrides: Partial<RiverArticle> = {}): RiverArticle {
  return {
    slug: 'test',
    title: 'Test',
    date: '2026-08-22',
    addedAt: 1_000,
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

// ---------------------------------------------------------------------------
// compareNewsworthiness
// ---------------------------------------------------------------------------

describe('compareNewsworthiness', () => {
  it('ranks higher eventCoverage first', () => {
    const heavy = makeArticle({ slug: 'heavy', eventCoverage: 294 });
    const light = makeArticle({ slug: 'light', eventCoverage: 37 });
    expect(compareNewsworthiness(heavy, light)).toBeLessThan(0);
    expect(compareNewsworthiness(light, heavy)).toBeGreaterThan(0);
  });

  it('treats a null eventCoverage as zero, not as missing', () => {
    // 30 of today's 40 articles carry null. They must sort below every covered
    // story rather than landing arbitrarily.
    const covered = makeArticle({ slug: 'covered', eventCoverage: 1 });
    const uncovered = makeArticle({ slug: 'uncovered', eventCoverage: null });
    expect(compareNewsworthiness(covered, uncovered)).toBeLessThan(0);
  });

  it('breaks a coverage tie on recency', () => {
    const newer = makeArticle({ slug: 'newer', eventCoverage: 50, addedAt: 2_000 });
    const older = makeArticle({ slug: 'older', eventCoverage: 50, addedAt: 1_000 });
    expect(compareNewsworthiness(newer, older)).toBeLessThan(0);
  });

  it('is total — identical rank falls back to slug so the order never reshuffles', () => {
    const a = makeArticle({ slug: 'aaa', eventCoverage: 50, addedAt: 1_000 });
    const b = makeArticle({ slug: 'bbb', eventCoverage: 50, addedAt: 1_000 });
    expect(compareNewsworthiness(a, b)).toBeLessThan(0);
    expect(compareNewsworthiness(b, a)).toBeGreaterThan(0);
    expect(compareNewsworthiness(a, a)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// capConsecutive
// ---------------------------------------------------------------------------

function categoriesOf(list: RiverArticle[]): Category[] {
  return list.map((a) => a.category);
}

function longestRun(list: RiverArticle[]): number {
  let best = 0;
  let run = 0;
  let prev: Category | null = null;
  for (const a of list) {
    run = a.category === prev ? run + 1 : 1;
    prev = a.category;
    if (run > best) best = run;
  }
  return best;
}

describe('capConsecutive', () => {
  it('breaks a politics wall at the cap', () => {
    const ranked = [
      makeArticle({ slug: 'p1', category: 'politics' }),
      makeArticle({ slug: 'p2', category: 'politics' }),
      makeArticle({ slug: 'p3', category: 'politics' }),
      makeArticle({ slug: 'e1', category: 'economy' }),
    ];
    const out = capConsecutive(ranked);
    expect(categoriesOf(out)).toEqual(['politics', 'politics', 'economy', 'politics']);
    expect(longestRun(out)).toBeLessThanOrEqual(MAX_SAME_CATEGORY_RUN);
  });

  it('leaves a list that already respects the cap untouched', () => {
    const ranked = [
      makeArticle({ slug: 'p1', category: 'politics' }),
      makeArticle({ slug: 'e1', category: 'economy' }),
      makeArticle({ slug: 'p2', category: 'politics' }),
    ];
    expect(capConsecutive(ranked).map((a) => a.slug)).toEqual(['p1', 'e1', 'p2']);
  });

  it('promotes the NEAREST different category, so nothing jumps further than the clump', () => {
    const ranked = [
      makeArticle({ slug: 'p1', category: 'politics' }),
      makeArticle({ slug: 'p2', category: 'politics' }),
      makeArticle({ slug: 'p3', category: 'politics' }),
      makeArticle({ slug: 't1', category: 'tech' }),
      makeArticle({ slug: 'e1', category: 'economy' }),
    ];
    expect(capConsecutive(ranked).map((a) => a.slug)).toEqual(['p1', 'p2', 't1', 'p3', 'e1']);
  });

  it('runs long rather than stalling when nothing is left to trade with', () => {
    const ranked = ['a', 'b', 'c', 'd'].map((s) => makeArticle({ slug: s, category: 'science' }));
    const out = capConsecutive(ranked);
    expect(out.map((a) => a.slug)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps every article exactly once', () => {
    const ranked = Array.from({ length: 40 }, (_, i) =>
      makeArticle({
        slug: `s${i}`,
        category: (['politics', 'politics', 'politics', 'economy'] as Category[])[i % 4],
      }),
    );
    const out = capConsecutive(ranked);
    expect(out).toHaveLength(40);
    expect(new Set(out.map((a) => a.slug)).size).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// orderNewsRiver
// ---------------------------------------------------------------------------

describe('orderNewsRiver', () => {
  it('attaches the real category rather than making a card guess it', () => {
    const grouped = emptyGrouped();
    grouped.tech = [makeArticle({ slug: 'chip' })];
    expect(orderNewsRiver(grouped)[0]?.category).toBe('tech');
  });

  it('puts the most-covered story first regardless of which category holds it', () => {
    const grouped = emptyGrouped();
    grouped.politics = [makeArticle({ slug: 'quiet', eventCoverage: 12, addedAt: 9_000 })];
    grouped.science = [makeArticle({ slug: 'loud', eventCoverage: 294, addedAt: 1 })];
    expect(orderNewsRiver(grouped)[0]?.slug).toBe('loud');
  });

  it('never emits more than the cap in a row, on a realistic 40-article feed', () => {
    const grouped = emptyGrouped();
    for (const category of ['politics', 'economy', 'science', 'tech'] as Category[]) {
      grouped[category] = Array.from({ length: 10 }, (_, i) =>
        makeArticle({
          slug: `${category}-${i}`,
          category,
          // Only politics carries coverage — the exact shape that produced a
          // politics wall at the top of the river.
          eventCoverage: category === 'politics' ? 100 - i : null,
          addedAt: 1_000 - i,
        }),
      );
    }
    const out = orderNewsRiver(grouped);
    expect(out).toHaveLength(40);
    expect(longestRun(out)).toBeLessThanOrEqual(MAX_SAME_CATEGORY_RUN);
  });

  it('is stable — the same feed produces the same column twice', () => {
    const grouped = emptyGrouped();
    grouped.politics = [
      makeArticle({ slug: 'b', eventCoverage: 50, addedAt: 1_000 }),
      makeArticle({ slug: 'a', eventCoverage: 50, addedAt: 1_000 }),
    ];
    const first = orderNewsRiver(grouped).map((a) => a.slug);
    const second = orderNewsRiver(grouped).map((a) => a.slug);
    expect(first).toEqual(second);
    expect(first).toEqual(['a', 'b']);
  });

  it('survives an empty feed', () => {
    expect(orderNewsRiver(emptyGrouped())).toEqual([]);
  });
});
