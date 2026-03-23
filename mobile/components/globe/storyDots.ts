import type { Article, Category } from '../../types';
import { CITY_COORDS, SOURCE_COORDS } from './coordinates';

export interface DotLocation {
  key: string;
  titles: string[];
  slugs: string[];
  coords: [number, number]; // [lat, lng]
  count: number;
  newestAt: number; // most recent addedAt in the group
}

export function getCoords(article: Article): [number, number] | null {
  // 1. Frontmatter coordinates (most reliable)
  if (article.lat != null && article.lng != null) {
    return [article.lat, article.lng];
  }

  // 2. Dateline: "Tehran — ..." in the first sentence
  const first = article.sentences[0] ?? '';
  const dashIdx = first.indexOf(' \u2014 ');
  if (dashIdx > 0 && dashIdx < 40) {
    const city = first.slice(0, dashIdx).toLowerCase().trim();
    const c = CITY_COORDS[city];
    if (c) return c;
  }

  // 3. Source headquarters fallback
  if (article.source) {
    const c = SOURCE_COORDS[article.source];
    if (c) return c;
  }

  return null;
}

export function extractDotLocations(grouped: Record<Category, Article[]>): DotLocation[] {
  const articles = Object.values(grouped).flat();
  const groups = new Map<string, DotLocation>();

  for (const article of articles) {
    const coords = getCoords(article);
    if (!coords) continue;

    // Group by approximate location (0.5° grid ≈ 50km)
    const key = `${Math.round(coords[0] * 2)},${Math.round(coords[1] * 2)}`;
    const existing = groups.get(key);

    if (existing) {
      existing.titles.push(article.title);
      existing.slugs.push(article.slug);
      existing.count++;
      if (article.addedAt > existing.newestAt) {
        existing.newestAt = article.addedAt;
      }
    } else {
      groups.set(key, {
        key,
        titles: [article.title],
        slugs: [article.slug],
        coords,
        count: 1,
        newestAt: article.addedAt,
      });
    }
  }

  return [...groups.values()];
}
