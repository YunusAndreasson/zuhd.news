import type { Article, FeedResponse } from '@shared/types';
import { collectNewArticles } from '../lib/feed-diff';

const article = (slug: string): Article => ({
  slug,
  title: slug,
  date: '2026-09-01',
  addedAt: 1,
  source: null,
  sourceUrl: null,
  sources: [],
  concepts: [],
  eventCoverage: null,
  location: null,
  lat: null,
  lng: null,
  sentences: [`${slug}.`],
});

describe('collectNewArticles', () => {
  it('returns the exact new articles in feed order', () => {
    const fresh = {
      generated: '2026-09-01T04:47:40.921Z',
      categories: {
        politics: [article('known'), article('new-politics')],
        science: [article('new-science')],
      },
      briefing: null,
    } satisfies FeedResponse;

    expect(collectNewArticles(fresh, new Set(['known'])).map((item) => item.slug)).toEqual([
      'new-politics',
      'new-science',
    ]);
  });

  it('deduplicates a slug repeated across categories', () => {
    const duplicate = article('new');
    const fresh = {
      generated: '2026-09-01T04:47:40.921Z',
      categories: { politics: [duplicate], tech: [duplicate] },
      briefing: null,
    } satisfies FeedResponse;

    expect(collectNewArticles(fresh, new Set())).toEqual([duplicate]);
  });
});
