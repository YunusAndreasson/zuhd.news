/** Screen-space clustering: every market survives, close neighbours share a target. */
export interface MarketPoint {
  id: string;
  x: number;
  y: number;
  label: string;
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
const distance2 = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export function layoutMarketClusters(
  points: MarketPoint[],
  obstacles: { x: number; y: number }[],
  width: number,
  height: number,
  top = 0,
  bottom = height,
): MarketCluster[] {
  const sorted = [...points]
    .filter((p) => p.x >= 0 && p.x <= width && p.y >= top && p.y <= bottom)
    .sort((a, b) => a.id.localeCompare(b.id));
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
    const free = candidates.find(
      (p) =>
        p.x >= 24 &&
        p.x <= width - 24 &&
        p.y >= top + 24 &&
        p.y <= bottom - 24 &&
        [...obstacles, ...placed].every((other) => distance2(p, other) >= MARKET_TARGET ** 2),
    );
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
      direction: group.length === 1 ? first.direction : undefined,
    });
  }
  return placed;
}
