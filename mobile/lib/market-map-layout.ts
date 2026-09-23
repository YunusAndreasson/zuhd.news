/** Screen-space clustering: every market survives, close neighbours share a target. */
export interface MarketPoint {
  id: string;
  x: number;
  y: number;
  /** The index's name — or, for a cluster, how many markets it holds. */
  label: string;
  /** The move (`↓4.8%`), drawn on its own line under the name. A cluster
   *  has none: it would be one member's move under several names. */
  move?: string;
  direction?: 'up' | 'down' | 'flat';
}
export interface MarketCluster extends MarketPoint {
  ids: string[];
  originX: number;
  originY: number;
  rising: number;
  falling: number;
}
export const MARKET_TARGET = 48;
export interface MarketLabelBounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** A visible label belongs to its market, even when packing moved it away
 * from the circle. Keep the circle's radius unchanged for nearby targets. */
export function marketHitDistanceSquared(
  mark: { x: number; y: number; labelBounds?: MarketLabelBounds | null },
  x: number,
  y: number,
): number {
  const b = mark.labelBounds;
  const d2 = (mark.x - x) ** 2 + (mark.y - y) ** 2;
  const circle = d2 <= (MARKET_TARGET / 2) ** 2 ? d2 : Number.POSITIVE_INFINITY;
  if (b && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) {
    // Rank by the visible label's centre so a nearby story dot remains
    // selectable where its catch area overlaps the text's bounding box.
    return Math.min(circle, (x - (b.x0 + b.x1) / 2) ** 2 + (y - (b.y0 + b.y1) / 2) ** 2);
  }
  return circle;
}

const distance2 = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** How far a leader line keeps from another mark's centre: a glyph's half-width
 *  and a hair, so the line passes beside a strait or a story, never through. */
export const LEADER_CLEARANCE = 14;

