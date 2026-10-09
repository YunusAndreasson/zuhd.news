import { type MarketLabelBounds, marketHitDistanceSquared } from './market-map-layout';
import { markTap, type TapResult } from './tap-result';

type Point = { x: number; y: number };
type Mark = Point & { id: string };
export interface CoverageMark extends Point {
  lat: number;
  lng: number;
  countryName: string | null;
  labels: string[];
}

/** Only hit geometry; never retains a Skia picture or a geographic path. */
export interface GlobeHitGeometry {
  storyMarks: readonly (Point & { slug: string; color: string })[];
  readMarks: readonly (Point & { slug: string; color: string })[];
  chokepoints: readonly Mark[];
  marketMarks: readonly (Point & { ids: string[]; labelBounds?: MarketLabelBounds | null })[];
  gdacsMarks: readonly (Point & { eventid: string })[];
  conflictMarks: readonly Mark[];
  famineMarks: readonly Mark[];
  thermalMarks: readonly Mark[];
  genocideMarks: readonly Mark[];
  hotspotGlows: readonly CoverageMark[];
  dot: Point | null;
  makkah: Point | null;
  discRadius: number;
}

const STORY_HIT_PX2 = 32 ** 2;
const MARK_HIT_PX2 = 36 ** 2;
const isNear = (x: number, y: number, mx: number, my: number, radiusSquared: number) =>
  (x - mx) ** 2 + (y - my) ** 2 <= radiusSquared;

/** Hit radii are measured on the glass even while the recorded map scales.
 * Coordinates and label bounds are in the inverse-transformed picture. */
export function hitGlobeMarks(
  frame: GlobeHitGeometry,
  x: number,
  y: number,
  scale: number,
  context: {
    hotspot: (mark: CoverageMark) => TapResult;
    dot: () => TapResult | null;
    makkah: () => TapResult;
  },
): TapResult | null {
  const radiusFactor = 1 / (scale * scale);
  // Collect every marker tier hit within its calibrated tap zone, then
  // decide: 0 hits → fall through to country-mass fallback; 1 hit →
  // return it directly (current behaviour); 2+ hits → return a
  // candidates list so the parent can show a disambiguation chooser.
  // Tier order here is the priority used when only a single hit
  // resolves and (more importantly) the order in which candidates
  // appear in the chooser.
  // Story marks first. The nearest story within its catch radius wins
  // outright — no chooser — unless a reference mark sits nearer the finger:
  // finding the news is what the globe is for, and a chooser between a
  // story and a Green flood alert is a speed bump on every other tap.
  // Hotspots, the settled dot and Makkah never outrank a story: each of
  // those stands for coverage, and the story is the coverage.
  let story: { slug: string; color: string; d2: number } | null = null;
  for (const m of frame.storyMarks) {
    const d2 = (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y);
    if (d2 <= STORY_HIT_PX2 * radiusFactor && (!story || d2 < story.d2)) {
      story = { slug: m.slug, color: m.color, d2 };
    }
  }
  // A read place reopens its newest story, but only with no unread light in
  // reach: the lights still to find are what a tap on the globe is for.
  if (!story) {
    for (const m of frame.readMarks) {
      const d2 = (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y);
      if (d2 <= STORY_HIT_PX2 * radiusFactor && (!story || d2 < story.d2)) {
        story = { slug: m.slug, color: m.color, d2 };
      }
    }
  }
  if (story) {
    let overlay = Number.POSITIVE_INFINITY;
    const marks = [
      frame.chokepoints,
      frame.gdacsMarks,
      frame.conflictMarks,
      frame.famineMarks,
      frame.thermalMarks,
      frame.genocideMarks,
    ];
    for (const layer of marks) {
      for (const m of layer) {
        const d2 = (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y);
        if (d2 <= MARK_HIT_PX2 * radiusFactor && d2 < overlay) overlay = d2;
      }
    }
    for (const m of frame.marketMarks)
      overlay = Math.min(overlay, marketHitDistanceSquared(m, x, y, scale));
    if (story.d2 <= overlay) return markTap({ storySlug: story.slug, storyColor: story.color });
  }

  const candidates: TapResult[] = [];

  // Hotspot glows — tight hit area (r²=900) signals precise intent.
  for (const z of frame.hotspotGlows) {
    if (isNear(x, y, z.x, z.y, 900 * radiusFactor)) {
      candidates.push(context.hotspot(z));
    }
  }

  // Chokepoint rings — ambient markers. 36px tap zone, generous so small
  // rings are still reliably tappable, but smaller than the article-dot
  // window so chokepoints near the settled pin don't eat its taps.
  for (const c of frame.chokepoints) {
    if (isNear(x, y, c.x, c.y, MARK_HIT_PX2 * radiusFactor)) {
      candidates.push(markTap({ chokepointId: c.id }));
    }
  }

  // Every member of a numbered market target opens in the chooser.
  for (const m of frame.marketMarks) {
    if (Number.isFinite(marketHitDistanceSquared(m, x, y, scale))) {
      for (const id of m.ids) candidates.push(markTap({ marketSignalId: id }));
    }
  }

  // GDACS disaster markers — 36px tap zone across all three tiers,
  // matching the chokepoint pattern. The glyph is sized by level
  // (`gdacsGlyphScale`) and the target is not: a finger is the same
  // size whatever the alert.
  for (const m of frame.gdacsMarks) {
    if (isNear(x, y, m.x, m.y, MARK_HIT_PX2 * radiusFactor)) {
      candidates.push(markTap({ gdacsEventId: m.eventid }));
    }
  }

  // Conflict-event markers — same 36px tap zone. Conflict density in a
  // theatre like Sudan or Gaza will produce overlapping hits regularly;
  // those resolve to the disambiguation chooser via the candidates path.
  for (const m of frame.conflictMarks) {
    if (isNear(x, y, m.x, m.y, MARK_HIT_PX2 * radiusFactor)) {
      candidates.push(markTap({ conflictEventId: m.id }));
    }
  }

  // Hazard layers — the reference marks' 36 px zone. A famine column in
  // Sudan and a conflict event beside it resolve through the chooser.
  for (const g of frame.genocideMarks) {
    if (isNear(x, y, g.x, g.y, MARK_HIT_PX2 * radiusFactor)) {
      candidates.push(markTap({ genocideId: g.id }));
    }
  }
  for (const a of frame.famineMarks) {
    if (isNear(x, y, a.x, a.y, MARK_HIT_PX2 * radiusFactor)) {
      candidates.push(markTap({ famineAreaId: a.id }));
    }
  }
  for (const e of frame.thermalMarks) {
    if (isNear(x, y, e.x, e.y, MARK_HIT_PX2 * radiusFactor)) {
      candidates.push(markTap({ thermalEventId: e.id }));
    }
  }

  // Article dot — wider catch zone.
  const dot = frame.dot;
  if (dot && isNear(x, y, dot.x, dot.y, 3600 * radiusFactor)) {
    const result = context.dot();
    if (result) candidates.push(result);
  }

  // Makkah pin.
  if (frame.makkah && isNear(x, y, frame.makkah.x, frame.makkah.y, 3600 * radiusFactor)) {
    candidates.push(context.makkah());
  }

  if (candidates.length === 1) return candidates[0] ?? null;
  if (candidates.length > 1) return markTap({ candidates });

  return null;
}
