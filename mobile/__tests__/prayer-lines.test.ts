import { prayerRuns } from '@shared/prayer';
import {
  emitPrayerLines,
  invalidatePrayerLines,
  prayerLabelAnchors,
  prayerLinesNow,
} from '../components/globe/prayer-lines';
import { orthoView, SCREEN_POINT, screenPoint } from '../components/globe/sphere-circles';

const AT = Date.UTC(2026, 9, 17, 20, 15);

describe('the prayer lines on the globe', () => {
  beforeEach(() => invalidatePrayerLines());

  it('are the shared curves, sample for sample, as unit vectors', () => {
    const lines = prayerLinesNow(AT);
    const shared = prayerRuns(new Date(AT));
    expect(lines.map((l) => l.id)).toEqual(shared.map((p) => p.id));
    for (const [i, line] of lines.entries()) {
      const runs = shared[i]?.runs ?? [];
      expect(line.runs.map((r) => r.length / 3)).toEqual(runs.map((r) => r.length));
      for (const [j, run] of line.runs.entries()) {
        for (let k = 0; k < run.length; k += 3) {
          const s = runs[j]?.[k / 3];
          if (!s) throw new Error('missing sample');
          const lat = (Math.asin(run[k + 2] ?? 0) * 180) / Math.PI;
          const lng = (Math.atan2(run[k + 1] ?? 0, run[k] ?? 0) * 180) / Math.PI;
          expect(lat).toBeCloseTo(s.lat, 9);
          expect(((lng - s.lng + 540) % 360) - 180).toBeCloseTo(0, 9);
        }
      }
    }
  });

  it('are solved once a minute, not every frame', () => {
    const first = prayerLinesNow(AT);
    expect(prayerLinesNow(AT + 59_000)).toBe(first);
    expect(prayerLinesNow(AT + 60_000)).not.toBe(first);
  });

  it('draw only what faces the camera, and break where a line goes behind', () => {
    const lines = prayerLinesNow(AT);
    // Looking at the Pacific at 20:15 UTC: every line reaches toward the poles,
    // so each shows somewhere, but most of their length is behind the earth.
    const view = orthoView(170, 10, 200, 200, 200);
    const clipCos = Math.cos((89 * Math.PI) / 180);
    const ops: string[] = [];
    const placed: [number, number][] = [];
    const out = emitPrayerLines(lines, (x, y, z) => screenPoint(view, x, y, z, clipCos), {
      moveTo: (x, y) => {
        ops.push('M');
        placed.push([x, y]);
      },
      lineTo: (x, y) => {
        ops.push('L');
        placed.push([x, y]);
      },
    });
    const samples = lines.reduce((n, l) => n + l.runs.reduce((m, r) => m + r.length / 3, 0), 0);
    expect(out.length).toBeGreaterThan(0);
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBeLessThan(samples);
    // Every placed point is on the disc.
    for (const [x, y] of placed) expect(Math.hypot(x - 200, y - 200)).toBeLessThanOrEqual(200.001);
    // Each subpath opens with a move.
    expect(ops[0]).toBe('M');
    // Candidates are the placed points, in order.
    expect(out.flatMap((c) => c.points)).toEqual(placed.flat());
    expect(SCREEN_POINT).toHaveLength(2);
  });

  it('offers a name nearest the centre first, spread along the line', () => {
    const points = [0, 0, 10, 10, 50, 50, 90, 90, 100, 100];
    const anchors = prayerLabelAnchors(points, 50, 50, 3);
    expect(anchors[0]).toEqual({ x: 50, y: 50 });
    expect(anchors).toHaveLength(3);
    expect(prayerLabelAnchors([], 0, 0, 3)).toEqual([]);
  });
});
