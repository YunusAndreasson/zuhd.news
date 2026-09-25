import {
  followMarketLayout,
  layoutMarketClusters,
  type MarketCluster,
  type MarketLabelRoom,
  type MarketPoint,
  marketTargetBox,
} from '../lib/market-map-layout';
const point = (
  id: string,
  x: number,
  y: number,
  direction: MarketPoint['direction'] = 'up',
): MarketPoint => ({ id, x, y, label: id, direction });
test('at the whole-planet zoom, nearby exchanges share one target without averaging away opposite directions', () => {
  const marks = layoutMarketClusters([point('a', 100, 100), point('b', 120, 100, 'down')], [], {
    width: 400,
    height: 700,
    split: false,
  });
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
  const marks = layoutMarketClusters([point('a', 100, 100), point('b', 180, 100, 'down')], [], {
    width: 400,
    height: 700,
  });
  expect(marks.map((m) => m.direction)).toEqual(['up', 'down']);
});
test('placement is deterministic, bounded, separates targets and avoids story targets', () => {
  const points = Array.from({ length: 30 }, (_, i) =>
    point(String(i), 25 + (i % 5) * 74, 100 + Math.floor(i / 5) * 64),
  );
  const obstacle = { x: 100, y: 200 };
  const options = { width: 400, height: 700, top: 70, bottom: 650 };
  const result = layoutMarketClusters(points, [obstacle], options);
  expect(layoutMarketClusters([...points].reverse(), [obstacle], options)).toEqual(result);
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
    layoutMarketClusters([point('hidden', 40, 10), point('shown', 100, 150)], [], {
      width: 400,
      height: 700,
      top: 70,
      bottom: 600,
    }).flatMap((m) => m.ids),
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
    { width: 400, height: 700 },
  );
  expect(apart.map((m) => m.move)).toEqual(['↑1.2%', '↓0.4%']);
  const together = layoutMarketClusters(
    [withMove('a', 100, '↑1.2%'), withMove('b', 120, '↓0.4%')],
    [],
    { width: 400, height: 700, split: false },
  );
  expect(together[0]?.move).toBeUndefined();
});
test("a single market's leader line never crosses the story's label", () => {
  // A story sits on the city, so the target moves; the first free spot to the
  // east would draw its leader through a sliver of the place label.
  const label = { x0: 225, x1: 228, y0: 190, y1: 210 };
  const [mark] = layoutMarketClusters([point('a', 200, 200)], [{ x: 200, y: 200 }], {
    width: 400,
    height: 700,
    boxes: [label],
  });
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
  const [mark] = layoutMarketClusters([point('a', 200, 200)], [], {
    width: 400,
    height: 700,
    boxes: [label],
  });
  expect(mark).toBeDefined();
  if (!mark) return;
  const nx = Math.max(label.x0, Math.min(label.x1, mark.x));
  const ny = Math.max(label.y0, Math.min(label.y1, mark.y));
  expect(Math.hypot(mark.x - nx, mark.y - ny)).toBeGreaterThanOrEqual(20);
});
test('a target stays on the planet, never in the space past its limb', () => {
  // A market on the limb with a story on it: the free spots outward are space.
  const disc = { x: 200, y: 200, r: 150 };
  const [mark] = layoutMarketClusters([point('a', 345, 200)], [{ x: 345, y: 200 }], {
    width: 400,
    height: 700,
    disc,
  });
  expect(mark).toBeDefined();
  if (!mark) return;
  expect(Math.hypot(mark.x - disc.x, mark.y - disc.y)).toBeLessThanOrEqual(disc.r - 24);
});

