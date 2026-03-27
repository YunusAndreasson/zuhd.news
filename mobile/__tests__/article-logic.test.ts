import { getCoords } from '../components/globe/storyDots';
import { computeFontScale, formatTimeAgo } from '../lib/article-utils';
import type { Article } from '../types';

// Minimal Article factory — only fields used by getCoords/formatTimeAgo/computeFontScale
function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    slug: 'test',
    title: 'Test',
    date: '2026-03-27',
    addedAt: Date.now(),
    source: null,
    sourceUrl: null,
    sources: [],
    concepts: [],
    eventCoverage: null,
    location: null,
    lat: null,
    lng: null,
    sentences: ['A test sentence.'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getCoords — 3 fallback paths: frontmatter → dateline → source HQ → null
// ---------------------------------------------------------------------------

describe('getCoords', () => {
  it('returns frontmatter coords when lat/lng are present', () => {
    const a = makeArticle({ lat: 35.69, lng: 51.39 });
    expect(getCoords(a)).toEqual([35.69, 51.39]);
  });

  it('prioritises frontmatter over dateline and source', () => {
    const a = makeArticle({
      lat: 10,
      lng: 20,
      sentences: ['Tehran \u2014 The government announced...'],
      source: 'Al Jazeera',
    });
    expect(getCoords(a)).toEqual([10, 20]);
  });

  it('treats lat=0, lng=0 as valid (not null)', () => {
    // Tests != null guard (line 6) — 0 is falsy but valid
    const a = makeArticle({ lat: 0, lng: 0 });
    expect(getCoords(a)).toEqual([0, 0]);
  });

  it('extracts city from dateline with em dash', () => {
    const a = makeArticle({ sentences: ['Tehran \u2014 The government announced...'] });
    const coords = getCoords(a);
    expect(coords).not.toBeNull();
    expect(coords![0]).toBeCloseTo(35.69, 1); // Tehran lat
  });

  it('handles dateline case-insensitively', () => {
    const a = makeArticle({ sentences: ['LONDON \u2014 Markets rallied today...'] });
    const coords = getCoords(a);
    expect(coords).not.toBeNull();
    expect(coords![0]).toBeCloseTo(51.51, 1); // London lat
  });

  it('matches dateline with ASCII double-dash', () => {
    const a = makeArticle({ sentences: ['Tehran -- The government announced...'] });
    const coords = getCoords(a);
    expect(coords).not.toBeNull();
    expect(coords![0]).toBeCloseTo(35.69, 1);
  });

  it('matches dateline with ASCII triple-dash', () => {
    const a = makeArticle({ sentences: ['Tehran --- The government announced...'] });
    const coords = getCoords(a);
    expect(coords).not.toBeNull();
    expect(coords![0]).toBeCloseTo(35.69, 1);
  });

  it('matches dateline with en dash', () => {
    const a = makeArticle({ sentences: ['Tehran \u2013 The government announced...'] });
    const coords = getCoords(a);
    expect(coords).not.toBeNull();
    expect(coords![0]).toBeCloseTo(35.69, 1);
  });

  it('skips dateline if dash is at position >= 40', () => {
    const longCity = 'A'.repeat(41);
    const a = makeArticle({ sentences: [`${longCity} \u2014 text`] });
    expect(getCoords(a)).toBeNull();
  });

  it('falls through to source when city is not in CITY_COORDS', () => {
    const a = makeArticle({
      sentences: ['Timbuktu \u2014 Reports indicate...'],
      source: 'Al Jazeera',
    });
    const coords = getCoords(a);
    expect(coords).not.toBeNull();
    expect(coords![0]).toBeCloseTo(25.29, 1); // Al Jazeera HQ (Doha)
  });

  it('uses source HQ when no frontmatter or dateline', () => {
    const a = makeArticle({
      sentences: ['The market rallied today...'],
      source: 'BBC World',
    });
    const coords = getCoords(a);
    expect(coords).not.toBeNull();
    expect(coords![0]).toBeCloseTo(51.51, 1); // London
  });

  it('returns null when no coords, no dateline, no known source', () => {
    const a = makeArticle({
      sentences: ['Something happened'],
      source: 'Unknown Outlet',
    });
    expect(getCoords(a)).toBeNull();
  });

  it('returns null for empty sentences and null source', () => {
    const a = makeArticle({ sentences: [], source: null });
    expect(getCoords(a)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatTimeAgo — boundary conditions
// ---------------------------------------------------------------------------

describe('formatTimeAgo', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns "just now" for < 1 hour ago', () => {
    const now = Date.now();
    jest.setSystemTime(now);
    expect(formatTimeAgo(now - 30 * 60 * 1000)).toBe('just now');
  });

  it('returns "just now" for exactly now', () => {
    const now = Date.now();
    jest.setSystemTime(now);
    expect(formatTimeAgo(now)).toBe('just now');
  });

  it('returns "1h ago" at exactly 1 hour', () => {
    const now = Date.now();
    jest.setSystemTime(now);
    expect(formatTimeAgo(now - 3600 * 1000)).toBe('1h ago');
  });

  it('returns "23h ago" at 23 hours', () => {
    const now = Date.now();
    jest.setSystemTime(now);
    expect(formatTimeAgo(now - 23 * 3600 * 1000)).toBe('23h ago');
  });

  it('returns a date string at 24+ hours', () => {
    const now = Date.now();
    jest.setSystemTime(now);
    const result = formatTimeAgo(now - 24 * 3600 * 1000);
    // Locale-dependent, so just verify it's not in "Xh ago" format
    expect(result).not.toMatch(/\d+h ago/);
    expect(result).not.toBe('just now');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns "just now" for future timestamps (clock skew)', () => {
    const now = Date.now();
    jest.setSystemTime(now);
    // Future: ms is negative → hours = Math.floor(negative/3600000) < 0 < 1
    expect(formatTimeAgo(now + 3600 * 1000)).toBe('just now');
  });
});

// ---------------------------------------------------------------------------
// computeFontScale — content length → scale factor
// ---------------------------------------------------------------------------

describe('computeFontScale', () => {
  it('returns 1 for short articles', () => {
    expect(computeFontScale('Short', ['Hello'])).toBe(1);
  });

  it('returns 1 at exactly the threshold', () => {
    // title.length*2 + sentences.join(' ').length = 450
    // title = "T" (1*2=2), sentences need total length 448
    const title = 'T';
    const body = 'x'.repeat(448);
    expect(computeFontScale(title, [body])).toBe(1);
  });

  it('returns a value between 0.95 and 1 just above threshold', () => {
    const title = 'T';
    const body = 'x'.repeat(449); // contentLength = 2 + 449 = 451
    const scale = computeFontScale(title, [body]);
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThan(0.95);
  });

  it('floors at 0.95 for very long articles', () => {
    const title = 'A'.repeat(100);
    const body = 'B'.repeat(1000);
    // contentLength = 200 + 1000 = 1200, 450/1200 = 0.375 < 0.95
    expect(computeFontScale(title, [body])).toBe(0.95);
  });

  it('returns 1 for empty title and sentences (not NaN)', () => {
    // contentLength = 0 <= 450
    expect(computeFontScale('', [])).toBe(1);
  });

  it('joins multiple sentences with spaces', () => {
    // ["ab", "cd"] → "ab cd" → length 5
    // title "T" → 2, total = 7 ≤ 450
    expect(computeFontScale('T', ['ab', 'cd'])).toBe(1);
  });
});
