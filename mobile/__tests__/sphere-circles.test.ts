import {
  type GeoPermissibleObjects,
  geoCircle,
  geoDistance,
  geoOrthographic,
  geoPath,
} from 'd3-geo';
import {
  type ConicSink,
  capFill,
  graticuleLines,
  orthoView,
  SCREEN_POINT,
  screenPoint,
  unit,
} from '../components/globe/sphere-circles';
import { reachFor, viewAngleFor } from '../lib/globe-camera';

type Pt = [number, number];
/** Subpaths as polylines; `closed` rings get their closing segment. */
type Poly = { pts: Pt[]; closed: boolean }[];

/** What d3 draws, finely resampled, as polylines. */
function d3Polylines(
  object: GeoPermissibleObjects,
  lng: number,
  lat: number,
  k: number,
  clip = 90,
): Poly {
  const out: Poly = [];
  const proj = geoOrthographic()
    .clipAngle(clip)
    .precision(0.1)
    .rotate([-lng, -lat, 0])
    .scale(k)
    .translate([200, 300]);
  geoPath(proj, {
    beginPath() {},
    moveTo: (x, y) => out.push({ pts: [[x, y]], closed: false }),
    lineTo: (x, y) => out[out.length - 1]?.pts.push([x, y]),
    arc() {
      throw new Error('unexpected arc');
    },
    closePath: () => {
      const last = out[out.length - 1];
      if (last) last.closed = true;
    },
  })(object);
  return out;
}

/** A sink that flattens every conic finely, for comparison. */
function flatSink(): { sink: ConicSink; out: Poly } {
  const out: Poly = [];
  const last = () => out[out.length - 1]?.pts;
  const sink: ConicSink = {
    moveTo: (x, y) => out.push({ pts: [[x, y]], closed: false }),
    lineTo: (x, y) => last()?.push([x, y]),
    conicTo(x1, y1, x2, y2, w) {
      const pts = last();
      const p0 = pts?.[pts.length - 1];
      if (!pts || !p0) throw new Error('conic without a start');
      for (let i = 1; i <= 64; i++) {
        const t = i / 64;
        const a = (1 - t) * (1 - t);
        const b = 2 * w * t * (1 - t);
        const c = t * t;
        const d = a + b + c;
        pts.push([(a * p0[0] + b * x1 + c * x2) / d, (a * p0[1] + b * y1 + c * y2) / d]);
      }
    },
    close: () => {
      const l = out[out.length - 1];
      if (l) l.closed = true;
    },
  };
  return { sink, out };
}

function segments(poly: Poly): [Pt, Pt][] {
  const segs: [Pt, Pt][] = [];
  for (const { pts, closed } of poly) {
    for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1] as Pt, pts[i] as Pt]);
    if (closed && pts.length > 1) segs.push([pts[pts.length - 1] as Pt, pts[0] as Pt]);
  }
  return segs;
}

/** Segments bucketed on a coarse grid, for nearest-segment queries. */
class SegIndex {
  private cells = new Map<number, [Pt, Pt][]>();
  private cell: number;
  constructor(segs: [Pt, Pt][], cell = 3) {
    this.cell = cell;
    for (const s of segs) {
      const [a, b] = s;
      const x0 = Math.floor(Math.min(a[0], b[0]) / cell);
      const x1 = Math.floor(Math.max(a[0], b[0]) / cell);
      const y0 = Math.floor(Math.min(a[1], b[1]) / cell);
      const y1 = Math.floor(Math.max(a[1], b[1]) / cell);
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const key = x * 65536 + y;
          const list = this.cells.get(key);
          if (list) list.push(s);
          else this.cells.set(key, [s]);
        }
      }
    }
  }
  /** Distance to the nearest segment, exact up to one cell; farther reads as Infinity. */
  dist(p: Pt): number {
    const cx = Math.floor(p[0] / this.cell);
    const cy = Math.floor(p[1] / this.cell);
    let best = Number.POSITIVE_INFINITY;
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        const list = this.cells.get(x * 65536 + y);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const seg = list[i] as [Pt, Pt];
          const a = seg[0];
          const b = seg[1];
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const l2 = dx * dx + dy * dy;
          let t = l2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = p[0] - a[0] - t * dx;
          const ey = p[1] - a[1] - t * dy;
          const d2 = ex * ex + ey * ey;
          if (d2 < best) best = d2;
        }
      }
    }
    return Math.sqrt(best);
  }
}

