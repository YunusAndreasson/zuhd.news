import type { Article, Category } from '../../types';
import { CITY_COORDS, SOURCE_COORDS } from './coordinates';

export interface DotLocation {
  slug: string;
  coords: [number, number]; // [lat, lng]
  addedAt: number;
}

export function extractDotLocations(grouped: Record<Category, Article[]>): DotLocation[] {
  const articles = Object.values(grouped).flat();
  const seen = new Set<string>();
  const dots: DotLocation[] = [];

  for (const article of articles) {
    let coords: [number, number] | null = null;

    // 1. Dateline: "Tehran — ..." in the first sentence
    const first = article.sentences[0] ?? '';
    const dashIdx = first.indexOf(' \u2014 ');
    if (dashIdx > 0 && dashIdx < 40) {
      const city = first.slice(0, dashIdx).toLowerCase().trim();
      coords = CITY_COORDS[city] ?? null;
    }

    // 2. Source name fallback
    if (!coords && article.source) {
      coords = SOURCE_COORDS[article.source] ?? null;
    }

    if (coords) {
      // Deduplicate by approximate location (0.5° grid)
      const key = `${Math.round(coords[0] * 2)},${Math.round(coords[1] * 2)}`;
      if (!seen.has(key)) {
        seen.add(key);
        dots.push({ slug: article.slug, coords, addedAt: article.addedAt });
      }
    }
  }

  return dots;
}
