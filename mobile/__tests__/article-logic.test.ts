import { getCoords } from '../components/globe/storyDots';
import {
  articleTime,
  ccToFlag,
  computeFontScale,
  formatExactTime,
  formatTimeAgo,
} from '../lib/article-utils';
import { displayLocation } from '../lib/place-names';
import type { Article } from '@shared/types';

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

// ---------------------------------------------------------------------------
// formatExactTime — contextual absolute time shown when tapping the dateline
// ---------------------------------------------------------------------------
describe('formatExactTime', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('uses Today, HH:MM for same-calendar-day timestamps', () => {
    const now = new Date(2026, 3, 16, 14, 30, 0).getTime();
    jest.setSystemTime(now);
    expect(formatExactTime(new Date(2026, 3, 16, 9, 5, 0).getTime())).toBe('Today, 09:05');
    expect(formatExactTime(new Date(2026, 3, 16, 0, 0, 0).getTime())).toBe('Today, 00:00');
  });

  it('uses Yesterday, HH:MM for the previous calendar day', () => {
    const now = new Date(2026, 3, 16, 14, 30, 0).getTime();
    jest.setSystemTime(now);
    expect(formatExactTime(new Date(2026, 3, 15, 23, 45, 0).getTime())).toBe('Yesterday, 23:45');
  });

  it('uses weekday, HH:MM for 2–6 days back', () => {
    const now = new Date(2026, 3, 16, 14, 30, 0).getTime();
    jest.setSystemTime(now);
    // 4 days back from Thursday Apr 16 = Sunday Apr 12
    const result = formatExactTime(new Date(2026, 3, 12, 10, 15, 0).getTime());
    expect(result).toMatch(/^[A-Za-z]+, 10:15$/);
  });

  it("does not label a 6-days-23-hours-old timestamp with today's weekday", () => {
    // Thursday Apr 16 23:00 → last Thursday Apr 9 23:30 is 6.98 elapsed days
    // but 7 calendar days back; "Thursday, 23:30" would read as today.
    const now = new Date(2026, 3, 16, 23, 0, 0).getTime();
    jest.setSystemTime(now);
    const result = formatExactTime(new Date(2026, 3, 9, 23, 30, 0).getTime());
    expect(result).not.toMatch(/^Thursday/);
    expect(result).toMatch(/, 23:30$/); // falls through to the dated form
  });

  it('uses Mon D, HH:MM for older same-year timestamps', () => {
    const now = new Date(2026, 3, 16, 14, 30, 0).getTime();
    jest.setSystemTime(now);
    const result = formatExactTime(new Date(2026, 0, 5, 8, 0, 0).getTime());
    // matches "Jan 5, 08:00" or locale equivalent ending with the time
    expect(result).toMatch(/, 08:00$/);
    expect(result).not.toContain('2026');
  });

  it('uses Mon D, YYYY for prior-year timestamps (no time)', () => {
    const now = new Date(2026, 3, 16, 14, 30, 0).getTime();
    jest.setSystemTime(now);
    const result = formatExactTime(new Date(2024, 5, 1, 12, 0, 0).getTime());
    expect(result).toContain('2024');
    expect(result).not.toContain(':');
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