/** Symmetric Hausdorff distance between two drawings, over points that pass `keep`. */
function hausdorff(a: Poly, b: Poly, keep: (p: Pt) => boolean = () => true): number {
  const ia = new SegIndex(segments(a));
  const ib = new SegIndex(segments(b));
  let worst = 0;
  for (const { pts } of a) for (const p of pts) if (keep(p)) worst = Math.max(worst, ib.dist(p));
  for (const { pts } of b) for (const p of pts) if (keep(p)) worst = Math.max(worst, ia.dist(p));
  return worst;
}

/** Nonzero winding of `p` against every closed ring. */
function inside(poly: Poly, p: Pt): boolean {
  const px = p[0];
  const py = p[1];
  let wind = 0;
  for (let r = 0; r < poly.length; r++) {
    const pts = (poly[r] as Poly[number]).pts;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i] as Pt;
      const b = pts[i + 1 === n ? 0 : i + 1] as Pt;
      const side = (b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1]);
      if (a[1] <= py) {
        if (b[1] > py && side > 0) wind++;
      } else if (b[1] <= py && side < 0) {
        wind--;
      }
    }
  }
  return wind !== 0;
}

/** Deterministic pseudo-random cameras. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
const rand = lcg(7);
const CAMERAS: [number, number][] = [
  [0, 0],
  [0, 82],
  [0, -82],
  [-179.9, 10],
  [180, -30],
  [39.8, 21.4],
  [-0.13, 51.5],
];
for (let i = 0; i < 25; i++) CAMERAS.push([rand() * 360 - 180, rand() * 164 - 82]);
const SCALES = [150, 290, 900];

describe('graticuleLines', () => {
  // The true lines, walked finely enough that d3's great-circle chords sit on
  // them. `GRATICULE_LINES` walks parallels at 5°, and a 5° chord of a
  // parallel bows poleward off it — 0.4 px at 60°N once zoomed in — which is
  // an error of the old drawing, not a shape to match.
  const fine = (step: number): GeoJSON.MultiLineString => {
    const coordinates: [number, number][][] = [];
    for (let lng = -180; lng < 180; lng += 30) {
      const line: [number, number][] = [];
      for (let lat = -85; lat <= 85; lat += step) line.push([lng, lat]);
      coordinates.push(line);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const line: [number, number][] = [];
      for (let lng = -180; lng <= 180; lng += step) line.push([lng, lat]);
      coordinates.push(line);
    }
    return { type: 'MultiLineString', coordinates };
  };
  const polar = (lat: number): GeoJSON.LineString => ({
    type: 'LineString',
    coordinates: geoCircle().center([0, lat]).radius(23.44).precision(0.5)().coordinates[0] ?? [],
  });
  const lines: GeoPermissibleObjects = {
    type: 'GeometryCollection',
    geometries: [fine(0.5), polar(90), polar(-90)],
  };

  it.each(SCALES)('matches d3 within a fifth of a pixel at scale %d', (k) => {
    for (const [lng, lat] of CAMERAS) {
      const { sink, out } = flatSink();
      graticuleLines(sink, orthoView(lng, lat, k, 200, 300));
      const ref = d3Polylines(lines, lng, lat, k);
      expect(hausdorff(out, ref)).toBeLessThan(0.2);
    }
  });

  it('is a few dozen curves, not a thousand points', () => {
    let calls = 0;
    const count = () => {
      calls++;
    };
    graticuleLines(
      { moveTo: count, lineTo: count, conicTo: count, close: count },
      orthoView(20, 30, 290, 200, 300),
    );
    expect(calls).toBeLessThan(120);
  });

  it('agrees with d3 on screen when d3 clips inside the horizon', () => {
    // Zoomed past the screen, MiniGlobe clips d3 at the view angle; these
    // curves stop at the horizon instead, which lies off the canvas.
    const k = 150 / Math.sin((12 * Math.PI) / 180);
    const reach = reachFor(200, 300, 411, 700);
    const view = viewAngleFor(k, reach);
    expect(view).toBeLessThan(90);
    for (const [lng, lat] of CAMERAS) {
      const { sink, out } = flatSink();
      graticuleLines(sink, orthoView(lng, lat, k, 200, 300));
      const ref = d3Polylines(lines, lng, lat, k, view);
      const onScreen = (p: Pt) => Math.hypot(p[0] - 200, p[1] - 300) < reach - 1;
      expect(hausdorff(out, ref, onScreen)).toBeLessThan(0.2);
    }
  });
});

describe('capFill', () => {
  // Day and night are hemispheres; twilight is 96°; the rest cover small caps,
  // caps past a hemisphere, and the case where the whole rim is on the near side.
  const RADII = [90, 96, 23.44, 140, 5];
  const centers: [number, number][] = [];
  const r2 = lcg(11);
  for (let i = 0; i < 5; i++) centers.push([r2() * 360 - 180, r2() * 180 - 90]);

  it('draws the boundary d3 draws, within a fifth of a pixel', () => {
    for (const [lng, lat] of CAMERAS.slice(0, 8)) {
      for (const k of [150, 290]) {
        for (const c of centers) {
          for (const radius of RADII) {
            const { sink, out } = flatSink();
            capFill(sink, orthoView(lng, lat, k, 200, 300), c[0], c[1], radius);
            const ring = geoCircle().center(c).radius(radius).precision(0.5)();
            const ref = d3Polylines(ring, lng, lat, k);
            expect(hausdorff(out, ref)).toBeLessThan(0.2);
          }
        }
      }
    }
  });

  it('fills the same pixels as d3, holes included', () => {
    const grid: Pt[] = [];
    for (let x = 40; x <= 360; x += 20) for (let y = 140; y <= 460; y += 20) grid.push([x, y]);
    for (const [lng, lat] of CAMERAS.slice(0, 6)) {
      for (const c of centers.slice(0, 4)) {
        for (const radius of RADII) {
          const { sink, out } = flatSink();
          capFill(sink, orthoView(lng, lat, 150, 200, 300), c[0], c[1], radius);
          const ring = geoCircle().center(c).radius(radius).precision(0.5)();
          const ref = d3Polylines(ring, lng, lat, 150);
          const refIndex = new SegIndex(segments(ref));
          for (const p of grid) {
            // Skip pixels on the boundary itself, where AA decides.
            if (refIndex.dist(p) < 1) continue;
            expect(inside(out, p)).toBe(inside(ref, p));
          }
        }
      }
    }
  });

  it('covers the whole disc when the cap holds the near side, and nothing when it is behind', () => {
    const view = orthoView(0, 0, 150, 200, 300);
    const full = flatSink();
    capFill(full.sink, view, 0, 0, 120);
    expect(inside(full.out, [200, 300])).toBe(true);
    expect(inside(full.out, [200 + 149, 300])).toBe(true);
    const none = flatSink();
    capFill(none.sink, view, 180, 0, 60);
    expect(none.out).toHaveLength(0);
  });
});

describe('screenPoint', () => {
  it('culls and places a point exactly as geoDistance and d3 do', () => {
    const r = lcg(3);
    for (const [lng, lat] of CAMERAS) {
      for (const k of SCALES) {
        const clip = 20 + r() * 70;
        const clipRad = (clip * Math.PI) / 180;
        const view = orthoView(lng, lat, k, 200, 300);
        const proj = geoOrthographic().rotate([-lng, -lat, 0]).scale(k).translate([200, 300]);
        for (let i = 0; i < 40; i++) {
          const p: [number, number] = [r() * 360 - 180, r() * 180 - 90];
          const d = geoDistance(p, [lng, lat]);
          // Skip the boundary itself, where the two roundings may differ.
          if (Math.abs(d - clipRad) < 1e-9) continue;
          const u = unit(p[0], p[1]);
          const seen = screenPoint(view, u[0], u[1], u[2], Math.cos(clipRad));
          expect(seen).toBe(d < clipRad);
          if (!seen) continue;
          const q = proj(p) as [number, number];
          expect(SCREEN_POINT[0]).toBeCloseTo(q[0], 6);
          expect(SCREEN_POINT[1]).toBeCloseTo(q[1], 6);
        }
      }
    }
  });
});
