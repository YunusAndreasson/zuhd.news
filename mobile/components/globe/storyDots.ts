import type { Article } from '../../types';
import { CITY_COORDS, SOURCE_COORDS } from './coordinates';

export function getCoords(article: Article): [number, number] | null {
  // 1. Frontmatter coordinates (most reliable)
  if (article.lat != null && article.lng != null) {
    return [article.lat, article.lng];
  }

  // 2. Location field from frontmatter
  if (article.location) {
    const city = article.location.toLowerCase().trim();
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
