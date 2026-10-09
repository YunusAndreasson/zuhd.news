/** Screen-space clustering: every market survives, and close neighbours share
 *  a target only where there is no room to show them apart. */
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
  /** For a lone market, the room the layout kept for its name — the slot's
   *  `dy`, which the label packer tries first. */
  labelDy?: number;
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
  scale = 1,
): number {
  const b = mark.labelBounds;
  const d2 = (mark.x - x) ** 2 + (mark.y - y) ** 2;
  const circle = d2 * scale * scale <= (MARKET_TARGET / 2) ** 2 ? d2 : Number.POSITIVE_INFINITY;
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

/** Whether two boxes come within `gap` of each other. */
function boxesMeet(a: MarketLabelBounds, b: MarketLabelBounds, gap: number): boolean {
  return a.x0 - gap < b.x1 && a.x1 + gap > b.x0 && a.y0 - gap < b.y1 && a.y1 + gap > b.y0;
}

/** Whether the segments `a`–`b` and `c`–`d` cross. Two leaders from one city
 *  share an end, which is not a crossing. */
function segmentsCross(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  const side = (
    p: { x: number; y: number },
    q: { x: number; y: number },
    r: { x: number; y: number },
  ) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0;
}

/** A target's footprint, as the label packer reserves it: the glyph's 13pt
 *  circle, its stroke and a hair. */
export function marketTargetBox(m: { x: number; y: number }): MarketLabelBounds {
  return { x0: m.x - 19, x1: m.x + 19, y0: m.y - 19, y1: m.y + 19 };
}

/** A single market's leader runs from its city to its target; a cluster draws none. */
function leaderOf(m: MarketCluster): { from: { x: number; y: number }; to: MarketCluster } | null {
  if (m.ids.length !== 1 || distance2(m, { x: m.originX, y: m.originY }) <= 4) return null;
  return { from: { x: m.originX, y: m.originY }, to: m };
}

/** Where a lone market's name can go, in the order the label packer tries. */
export interface MarketLabelSlot {
  /** The baseline's offset from the target — what the packer is told to try first. */
  dy: number;
  box: MarketLabelBounds;
}

/** What a market's name has to fit around. With it, close markets are set
 *  apart only where each can be named: a target without its name is an
 *  arrow nobody can read, and a cluster's count says more than that. */
export interface MarketLabelRoom {
  slots: (point: MarketPoint, x: number, y: number) => MarketLabelSlot[];
  /** Text drawn whatever happens: the story's place and country, genocide
   *  names, story and conflict counts. */
  avoid: MarketLabelBounds[];
  /** Glyphs a name keeps off: straits and their arrows, beacons, hazards. */
  glyphs: { x: number; y: number; r: number }[];
  /** The clear space between two labels, the packer's. */
  gap: number;
}

export interface MarketLayoutOptions {
  width: number;
  height: number;
  /** The band of the canvas the chrome leaves visible. */
  top?: number;
  bottom?: number;
  /** Text that is always drawn — the story's place and its country — which a
   *  target and its leader line keep off. */
  boxes?: MarketLabelBounds[];
  /** The planet's outline on screen. A target is set on the ground: pushed
   *  off a crowded limb, a "5 markets" circle floated in space. */
  disc?: { x: number; y: number; r: number };
  label?: MarketLabelRoom;
  /** Whether close markets may each keep their own target. Off at the
   *  whole-planet zoom, where names are earned by a move and a cluster's
   *  count is all a crowded region should say. */
  split?: boolean;
}

/** How far a target may sit from its city. A market that is alone keeps the
 *  full reach; one set apart from close neighbours stops at a target and a
 *  half, because past that a fan of leader lines out of one region reads as
 *  noise rather than as places, and the cluster's count says more. */
const RINGS = [MARKET_TARGET, MARKET_TARGET * 1.5, MARKET_TARGET * 2] as const;
const SPLIT_RINGS = [MARKET_TARGET, MARKET_TARGET * 1.5] as const;

/** The city itself, then eight directions on each ring around it. */
function around(origin: { x: number; y: number }, radii: readonly number[]) {
  const out = [{ x: origin.x, y: origin.y }];
  for (const radius of radii) {
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      out.push({ x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius });
    }
  }
  return out;
}

/** What has been set down so far: every target, and the room kept for names. */
interface Scene {
  placed: MarketCluster[];
  names: MarketLabelBounds[];
}

