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
