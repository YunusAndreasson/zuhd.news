import { getCoords } from '../components/globe/storyDots';
import { articleTime, ccToFlag, formatTimeAgo } from '../lib/article-utils';
import { displayLocation } from '../lib/place-names';
import type { Article } from '@shared/types';

// Minimal Article factory — only fields used by getCoords/formatTimeAgo
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
// articleTime — which of three timestamps actually answers "how old is this"
// ---------------------------------------------------------------------------

describe('articleTime', () => {
  it('prefers eventAt, the answer the build now ships', () => {
    const a = makeArticle({ eventAt: 4_000, date: '2026-03-27T00:00:00Z', addedAt: 9_000 });
    expect(articleTime(a)).toBe(4_000);
  });

  it('falls back to the frontmatter date, so payloads built before eventAt are still right', () => {
    const a = makeArticle({ date: '2026-03-27T00:00:00Z', addedAt: 9_000 });
    expect(articleTime(a)).toBe(Date.parse('2026-03-27T00:00:00Z'));
  });

  it('falls back to addedAt only when the date will not parse', () => {
    const a = makeArticle({ date: 'not a date', addedAt: 9_000 });
    expect(articleTime(a)).toBe(9_000);
  });

  it('separates stories the build stamped with one shared mtime', () => {
    // The live feed carried 12 distinct addedAt values across 49 articles, so
    // every story in a cycle read the same age. These two must not.
    const cycle = 1_788_196_839_784;
    const fresh = makeArticle({ date: '2026-08-31T16:33:38Z', addedAt: cycle });
    const stale = makeArticle({ date: '2026-08-30T02:00:00Z', addedAt: cycle });
    expect(articleTime(fresh)).toBeGreaterThan(articleTime(stale));
  });
});

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

  // Dateline parsing was removed from getCoords — it now uses article.location instead.
  // Tests for dateline extraction were removed as they tested a deprecated code path.

  it('resolves location field to coords', () => {
    const a = makeArticle({ location: 'Tehran' });
    const coords = getCoords(a);
    expect(coords).not.toBeNull();
    expect(coords![0]).toBeCloseTo(35.69, 1);
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
// ccToFlag — country code → Unicode flag emoji
// ---------------------------------------------------------------------------

describe('ccToFlag', () => {
  it('converts uppercase country code to flag emoji', () => {
    expect(ccToFlag('US')).toBe('🇺🇸');
  });

  it('converts lowercase country code to flag emoji', () => {
    expect(ccToFlag('gb')).toBe('🇬🇧');
  });

  it('handles mixed case', () => {
    expect(ccToFlag('De')).toBe('🇩🇪');
  });

  it('converts single-char codes without crashing', () => {
    // Not a real country code, but should not throw
    expect(() => ccToFlag('A')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// displayLocation — Arabic place name restoration
// ---------------------------------------------------------------------------

describe('displayLocation', () => {
  it('returns null for null input', () => {
    expect(displayLocation(null)).toBeNull();
  });

  it('maps Tel Aviv to Yafa', () => {
    expect(displayLocation('Tel Aviv')).toBe('Yafa');
  });

  it('maps Jerusalem to Al-Quds', () => {
    expect(displayLocation('Jerusalem')).toBe('Al-Quds');
  });

  it('maps Jaffa to Yafa', () => {
    expect(displayLocation('Jaffa')).toBe('Yafa');
  });

  it('passes through unmapped locations unchanged', () => {
    expect(displayLocation('London')).toBe('London');
    expect(displayLocation('Tehran')).toBe('Tehran');
  });

  it('is case-sensitive (matches frontmatter casing)', () => {
    // Lowercase "tel aviv" has no mapping — only "Tel Aviv" does
    expect(displayLocation('tel aviv')).toBe('tel aviv');
  });
});

// ---------------------------------------------------------------------------
// formatTimeAgo — boundary conditions
// ---------------------------------------------------------------------------

describe('formatTimeAgo', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns "now" for articles less than a minute old', () => {
    const now = new Date(2026, 3, 16, 14, 0, 0).getTime();
    jest.setSystemTime(now);
    expect(formatTimeAgo(now)).toBe('now');
    expect(formatTimeAgo(now - 30_000)).toBe('now');
  });

  it('returns Nm ago for sub-hour differences', () => {
    const now = new Date(2026, 3, 16, 14, 0, 0).getTime();
    jest.setSystemTime(now);
    expect(formatTimeAgo(now - 5 * 60_000)).toBe('5m ago');
    expect(formatTimeAgo(now - 59 * 60_000)).toBe('59m ago');
  });

  it('returns Nh ago for hours within a day', () => {
    const now = new Date(2026, 3, 16, 14, 0, 0).getTime();
    jest.setSystemTime(now);
    expect(formatTimeAgo(now - 60 * 60_000)).toBe('1h ago');
    expect(formatTimeAgo(now - 3 * 60 * 60_000)).toBe('3h ago');
    expect(formatTimeAgo(now - 23 * 60 * 60_000)).toBe('23h ago');
  });

  it('returns Nd ago for 1–6 days', () => {
    const now = new Date(2026, 3, 16, 14, 0, 0).getTime();
    jest.setSystemTime(now);
    expect(formatTimeAgo(now - 24 * 60 * 60_000)).toBe('1d ago');
    expect(formatTimeAgo(now - 3 * 24 * 60 * 60_000)).toBe('3d ago');
  });

  it('returns a short date for 7+ days ago', () => {
    const now = new Date(2026, 3, 16, 14, 0, 0).getTime();
    jest.setSystemTime(now);
    const result = formatTimeAgo(new Date(2026, 3, 1, 10, 0, 0).getTime());
    expect(result).toMatch(/[A-Za-z]/);
    expect(result.length).toBeGreaterThan(0);
  });
});
