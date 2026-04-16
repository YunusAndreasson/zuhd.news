import { SOURCES } from '../constants/sources';

describe('SOURCES proxy lookup', () => {
  it('finds exact match', () => {
    expect(SOURCES['Al Jazeera']?.location).toBe('Doha, Qatar');
  });

  it('finds case-insensitive match', () => {
    expect(SOURCES['al jazeera']?.location).toBe('Doha, Qatar');
    expect(SOURCES['AL JAZEERA']?.location).toBe('Doha, Qatar');
  });

  it('strips "The" prefix', () => {
    expect(SOURCES['The Guardian']?.type).toBe('Newspaper');
    expect(SOURCES['Guardian']?.type).toBe('Newspaper');
  });

  it('strips trailing noise words', () => {
    // "Drop Site News" → normalize → "drop site" → matches "Drop Site"
    expect(SOURCES['Drop Site News']?.type).toBe('Investigative');
  });

  it('normalizes hyphens to spaces', () => {
    // "Al-Monitor" → "al monitor" → matches "Al Monitor"
    expect(SOURCES['Al-Monitor']?.location).toBe('Washington, DC');
  });

  it('resolves manual aliases', () => {
    expect(SOURCES['Bloomberg']?.type).toBe('News agency');
    expect(SOURCES['Premium Times Nigeria']?.type).toBe('Digital media');
  });

  it('resolves non-Latin script aliases', () => {
    expect(SOURCES['جريدة الأهرام']?.location).toBe('Cairo, Egypt');
    expect(SOURCES['Українська правда']?.location).toBe('Kyiv, Ukraine');
  });

  it('returns undefined for unknown source', () => {
    expect(SOURCES['Totally Made Up News']).toBeUndefined();
  });
});
