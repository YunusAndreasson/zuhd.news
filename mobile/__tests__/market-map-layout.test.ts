import { layoutMarketClusters, type MarketPoint } from '../lib/market-map-layout';
const point = (
  id: string,
  x: number,
  y: number,
  direction: MarketPoint['direction'] = 'up',
): MarketPoint => ({ id, x, y, label: id, direction });
test('nearby exchanges share one target without averaging away opposite directions', () => {
  const marks = layoutMarketClusters(
    [point('a', 100, 100), point('b', 120, 100, 'down')],
    [],
    400,
    700,
  );
  expect(marks).toHaveLength(1);
  expect(marks[0]).toMatchObject({
    ids: ['a', 'b'],
    rising: 1,
    falling: 1,
    label: '2 markets',
    direction: undefined,
  });
});
test('zoomed apart exchanges split and keep their directions', () => {
  const marks = layoutMarketClusters(
    [point('a', 100, 100), point('b', 180, 100, 'down')],
    [],
    400,
    700,
  );
  expect(marks.map((m) => m.direction)).toEqual(['up', 'down']);
});
test('placement is deterministic, bounded, separates targets and avoids story targets', () => {
  const points = Array.from({ length: 30 }, (_, i) =>
    point(String(i), 25 + (i % 5) * 74, 100 + Math.floor(i / 5) * 64),
  );
  const obstacle = { x: 100, y: 200 };
  const result = layoutMarketClusters(points, [obstacle], 400, 700, 70, 650);
  expect(layoutMarketClusters([...points].reverse(), [obstacle], 400, 700, 70, 650)).toEqual(
    result,
  );
  expect(result.flatMap((m) => m.ids).sort()).toEqual(points.map((p) => p.id).sort());
  for (const m of result) {
    expect(m.x).toBeGreaterThanOrEqual(24);
    expect(m.x).toBeLessThanOrEqual(376);
    expect(m.y).toBeGreaterThanOrEqual(94);
    expect(m.y).toBeLessThanOrEqual(626);
    expect(Math.hypot(m.x - obstacle.x, m.y - obstacle.y)).toBeGreaterThanOrEqual(48);
    for (const other of result)
      if (other !== m) expect(Math.hypot(m.x - other.x, m.y - other.y)).toBeGreaterThanOrEqual(48);
  }
});
test('viewport excludes markers behind chrome and beyond the visible map', () => {
  expect(
    layoutMarketClusters(
      [point('hidden', 40, 10), point('shown', 100, 150)],
      [],
      400,
      700,
      70,
      600,
    ).flatMap((m) => m.ids),
  ).toEqual(['shown']);
});
test('a lone market keeps its move for the second line; a cluster carries none', () => {
  const withMove = (id: string, x: number, move: string): MarketPoint => ({
    ...point(id, x, 100),
    move,
  });
  const apart = layoutMarketClusters(
    [withMove('a', 100, '↑1.2%'), withMove('b', 300, '↓0.4%')],
    [],
    400,
    700,
  );
  expect(apart.map((m) => m.move)).toEqual(['↑1.2%', '↓0.4%']);
  const together = layoutMarketClusters(
    [withMove('a', 100, '↑1.2%'), withMove('b', 120, '↓0.4%')],
    [],
    400,
    700,
  );
  expect(together[0]?.move).toBeUndefined();
});
test("a single market's leader line never crosses the story's label", () => {
  // A story sits on the city, so the target moves; the first free spot to the
  // east would draw its leader through a sliver of the place label.
  const label = { x0: 225, x1: 228, y0: 190, y1: 210 };
  const [mark] = layoutMarketClusters(
    [point('a', 200, 200)],
    [{ x: 200, y: 200 }],
    400,
    700,
    0,
    700,
    [label],
  );
  expect(mark).toBeDefined();
  if (!mark) return;
  expect(mark.x === 248 && mark.y === 200).toBe(false);
  // Sample the leader: no point of it lies inside the label.
  for (let t = 0; t <= 1; t += 0.02) {
    const x = mark.originX + (mark.x - mark.originX) * t;
    const y = mark.originY + (mark.y - mark.originY) * t;
    expect(x >= label.x0 && x <= label.x1 && y >= label.y0 && y <= label.y1).toBe(false);
  }
});
test("a target is never set on the story's label", () => {
  const label = { x0: 150, x1: 260, y0: 180, y1: 215 };
  const [mark] = layoutMarketClusters([point('a', 200, 200)], [], 400, 700, 0, 700, [label]);
  expect(mark).toBeDefined();
  if (!mark) return;
  const nx = Math.max(label.x0, Math.min(label.x1, mark.x));
  const ny = Math.max(label.y0, Math.min(label.y1, mark.y));
  expect(Math.hypot(mark.x - nx, mark.y - ny)).toBeGreaterThanOrEqual(20);
});
test('a target stays on the planet, never in the space past its limb', () => {
  // A market on the limb with a story on it: the free spots outward are space.
  const disc = { x: 200, y: 200, r: 150 };
  const [mark] = layoutMarketClusters(
    [point('a', 345, 200)],
    [{ x: 345, y: 200 }],
    400,
    700,
    0,
    700,
    [],
    disc,
  );
  expect(mark).toBeDefined();
  if (!mark) return;
  expect(Math.hypot(mark.x - disc.x, mark.y - disc.y)).toBeLessThanOrEqual(disc.r - 24);
});
