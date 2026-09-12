import type { StoryRow } from './map-feed';

/**
 * The river's stories, grouped into the places the globe draws them at.
 *
 * The same two relations as the web's `public/islands/_map/places.ts`, which
 * is where the reasoning lives: stories with the same dateline within
 * `PLACE_SPLIT_KM` are one city (Washington's jittered coordinates), and
 * stories within `PLACE_SAME_KM` are one place whatever the wires called them.
 * The anchor is the **modal** coordinate, ties to the newest story — a
 * coordinate some story actually claims, never a centroid.
 *
 * Grouping is what makes the globe's marks tappable at all. The old story
 * layer deduped marks in screen space, so a capital with six datelines was one
 * glow standing for six stories and a tap on it could not say which. A place
 * knows its stories, so a tap resolves to the newest one not yet found and the
 * mark stays, one lighter, until the stack is empty.
 *
 * Runs once per river, not per frame. At the river's size (tens of stories) a
 * pairwise pass is cheaper than the web's grid bucketing, which exists for 705.
 */

export const PLACE_SPLIT_KM = 120;
export const PLACE_SAME_KM = 5;

const EARTH_KM = 6371;

export interface StoryPlace {
  /** The newest story's slug — stable while that story is in the river. */
  key: string;
  lat: number;
  lng: number;
  /** Newest first: the river's own order, which `news-order.ts` guarantees. */
  slugs: string[];
}

export interface FoundProgress {
  found: number;
  /** Stories that have a place on the globe. A story with none cannot be found. */
  total: number;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function buildStoryPlaces(rows: readonly StoryRow[]): StoryPlace[] {
  const located: { row: StoryRow; lat: number; lng: number; name: string }[] = [];
  for (const row of rows) {
    if (!row.coords) continue;
    const [lat, lng] = row.coords;
    const name = row.article.location?.trim() || `${lat.toFixed(2)},${lng.toFixed(2)}`;
    located.push({ row, lat, lng, name });
  }

  const n = located.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  for (let i = 0; i < n; i++) {
    const p = located[i];
    if (!p) continue;
    for (let j = i + 1; j < n; j++) {
      const q = located[j];
      if (!q) continue;
      const km = haversineKm(p.lat, p.lng, q.lat, q.lng);
      if (km <= PLACE_SAME_KM || (p.name === q.name && km <= PLACE_SPLIT_KM)) union(i, j);
    }
  }

  // The root is always the lowest index, which is the newest story, so groups
  // come out in river order and each group's members stay newest first.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const bucket = groups.get(r);
    if (bucket) bucket.push(i);
    else groups.set(r, [i]);
  }

  const places: StoryPlace[] = [];
  for (const members of groups.values()) {
    const tally = new Map<string, { count: number; lat: number; lng: number }>();
    let best: { count: number; lat: number; lng: number } | null = null;
    for (const i of members) {
      const p = located[i];
      if (!p) continue;
      const k = `${p.lat},${p.lng}`;
      const entry = tally.get(k) ?? { count: 0, lat: p.lat, lng: p.lng };
      entry.count += 1;
      tally.set(k, entry);
      // Strictly greater: members are newest first, so a tie keeps the newer.
      if (!best || entry.count > best.count) best = entry;
    }
    const first = located[members[0] ?? -1];
    if (!best || !first) continue;
    places.push({
      key: first.row.slug,
      lat: best.lat,
      lng: best.lng,
      slugs: members.map((i) => located[i]?.row.slug ?? '').filter(Boolean),
    });
  }
  return places;
}

/** The newest story at a place the reader has not found yet, or null. */
export function topUnfound(place: StoryPlace, found: ReadonlySet<string>): string | null {
  for (const slug of place.slugs) if (!found.has(slug)) return slug;
  return null;
}

export function unfoundSlugs(place: StoryPlace, found: ReadonlySet<string>): string[] {
  return place.slugs.filter((slug) => !found.has(slug));
}

export function foundProgress(
  rows: readonly StoryRow[],
  found: ReadonlySet<string>,
): FoundProgress {
  let total = 0;
  let count = 0;
  for (const row of rows) {
    if (!row.coords) continue;
    total += 1;
    if (found.has(row.slug)) count += 1;
  }
  return { found: count, total };
}
