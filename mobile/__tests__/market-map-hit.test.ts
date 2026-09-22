import { marketHitDistanceSquared } from '../lib/market-map-layout';

describe('market labels and circles share a selection target', () => {
  const nikkei = {
    x: 303.7466,
    y: 325.6661,
    labelBounds: { x0: 278, x1: 330, y0: 276, y1: 306 },
  };

  it('selects a label packed above its circle instead of the country underneath', () => {
    expect(Number.isFinite(marketHitDistanceSquared(nikkei, 303.7466, 281.6661))).toBe(true);
    expect(Number.isFinite(marketHitDistanceSquared(nikkei, 280, 300))).toBe(true);
    expect(marketHitDistanceSquared(nikkei, 304, 291)).toBe(0);
  });

  it('lets a precisely tapped story dot beat an overlapping label edge', () => {
    const market = { x: 239.3, y: 410, labelBounds: { x0: 218, x1: 260.6, y0: 432.8, y1: 460.8 } };
    const storyDistanceSquared = 0.02;
    expect(marketHitDistanceSquared(market, 231.9, 439.2)).toBeGreaterThan(storyDistanceSquared);
  });

  it('keeps the existing 24-point circle target without swallowing nearby points', () => {
    expect(marketHitDistanceSquared(nikkei, nikkei.x + 24, nikkei.y)).toBe(576);
    expect(marketHitDistanceSquared(nikkei, nikkei.x + 25, nikkei.y)).toBe(Infinity);
    expect(marketHitDistanceSquared(nikkei, 275, 281)).toBe(Infinity);
  });

  it('does not leave an invisible target when a label is suppressed', () => {
    expect(marketHitDistanceSquared({ ...nikkei, labelBounds: null }, 303.7466, 281.6661)).toBe(
      Infinity,
    );
  });

  it('keeps multiple overlapping labels eligible for the existing chooser', () => {
    const second = { ...nikkei, x: 370, labelBounds: { x0: 315, x1: 380, y0: 276, y1: 306 } };
    expect(
      [nikkei, second].filter((m) => Number.isFinite(marketHitDistanceSquared(m, 320, 280))),
    ).toHaveLength(2);
  });
});