/** Squared distance from `p` to the segment `a`–`b`. */
function segmentDistance2(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return (p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2;
}

/** Whether the segment `a`–`b` crosses the box — Liang–Barsky clipping. */
function segmentMeetsBox(
  a: { x: number; y: number },
  b: { x: number; y: number },
  box: MarketLabelBounds,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: [number, number][] = [
    [-dx, a.x - box.x0],
    [dx, box.x1 - a.x],
    [-dy, a.y - box.y0],
    [dy, box.y1 - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** Whether a target circle at `p` overlaps the box. */
function circleMeetsBox(p: { x: number; y: number }, box: MarketLabelBounds, r: number): boolean {
  const cx = Math.max(box.x0, Math.min(box.x1, p.x));
  const cy = Math.max(box.y0, Math.min(box.y1, p.y));
  return (p.x - cx) ** 2 + (p.y - cy) ** 2 < r * r;
}
export function layoutMarketClusters(
  points: MarketPoint[],
  obstacles: { x: number; y: number }[],
  width: number,
  height: number,
  top = 0,
  bottom = height,
  /** Text that is always drawn — the story's place and its country — which a
   *  target and its leader line keep off. */
  boxes: MarketLabelBounds[] = [],
  /** The planet's outline on screen. A target is set on the ground: pushed
   *  off a crowded limb, a "5 markets" circle floated in space. */
  disc?: { x: number; y: number; r: number },
): MarketCluster[] {
  const sorted = [...points]
    .filter((p) => p.x >= 0 && p.x <= width && p.y >= top && p.y <= bottom)
    // Any fixed order will do — it only keeps clustering stable between
    // frames. Code-point order, never `localeCompare`: this runs on every
    // reprojection, and on Android Hermes `localeCompare` goes through ICU —
    // 174 ms of a 19 s map session, the single largest JS cost in it.
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const groups: MarketPoint[][] = [];
  for (const point of sorted) {
    const touching = groups.filter((group) =>
      group.some((p) => distance2(p, point) < MARKET_TARGET ** 2),
    );
    if (!touching.length) groups.push([point]);
    else {
      const first = touching[0];
      if (!first) continue;
      first.push(point);
      for (const group of touching.slice(1)) {
        first.push(...group);
        groups.splice(groups.indexOf(group), 1);
      }
    }
  }
  const placed: MarketCluster[] = [];
  for (const group of groups) {
    const originX = group.reduce((sum, p) => sum + p.x, 0) / group.length;
    const originY = group.reduce((sum, p) => sum + p.y, 0) / group.length;
    const rising = group.filter((p) => p.direction === 'up').length;
    const falling = group.filter((p) => p.direction === 'down').length;
    const first = group[0];
    if (!first) continue;
    // Prefer the real location. Short leader lines preserve geographic meaning
    // when a nearby story or hazard needs its own separate touch target.
    const candidates = [{ x: originX, y: originY }];
    for (const radius of [MARKET_TARGET, MARKET_TARGET * 1.5, MARKET_TARGET * 2]) {
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        candidates.push({
          x: originX + Math.cos(angle) * radius,
          y: originY + Math.sin(angle) * radius,
        });
      }
    }
    const others = [...obstacles, ...placed];
    const onGround = (p: { x: number; y: number }) =>
      !disc || distance2(p, disc) <= Math.max(0, disc.r - MARKET_TARGET / 2) ** 2;
    const roomy = (p: { x: number; y: number }) =>
      onGround(p) &&
      p.x >= 24 &&
      p.x <= width - 24 &&
      p.y >= top + 24 &&
      p.y <= bottom - 24 &&
      others.every((other) => distance2(p, other) >= MARKET_TARGET ** 2);
    // A single market's leader line runs to its city, so it must not run
    // through another mark or the story's place on the way: at Istanbul it
    // passed under the Bosporus arrow, and a line through a label cuts it.
    // A cluster draws no leader (see `MiniGlobe`), so it only needs room.
    const origin = { x: originX, y: originY };
    const clear = (p: { x: number; y: number }) =>
      boxes.every((b) => !circleMeetsBox(p, b, MARKET_TARGET / 2 - 4)) &&
      (group.length > 1 ||
        (others.every(
          (o) =>
            segmentDistance2(o, origin, p) >= LEADER_CLEARANCE ** 2 ||
            distance2(o, origin) < LEADER_CLEARANCE ** 2,
        ) &&
          boxes.every(
            // A line must start at its city, so a label over the city itself
            // cannot count against it.
            (b) => circleMeetsBox(origin, b, 1) || !segmentMeetsBox(origin, p, b),
          )));
    // The strict pass first; a crowded region falls back to the old rule
    // rather than merging a market into a neighbour for want of a clean line.
    const free = candidates.find((p) => roomy(p) && clear(p)) ?? candidates.find(roomy);
    // If no free position exists, combine with the closest market target instead
    // of drawing another overlapping icon. Its chooser retains every member.
    if (!free && placed.length) {
      const nearest = placed.reduce((a, b) =>
        distance2(a, { x: originX, y: originY }) < distance2(b, { x: originX, y: originY }) ? a : b,
      );
      nearest.ids.push(...group.map((p) => p.id));
      nearest.rising += rising;
      nearest.falling += falling;
      nearest.label = `${nearest.ids.length} markets`;
      nearest.move = undefined;
      nearest.direction = undefined;
      continue;
    }
    const p = free ?? {
      x: Math.max(24, Math.min(width - 24, originX)),
      y: Math.max(top + 24, Math.min(bottom - 24, originY)),
    };
    placed.push({
      ...first,
      ...p,
      originX,
      originY,
      ids: group.map((p) => p.id),
      rising,
      falling,
      label: group.length === 1 ? first.label : `${group.length} markets`,
      move: group.length === 1 ? first.move : undefined,
      direction: group.length === 1 ? first.direction : undefined,
    });
  }
  return placed;
}