/** Squared distance between the nearest members of two groups. */
function groupDistance2(a: MarketPoint[], b: MarketPoint[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const p of a) for (const q of b) best = Math.min(best, distance2(p, q));
  return best;
}

const byId = (a: MarketPoint, b: MarketPoint) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const meanOf = (group: readonly MarketPoint[]) => ({
  x: group.reduce((sum, q) => sum + q.x, 0) / group.length,
  y: group.reduce((sum, q) => sum + q.y, 0) / group.length,
});

/** A group's mark with its target at `p`: one market by name, or several by
 *  count, with the room kept for a lone market's name (`labelDy`). */
function markOf(
  group: readonly MarketPoint[],
  p: { x: number; y: number },
  labelDy?: number,
): MarketCluster | null {
  const first = group[0];
  if (!first) return null;
  const lone = group.length === 1;
  const origin = meanOf(group);
  return {
    ...first,
    ...p,
    originX: origin.x,
    originY: origin.y,
    ids: group.map((q) => q.id),
    rising: group.filter((q) => q.direction === 'up').length,
    falling: group.filter((q) => q.direction === 'down').length,
    label: lone ? first.label : `${group.length} markets`,
    move: lone ? first.move : undefined,
    direction: lone ? first.direction : undefined,
    ...(lone && labelDy !== undefined ? { labelDy } : null),
  };
}

/**
 * Every market on screen gets a 48pt target of its own, set on its city or
 * joined to it by a leader line. Markets share one — a cluster, `3 markets`
 * — only where there is no room to show them apart (2026-09-25, the user's
 * request). They used to share one whenever two cities sat closer than a
 * target's width, room or not: New York and Toronto, or Kuala Lumpur and
 * Singapore, were `2 markets` at every story framing with the sea empty
 * around them, and western Europe was one `6 markets`.
 *
 * Markets closer than a target still start as one group, but each is then
 * tried on its own: a target clear of every other mark, a leader line that
 * crosses no other and no name, and room for its own name. A market that
 * finds none joins its nearest neighbour in the group, and the group is laid
 * out again, until every lone market fits. So a crowded Europe can show
 * London, Paris and Amsterdam by name with `3 markets` over the Alps, where
 * it used to show one count.
 */