// A two-line name, 50pt wide, in the packer's four slots (`MiniGlobe`'s
// `MARK_LABEL_SLOTS`): clear under the target, clear over it, then tucked.
const names: MarketLabelRoom = {
  slots: (_, x, y) =>
    [32, -24, 20, -14].map((dy) => {
      const baseline = y + dy - (dy < 0 ? 15 : 0);
      return { dy, box: { x0: x - 25, x1: x + 25, y0: baseline - 10, y1: baseline + 18 } };
    }),
  avoid: [],
  glyphs: [],
  gap: 2,
};
const keptName = (m: MarketCluster) =>
  names.slots(m, m.x, m.y).find((slot) => slot.dy === m.labelDy)?.box;
const meet = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const leader = (m: MarketCluster) => ({ from: { x: m.originX, y: m.originY }, to: m });
const crosses = (a: ReturnType<typeof leader>, b: ReturnType<typeof leader>): boolean => {
  const side = (p: { x: number; y: number }, q: typeof p, r: typeof p) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return (
    side(b.from, b.to, a.from) * side(b.from, b.to, a.to) < 0 &&
    side(a.from, a.to, b.from) * side(a.from, a.to, b.to) < 0
  );
};

// New York and Toronto, Kuala Lumpur and Singapore: closer than a target at
// every story framing, and `2 markets` with the sea empty around them.
test('close exchanges each keep their own target, and name, where there is room', () => {
  const marks = layoutMarketClusters([point('a', 200, 300), point('b', 230, 290, 'down')], [], {
    width: 400,
    height: 700,
    label: names,
  });
  expect(marks.map((m) => m.ids)).toEqual([['a'], ['b']]);
  expect(marks.map((m) => m.direction)).toEqual(['up', 'down']);
  for (const m of marks) expect(m.labelDy).toBeDefined();
  const [a, b] = marks;
  if (!a || !b) return;
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(48);
  // One stays on its city; the other is joined to its own by a short line.
  expect(marks.some((m) => m.x === m.originX && m.y === m.originY)).toBe(true);
  for (const m of marks)
    expect(Math.hypot(m.x - m.originX, m.y - m.originY)).toBeLessThanOrEqual(72);
});

test('close exchanges share one target where their names have no room', () => {
  const marks = layoutMarketClusters([point('a', 200, 300), point('b', 230, 290, 'down')], [], {
    width: 400,
    height: 700,
    label: { ...names, slots: () => [] },
  });
  expect(marks).toHaveLength(1);
  expect(marks[0]).toMatchObject({ ids: ['a', 'b'], label: '2 markets', rising: 1, falling: 1 });
});

test('a crowded region is set apart as far as it fits, and nothing crosses', () => {
  // Western Europe at a story's framing, about 9pt a degree, with the story
  // in Brussels and its place named under it. It was one `6 markets`.
  const project = (lat: number, lng: number) => ({
    x: 196 + (lng - 6) * Math.cos((49 * Math.PI) / 180) * 9.2,
    y: 335 - (lat - 49) * 9.2,
  });
  const cities: [string, number, number][] = [
    ['lse', 51.5, -0.09],
    ['euronext-paris', 48.86, 2.35],
    ['euronext-amsterdam', 52.37, 4.9],
    ['xetra', 50.11, 8.68],
    ['six', 47.38, 8.54],
    ['borsa-italiana', 45.46, 9.19],
  ];
  const points = cities.map(([id, lat, lng]) => ({ ...point(id, 0, 0), ...project(lat, lng) }));
  const story = project(50.85, 4.35);
  const place = { x0: story.x - 40, x1: story.x + 40, y0: story.y + 10, y1: story.y + 44 };
  const options = {
    width: 393,
    height: 760,
    top: 110,
    bottom: 560,
    boxes: [place],
    label: { ...names, avoid: [place] },
  };
  const marks = layoutMarketClusters(points, [story], options);
  expect(layoutMarketClusters([...points].reverse(), [story], options)).toEqual(marks);

  expect(marks.flatMap((m) => m.ids).sort()).toEqual(cities.map(([id]) => id).sort());
  const lone = marks.filter((m) => m.ids.length === 1);
  expect(lone.length).toBeGreaterThanOrEqual(4);

  const leaders = lone.filter((m) => Math.hypot(m.x - m.originX, m.y - m.originY) > 2).map(leader);
  for (const m of marks) {
    for (const other of marks)
      if (other !== m) expect(Math.hypot(m.x - other.x, m.y - other.y)).toBeGreaterThanOrEqual(48);
    expect(Math.hypot(m.x - story.x, m.y - story.y)).toBeGreaterThanOrEqual(48);
  }
  for (const a of leaders) {
    expect(Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y)).toBeLessThanOrEqual(72.01);
    for (const b of leaders) if (b !== a) expect(crosses(a, b)).toBe(false);
  }
  // Every market set apart kept room for its name, clear of every target,
  // every other name and the story's place.
  for (const m of lone) {
    const name = keptName(m);
    expect(name).toBeDefined();
    if (!name) continue;
    expect(name.y0).toBeGreaterThanOrEqual(110);
    expect(name.y1).toBeLessThanOrEqual(560);
    expect(meet(name, place)).toBe(false);
    for (const other of marks) {
      expect(meet(name, marketTargetBox(other))).toBe(false);
      const otherName = other !== m && other.ids.length === 1 ? keptName(other) : undefined;
      if (otherName) expect(meet(name, otherName)).toBe(false);
    }
  }
});

