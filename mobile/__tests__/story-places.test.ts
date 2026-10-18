import type { StoryRow } from '../lib/map-feed';
import type { RiverArticle } from '../lib/news-order';
import { buildStoryPlaces, topUnread, unreadSlugs } from '../lib/story-places';

function row(
  slug: string,
  coords: [number, number] | null,
  location: string | null = null,
): StoryRow {
  const article = {
    slug,
    title: slug,
    date: '2026-09-12',
    addedAt: 1,
    source: null,
    sourceUrl: null,
    sources: [],
    concepts: [],
    eventCoverage: null,
    location,
    lat: coords?.[0] ?? null,
    lng: coords?.[1] ?? null,
    sentences: [],
    category: 'politics',
  } as RiverArticle;
  return {
    slug,
    article,
    title: slug,
    meta: '',
    mostCovered: false,
    mark: null,
    fresh: false,
    odds: null,
    coords,
  };
}

describe('buildStoryPlaces', () => {
  it('merges stories within 5 km whatever their datelines', () => {
    const places = buildStoryPlaces([
      row('a', [51.5074, -0.1278], 'London'),
      row('b', [51.51, -0.13], 'Westminster'),
    ]);
    expect(places).toHaveLength(1);
    expect(places[0]?.slugs).toEqual(['a', 'b']);
  });

  it('merges one dateline across a city, but not across continents', () => {
    const places = buildStoryPlaces([
      row('dc1', [38.9, -77.03], 'Washington'),
      row('dc2', [38.95, -77.4], 'Washington'),
      row('lp-bo', [-16.5, -68.15], 'La Paz'),
      row('lp-mx', [24.14, -110.31], 'La Paz'),
    ]);
    expect(places.map((p) => p.slugs)).toEqual([['dc1', 'dc2'], ['lp-bo'], ['lp-mx']]);
  });

  it('anchors on the modal coordinate, ties to the newest story', () => {
    const places = buildStoryPlaces([
      row('new', [38.9, -77.0], 'Washington'),
      row('mid', [38.95, -77.1], 'Washington'),
      row('old', [38.95, -77.1], 'Washington'),
    ]);
    expect(places[0]).toMatchObject({ key: 'new', lat: 38.95, lng: -77.1 });

    const tie = buildStoryPlaces([
      row('new', [38.9, -77.0], 'Washington'),
      row('old', [38.95, -77.1], 'Washington'),
    ]);
    expect(tie[0]).toMatchObject({ lat: 38.9, lng: -77.0 });
  });

  it('skips stories without a place', () => {
    expect(buildStoryPlaces([row('x', null)])).toEqual([]);
  });

  it('opens the newest story at a place even when the deck groups by category', () => {
    const old = row('old-politics', [51.5074, -0.1278], 'London');
    const fresh = row('new-tech', [51.51, -0.13], 'London');
    old.article.publishedAt = 1000;
    fresh.article.publishedAt = 2000;
    fresh.article.category = 'tech';
    const places = buildStoryPlaces([old, fresh]);
    expect(places[0]).toMatchObject({ key: 'new-tech', slugs: ['new-tech', 'old-politics'] });
    expect(topUnread(places[0]!, new Set())).toBe('new-tech');
  });
});

describe('read helpers', () => {
  const place = { key: 'a', lat: 0, lng: 0, slugs: ['a', 'b', 'c'] };

  it('opens the newest unread story and counts what is left', () => {
    expect(topUnread(place, new Set())).toBe('a');
    expect(topUnread(place, new Set(['a']))).toBe('b');
    expect(topUnread(place, new Set(['a', 'b', 'c']))).toBeNull();
    expect(unreadSlugs(place, new Set(['b']))).toEqual(['a', 'c']);
  });
});