export function layoutMarketClusters(
  points: MarketPoint[],
  obstacles: { x: number; y: number }[],
  options: MarketLayoutOptions,
): MarketCluster[] {
  const {
    width,
    height,
    top = 0,
    bottom = height,
    boxes = [],
    disc,
    label,
    split = true,
  } = options;
  const sorted = points
    .filter((p) => p.x >= 0 && p.x <= width && p.y >= top && p.y <= bottom)
    // Any fixed order will do — it only keeps clustering stable between
    // frames. Code-point order, never `localeCompare`: this runs on every
    // reprojection, and on Android Hermes `localeCompare` goes through ICU —
    // 174 ms of a 19 s map session, the single largest JS cost in it.
    .sort(byId);
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

  const onGround = (p: { x: number; y: number }) =>
    !disc || distance2(p, disc) <= Math.max(0, disc.r - MARKET_TARGET / 2) ** 2;
  const roomy = (p: { x: number; y: number }, scene: Scene) =>
    onGround(p) &&
    p.x >= 24 &&
    p.x <= width - 24 &&
    p.y >= top + 24 &&
    p.y <= bottom - 24 &&
    obstacles.every((other) => distance2(p, other) >= MARKET_TARGET ** 2) &&
    scene.placed.every((other) => distance2(p, other) >= MARKET_TARGET ** 2);

  // A target keeps off the text that is always drawn, off the room kept for
  // other markets' names, and off every leader line. A single market's own
  // leader runs to its city, so it must not run through another mark or the
  // story's place on the way: at Istanbul it passed under the Bosporus arrow,
  // and a line through a label cuts it. Nor may it cross another leader,
  // which two markets set apart from one region would otherwise do. A
  // cluster draws no leader (see `MiniGlobe`), so it only needs room.
  const clear = (
    p: { x: number; y: number },
    origin: { x: number; y: number },
    single: boolean,
    scene: Scene,
  ) => {
    if (boxes.some((b) => circleMeetsBox(p, b, MARKET_TARGET / 2 - 4))) return false;
    const footprint = marketTargetBox(p);
    const gap = label?.gap ?? 0;
    if (scene.names.some((n) => boxesMeet(footprint, n, gap))) return false;
    const led = single && distance2(p, origin) > 4;
    for (const m of scene.placed) {
      const leader = leaderOf(m);
      if (!leader) continue;
      if (segmentDistance2(p, leader.from, leader.to) < LEADER_CLEARANCE ** 2) return false;
      if (led && segmentsCross(origin, p, leader.from, leader.to)) return false;
    }
    if (!single) return true;
    const passes = (o: { x: number; y: number }) =>
      segmentDistance2(o, origin, p) >= LEADER_CLEARANCE ** 2 ||
      distance2(o, origin) < LEADER_CLEARANCE ** 2;
    return (
      obstacles.every(passes) &&
      scene.placed.every(passes) &&
      // A line must start at its city, so a label over the city itself
      // cannot count against it.
      [...boxes, ...scene.names].every(
        (b) => circleMeetsBox(origin, b, 1) || !segmentMeetsBox(origin, p, b),
      )
    );
  };

  // The first place the label packer would put this market's name that
  // nothing already holds — its own target and leader included.
  const nameFor = (
    point: MarketPoint,
    p: { x: number; y: number },
    scene: Scene,
  ): MarketLabelSlot | null => {
    if (!label) return null;
    const led = distance2(p, point) > 4;
    const own = marketTargetBox(p);
    for (const slot of label.slots(point, p.x, p.y)) {
      const b = slot.box;
      if (b.x0 < 0 || b.x1 > width || b.y0 < top || b.y1 > bottom) continue;
      if (boxesMeet(b, own, label.gap)) continue;
      if (led && segmentMeetsBox(point, p, b)) continue;
      if (label.avoid.some((o) => boxesMeet(b, o, label.gap))) continue;
      if (scene.names.some((o) => boxesMeet(b, o, label.gap))) continue;
      if (label.glyphs.some((g) => circleMeetsBox(g, b, g.r))) continue;
      const blocked = scene.placed.some((m) => {
        if (boxesMeet(b, marketTargetBox(m), label.gap)) return true;
        const leader = leaderOf(m);
        return leader !== null && segmentMeetsBox(leader.from, leader.to, b);
      });
      if (!blocked) return slot;
    }
    return null;
  };

  const setDown = (
    scene: Scene,
    group: MarketPoint[],
    p: { x: number; y: number },
    name: MarketLabelSlot | null,
  ) => {
    const mark = markOf(group, p, name?.dy);
    if (!mark) return;
    scene.placed.push(mark);
    if (name) scene.names.push(name.box);
  };

  // One market set apart from its neighbours: only where the target, its
  // leader and its name all have room.
  const placeApart = (scene: Scene, point: MarketPoint): boolean => {
    for (const p of around(point, SPLIT_RINGS)) {
      if (!roomy(p, scene) || !clear(p, point, true, scene)) continue;
      const name = nameFor(point, p, scene);
      if (label && !name) continue;
      setDown(scene, [point], p, name);
      return true;
    }
    return false;
  };

  // A group as one target: a lone market as it always was, or a cluster.
  const placeGroup = (scene: Scene, group: MarketPoint[]) => {
    const origin = {
      x: group.reduce((sum, p) => sum + p.x, 0) / group.length,
      y: group.reduce((sum, p) => sum + p.y, 0) / group.length,
    };
    const single = group.length === 1;
    // Prefer the real location. Short leader lines preserve geographic meaning
    // when a nearby story or hazard needs its own separate touch target.
    const candidates = around(origin, RINGS);
    // The strict pass first; a crowded region falls back to the old rule
    // rather than merging a market into a neighbour for want of a clean line.
    const free =
      candidates.find((p) => roomy(p, scene) && clear(p, origin, single, scene)) ??
      candidates.find((p) => roomy(p, scene));
    // If no free position exists, combine with the closest market target instead
    // of drawing another overlapping icon. Its chooser retains every member.
    if (!free && scene.placed.length) {
      let nearest = 0;
      scene.placed.forEach((m, i) => {
        const best = scene.placed[nearest];
        if (best && distance2(m, origin) < distance2(best, origin)) nearest = i;
      });
      const into = scene.placed[nearest];
      if (!into) return;
      const ids = [...into.ids, ...group.map((p) => p.id)];
      // Replaced, never changed in place: a trial layout shares these marks.
      scene.placed[nearest] = {
        ...into,
        ids,
        rising: into.rising + group.filter((p) => p.direction === 'up').length,
        falling: into.falling + group.filter((p) => p.direction === 'down').length,
        label: `${ids.length} markets`,
        move: undefined,
        direction: undefined,
      };
      return;
    }
    const p = free ?? {
      x: Math.max(24, Math.min(width - 24, origin.x)),
      y: Math.max(top + 24, Math.min(bottom - 24, origin.y)),
    };
    // A lone market keeps the room it has for its name, so a market set
    // apart later cannot take it.
    const first = group[0];
    setDown(scene, group, p, single && free && first ? nameFor(first, p, scene) : null);
  };

  // A group of close markets, each tried on its own. The ones that do not
  // fit join their nearest neighbour and the group is laid out again; every
  // round joins at least two parts, so it ends — at worst as one cluster.
  const placeSplit = (scene: Scene, group: MarketPoint[]): Scene => {
    let parts = group.map((p) => [p]);
    while (parts.length > 1) {
      const trial: Scene = { placed: [...scene.placed], names: [...scene.names] };
      const failed: number[] = [];
      parts.forEach((part, i) => {
        const lone = part.length === 1 ? part[0] : undefined;
        if (!lone) placeGroup(trial, part);
        else if (!placeApart(trial, lone)) failed.push(i);
      });
      if (!failed.length) return trial;
      const root = parts.map((_, i) => i);
      const find = (i: number): number => {
        let r = i;
        while (root[r] !== r) r = root[r] ?? r;
        return r;
      };
      for (const i of failed) {
        const part = parts[i];
        if (!part) continue;
        let nearest = -1;
        let nearestD = Number.POSITIVE_INFINITY;
        parts.forEach((other, j) => {
          if (j === i) return;
          const d = groupDistance2(part, other);
          if (d < nearestD) {
            nearestD = d;
            nearest = j;
          }
        });
        if (nearest >= 0) root[find(i)] = find(nearest);
      }
      const joined = new Map<number, MarketPoint[]>();
      parts.forEach((part, i) => {
        const r = find(i);
        joined.set(r, [...(joined.get(r) ?? []), ...part]);
      });
      parts = [...joined.values()].map((part) => part.sort(byId));
    }
    placeGroup(scene, group);
    return scene;
  };

  let scene: Scene = { placed: [], names: [] };
  for (const group of groups) {
    if (split && group.length > 1) scene = placeSplit(scene, group);
    else placeGroup(scene, group);
  }
  return scene.placed;
}