// While the globe moves the markets keep the layout they had at rest: laid
// out on every frame, a swipe's rise and fall flipped groups, leaders and
// name slots, and the markets flickered while the land slid (2026-09-26).
describe('followMarketLayout', () => {
  const room = { width: 400, height: 700 };
  const moved = (points: MarketPoint[], k: number, dx: number, dy: number) =>
    points.map((p) => ({ ...p, x: 200 + (p.x - 200) * k + dx, y: 300 + (p.y - 300) * k + dy }));

  test('carries each mark with its city through a zooming move, arrangement and all', () => {
    const points = [
      point('a', 200, 300),
      point('b', 230, 290, 'down'),
      point('c', 120, 420),
      point('d', 135, 430),
    ];
    const rest = layoutMarketClusters(points, [], { ...room, label: names });
    // A swipe's rise: every distance shrinks by a fifth, and the camera slides.
    for (const [k, dx, dy] of [
      [0.9, 10, -5],
      [0.8, 25, -12],
      [0.9, 40, -20],
    ] as const) {
      const now = moved(points, k, dx, dy);
      const carried = followMarketLayout(rest, now, room);
      expect(carried.map((m) => m.ids)).toEqual(rest.map((m) => m.ids));
      carried.forEach((m, i) => {
        const was = rest[i];
        if (!was) return;
        expect(m.x - m.originX).toBeCloseTo(was.x - was.originX);
        expect(m.y - m.originY).toBeCloseTo(was.y - was.originY);
        expect(m.labelDy).toBe(was.labelDy);
      });
    }
  });

  test('drops a market that left the view, and a cluster down to one stands on its city', () => {
    const rest = layoutMarketClusters([point('a', 100, 100), point('b', 120, 100, 'down')], [], {
      ...room,
      split: false,
    });
    expect(rest.map((m) => m.ids)).toEqual([['a', 'b']]);
    const carried = followMarketLayout(rest, [point('a', 100, 100), point('b', -20, 100)], room);
    expect(carried).toHaveLength(1);
    expect(carried[0]).toMatchObject({ ids: ['a'], x: 100, y: 100, label: 'a', direction: 'up' });
    expect(carried[0]?.labelDy).toBeUndefined();
  });

  test('leaves out a market the held layout never had', () => {
    const rest = layoutMarketClusters([point('a', 100, 100)], [], room);
    const carried = followMarketLayout(rest, [point('a', 110, 100), point('new', 300, 300)], room);
    expect(carried.flatMap((m) => m.ids)).toEqual(['a']);
  });
});
