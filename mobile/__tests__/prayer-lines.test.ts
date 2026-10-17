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

  it('are the shared curves, thinned, within a pixel of every sample dropped', () => {
    const lines = prayerLinesNow(AT);
    const shared = prayerRuns(new Date(AT));
    expect(lines.map((l) => l.id)).toEqual(shared.map((p) => p.id));
    // The planet 6,000 px across: past the deepest story framing.
    const RADIUS_PX = 3000;
    let before = 0;
    let after = 0;
    for (const [i, line] of lines.entries()) {
      const runs = shared[i]?.runs ?? [];
      expect(line.runs).toHaveLength(runs.length);
      for (const [j, kept] of line.runs.entries()) {
        const samples = (runs[j] ?? []).map((s) => {
          const lat = (s.lat * Math.PI) / 180;
          const lng = (s.lng * Math.PI) / 180;
          return [Math.cos(lat) * Math.cos(lng), Math.cos(lat) * Math.sin(lng), Math.sin(lat)];
        });
        before += samples.length;
        after += kept.length / 3;
        // Each kept point is a shared sample, in order, and both ends are kept.
        const at: number[] = [];
        let from = 0;
        for (let k = 0; k < kept.length; k += 3) {
          const idx = samples.findIndex(
            (u, n) =>
              n >= from &&
              Math.abs((u[0] ?? 0) - (kept[k] ?? 0)) < 1e-12 &&
              Math.abs((u[1] ?? 0) - (kept[k + 1] ?? 0)) < 1e-12 &&
              Math.abs((u[2] ?? 0) - (kept[k + 2] ?? 0)) < 1e-12,
          );
          expect(idx).toBeGreaterThanOrEqual(from);
          at.push(idx);
          from = idx + 1;
        }
        expect(at[0]).toBe(0);
        expect(at[at.length - 1]).toBe(samples.length - 1);
        // A dropped sample lies within a pixel of its chord's great circle.
        for (let m = 1; m < at.length; m++) {
          const a = samples[at[m - 1] ?? 0] ?? [0, 0, 0];
          const b = samples[at[m] ?? 0] ?? [0, 0, 0];
          const n = [
            (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
            (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
            (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
          ];
          const len = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) || 1;
          for (let d = (at[m - 1] ?? 0) + 1; d < (at[m] ?? 0); d++) {
            const s = samples[d] ?? [0, 0, 0];
            const off = Math.abs(
              ((s[0] ?? 0) * (n[0] ?? 0) + (s[1] ?? 0) * (n[1] ?? 0) + (s[2] ?? 0) * (n[2] ?? 0)) /
                len,
            );
            expect(Math.asin(off) * RADIUS_PX).toBeLessThan(1);
          }
        }
      }
    }
    expect(after).toBeLessThan(before / 2);
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