/**
 * The resting layout, carried by the ground while the globe moves.
 *
 * `layoutMarketClusters` decides, per market, whether it stands alone or
 * shares a target, where its target sits and where its name goes — discrete
 * choices that a camera move of a few points can flip, and a swipe's rise
 * and fall changes every distance between cities. Run on every moving frame,
 * the markets jumped while the land and the stories slid (2026-09-26, the
 * user's report: "flickering so much when other content is stable"); in a
 * simulated story-to-story flight a market moved in 19 of 30 frames. So
 * `MiniGlobe` lays them out when the globe comes to rest, and while it moves
 * each mark keeps its arrangement — the same group, the same offset from its
 * city (or from its members' mean), the same name slot — and is laid out
 * again at the next rest, once, as the globe's detail sharpens on landing.
 *
 * A market out of view drops out of its mark; a cluster down to one market
 * puts it back on its own city. Markets the held layout never had are left
 * out: `MiniGlobe` lays those out once, around these, and holds them too.
 */
export function followMarketLayout(
  held: readonly MarketCluster[],
  points: readonly MarketPoint[],
  options: Pick<MarketLayoutOptions, 'width' | 'height' | 'top' | 'bottom'>,
): MarketCluster[] {
  const { width, height, top = 0, bottom = height } = options;
  const visible = new Map<string, MarketPoint>();
  for (const p of points) {
    if (p.x >= 0 && p.x <= width && p.y >= top && p.y <= bottom) visible.set(p.id, p);
  }
  const out: MarketCluster[] = [];
  for (const mark of held) {
    const group: MarketPoint[] = [];
    for (const id of mark.ids) {
      const p = visible.get(id);
      if (p) group.push(p);
    }
    const first = group[0];
    if (!first) continue;
    if (group.length === 1 && mark.ids.length > 1) {
      const lone = markOf(group, first);
      if (lone) out.push(lone);
      continue;
    }
    const origin = meanOf(group);
    const followed = markOf(
      group,
      { x: origin.x + (mark.x - mark.originX), y: origin.y + (mark.y - mark.originY) },
      mark.labelDy,
    );
    if (followed) out.push(followed);
  }
  return out;
}
