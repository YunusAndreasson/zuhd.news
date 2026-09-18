/**
 * The orthographic path pipeline, without the trigonometry.
 *
 * d3-geo streams every vertex of every part through six stages a frame:
 * degrees to radians, a rotation that takes two `atan2`/`asin` and four
 * `sin`/`cos`, a clip test that takes two more, the projection's own two, and a
 * `[λ, φ]` array allocated between each. Land and borders through that path
 * were 86% of a moving frame on the emulator, and a settled frame's 27k
 * vertices were the stall on every swipe landing.
 *
 * None of the trigonometry is a function of the frame. A vertex's position is
 * fixed, so its unit vector is computed once when the layer is built; a frame
 * is then a 3×3 rotation of each (nine multiplications), one comparison against
 * the cosine of the clip angle, and two multiply-adds to place it on screen —
 * the same view arithmetic `sphere-circles.ts` uses (`OrthoView`).
 *
 * What this does not skip is the part of d3's pipeline that makes the drawing
 * right: an edge that crosses the horizon is cut at the exact intersection,
 * the visible runs of a ring are stitched back together along the limb in the
 * order they meet it (d3's `clipRejoin`), a polygon that holds the whole view
 * is drawn as the disc, and long edges are resampled into the curves they are
 * on the sphere (d3's `resample`). Each of those is ported so that the path
 * commands come out the same as d3's — `__tests__/ortho-stream.test.ts` holds
 * every layer the globe draws to within a millionth of a pixel of d3 across
 * cameras, clips and precisions — with the spherical arithmetic replaced by
 * its cartesian equivalent. Trigonometry is left where a frame needs a handful
 * of values: the limb's 2° steps, and the degenerate-point checks d3 phrases
 * in longitude and latitude, taken only when two points are within a
 * millionth of a radian.
 *
 * Conventions match `MiniGlobe`'s `geoOrthographic().rotate([-lng, -lat, 0])
 * .scale(k).translate([tx, ty]).clipAngle(clip).precision(p)`. The clip is a
 * cap about the view axis, at most a hemisphere (`viewAngleFor` never asks
 * for more); a wider clip is drawn as a hemisphere.
 */

import { geoArea, geoContains } from 'd3-geo';
import type { OrthoView } from './sphere-circles';

const DEG2RAD = Math.PI / 180;
const PI = Math.PI;
const HALF_PI = PI / 2;
const TAU = 2 * PI;
/** d3's `epsilon`, in radians. */
const EPS = 1e-6;
/** d3's `circleStream` step along the limb: 2°. */
const LIMB_STEP = 2 * DEG2RAD;
/** d3's resampling limits. */
const MAX_DEPTH = 16;
const COS_MIN_DISTANCE = Math.cos(30 * DEG2RAD);
/** Slack on the cap cull, as `cap-cull.ts` has it: far below a pixel, only
 *  there so rounding cannot drop a part grazing the cone. */
const CULL_MARGIN = 1e-6;

/** Where the paths go — a Skia `SkPathBuilder` satisfies it. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  close(): void;
}

export interface OrthoLayer {
  /**
   * Draw the layer as `view` sees it, clipped `clipAngleDeg` from the camera,
   * resampled to `precisionPx` (0 for straight chords), into `sink`.
   */
  draw(view: OrthoView, clipAngleDeg: number, precisionPx: number, sink: PathSink): void;
  /** Polygons plus lines the layer holds. */
  readonly partCount: number;
  /**
   * The input minus every part wholly outside the view cone, for a caller
   * that still streams through d3. The returned object is reused by the next
   * call — `cap-cull.ts`'s contract, kept for the tests that share it.
   */
  visible(camLng: number, camLat: number, clipAngleDeg: number): GeoJSON.Geometry;
}

// ── Layer data ─────────────────────────────────────────────────────────────

interface Ring {
  /** `[x, y, z, x, y, z, …]`, one unit vector per vertex, closing vertex dropped. */
  u: Float64Array;
  n: number;
}

interface Cap {
  x: number;
  y: number;
  z: number;
  /** Angular radius, radians. `Math.PI` never culls. */
  radius: number;
}

interface PolygonPart extends Cap {
  rings: Ring[];
  coords: GeoJSON.Position[][];
  /** Whether the polygon contains `REF` / `REF2`, found the first time it matters. */
  refInside: boolean | null;
  refInside2: boolean | null;
}

interface LinePart extends Cap {
  u: Float64Array;
  n: number;
  coords: GeoJSON.Position[];
}

/**
 * A fixed reference point for the containment test below, in the South
 * Pacific — an ocean point no coastline or border passes through, so the arc
 * from it to a query point crosses a ring's edges transversally. A second,
 * far from the first, for a query point near its antipode.
 */
const REF: [number, number] = [-150, -40];
const REF2: [number, number] = [60, 40];
const REF_U = unitOf(REF[0], REF[1]);
const REF2_U = unitOf(REF2[0], REF2[1]);

function unitOf(lng: number, lat: number): [number, number, number] {
  const l = lng * DEG2RAD;
  const p = lat * DEG2RAD;
  const c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}

function unitsOf(points: GeoJSON.Position[], n: number): Float64Array {
  const u = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const l = (p?.[0] ?? 0) * DEG2RAD;
    const f = (p?.[1] ?? 0) * DEG2RAD;
    const c = Math.cos(f);
    u[i * 3] = c * Math.cos(l);
    u[i * 3 + 1] = c * Math.sin(l);
    u[i * 3 + 2] = Math.sin(f);
  }
  return u;
}

/** The bounding cap of a set of unit vectors: their mean direction and the
 *  widest angle from it. A cap of a hemisphere or more never culls. */
function capOf(units: Float64Array[]): Cap {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const u of units) {
    for (let i = 0; i < u.length; i += 3) {
      sx += u[i] as number;
      sy += u[i + 1] as number;
      sz += u[i + 2] as number;
    }
  }
  const norm = Math.hypot(sx, sy, sz);
  if (norm < 1e-9) return { x: 0, y: 0, z: 1, radius: PI };
  sx /= norm;
  sy /= norm;
  sz /= norm;
  let minDot = 1;
  for (const u of units) {
    for (let i = 0; i < u.length; i += 3) {
      const d = (u[i] as number) * sx + (u[i + 1] as number) * sy + (u[i + 2] as number) * sz;
      if (d < minDot) minDot = d;
    }
  }
  const radius = Math.acos(Math.max(-1, Math.min(1, minDot)));
  return { x: sx, y: sy, z: sz, radius: radius >= HALF_PI ? PI : radius };
}

// ── Per-frame state ────────────────────────────────────────────────────────
//
// One draw at a time; the state lives at module level so the hot loops close
// over nothing and allocate nothing per vertex.

// The view: rotation rows, scale, translation.
let ax = 0;
let ay = 0;
let az = 0;
let bx = 0;
let by = 0;
let bz = 0;
let cx = 0;
let cy = 0;
let cz = 0;
let k = 1;
let tx = 0;
let ty = 0;
// The clip.
let clipRad = HALF_PI;
let cr = 0;
let sr = 1;
let tanR = 0;
let notHemisphere = false;
// The resampling.
let delta2 = 0;
let out: PathSink = { moveTo() {}, lineTo() {}, close() {} };

/**
 * Clipped points, as `(a, b, c)` in the rotated frame, in one growable buffer.
 * A segment is a range of it. `segEndFlag` marks a segment's last point the way
 * d3 marks an exit intersection (`2`), which its rejoin reads in a degenerate
 * case.
 */
let seg = new Float64Array(3 * 4096);
let segLen = 0;
const segStart: number[] = [];
const segEnd: number[] = [];
const segEndFlag: number[] = [];
const polygonSegments: number[] = [];

function pushPoint(a: number, b: number, c: number) {
  if (segLen + 3 > seg.length) {
    const grown = new Float64Array(seg.length * 2);
    grown.set(seg);
    seg = grown;
  }
  seg[segLen++] = a;
  seg[segLen++] = b;
  seg[segLen++] = c;
}

// ── The emitter: resample, project, draw ───────────────────────────────────
//
// d3's `resample` stage as a ring or line sink over rotated cartesian points.

let emitFirst = true;
let emitRing = false;
let x0 = 0;
let y0 = 0;
let a0 = 0;
let b0 = 0;
let c0 = 0;
// The equatorial direction of the previous point (cos λ, sin λ), for the one
// place d3's resampling reads a longitude: two points on the same meridian.
let e0a = 1;
let e0b = 0;
let x00 = 0;
let y00 = 0;
let a00 = 0;
let b00 = 0;
let c00 = 0;
let e00a = 1;
let e00b = 0;

function emitStart(ring: boolean) {
  emitFirst = true;
  emitRing = ring;
}

function emitPoint(a: number, b: number, c: number) {
  const x = tx + k * b;
  const y = ty - k * c;
  let ea = 1;
  let eb = 0;
  if (delta2 > 0) {
    const rho = Math.sqrt(a * a + b * b);
    if (rho > 0) {
      ea = a / rho;
      eb = b / rho;
    }
  }
  if (emitFirst) {
    emitFirst = false;
    out.moveTo(x, y);
    if (emitRing) {
      x00 = x;
      y00 = y;
      a00 = a;
      b00 = b;
      c00 = c;
      e00a = ea;
      e00b = eb;
    }
  } else {
    if (delta2 > 0) resampleLineTo(x0, y0, a0, b0, c0, e0a, e0b, x, y, a, b, c, ea, eb, MAX_DEPTH);
    out.lineTo(x, y);
  }
  x0 = x;
  y0 = y;
  a0 = a;
  b0 = b;
  c0 = c;
  e0a = ea;
  e0b = eb;
}

function emitEnd() {
  if (emitFirst) return;
  if (emitRing) {
    if (delta2 > 0) {
      resampleLineTo(x0, y0, a0, b0, c0, e0a, e0b, x00, y00, a00, b00, c00, e00a, e00b, MAX_DEPTH);
    }
    out.close();
  }
}

/**
 * d3's `resampleLineTo`, with its midpoint found without trigonometry. The
 * projected midpoint of a great-circle chord is the normalised sum of its
 * ends, placed by the same two multiply-adds as any point. d3 phrases one
 * case in longitude — two points on one meridian, or a midpoint at a pole,
 * take the mean longitude — and that is reproduced from the points'
 * equatorial directions, so the subdivision decisions come out the same.
 */
function resampleLineTo(
  px0: number,
  py0: number,
  pa0: number,
  pb0: number,
  pc0: number,
  pe0a: number,
  pe0b: number,
  px1: number,
  py1: number,
  pa1: number,
  pb1: number,
  pc1: number,
  pe1a: number,
  pe1b: number,
  depth: number,
) {
  const dx = px1 - px0;
  const dy = py1 - py0;
  const d2 = dx * dx + dy * dy;
  if (d2 > 4 * delta2 && depth--) {
    let a = pa0 + pa1;
    let b = pb0 + pb1;
    let c = pc0 + pc1;
    const m = Math.sqrt(a * a + b * b + c * c);
    c /= m;
    // Is |λ0 − λ1| < ε, with λ in (−π, π]? The equatorial directions are
    // within ε of each other, and not across the ±π cut.
    const cross = pe0a * pe1b - pe0b * pe1a;
    const dot = pe0a * pe1a + pe0b * pe1b;
    const straddle = pe0b < 0 !== pe1b < 0 && pe0a < 0 && pe1a < 0;
    const sameLng = dot > 0 && Math.abs(cross) < EPS && !straddle;
    let x2: number;
    let ea: number;
    let eb: number;
    if (Math.abs(Math.abs(c) - 1) < EPS || sameLng) {
      // The mean longitude: the bisector of the equatorial directions, or its
      // antipode when the short way between them crosses the ±π cut.
      let ma = pe0a + pe1a;
      let mb = pe0b + pe1b;
      const ml = Math.hypot(ma, mb);
      if (ml > 0) {
        ma /= ml;
        mb /= ml;
        if (pe0b < 0 !== pe1b < 0 && ma < 0) {
          ma = -ma;
          mb = -mb;
        }
      } else if (pe0b <= 0) {
        // Opposite directions: λ1 = λ0 + π, the mean a quarter turn on from λ0.
        ma = -pe0b;
        mb = pe0a;
      } else {
        ma = pe0b;
        mb = -pe0a;
      }
      ea = ma;
      eb = mb;
      const cosPhi = Math.sqrt(Math.max(0, 1 - c * c));
      x2 = tx + k * cosPhi * mb;
    } else {
      const rho = Math.sqrt(a * a + b * b);
      ea = a / rho;
      eb = b / rho;
      x2 = tx + k * (b / m);
    }
    const y2 = ty - k * c;
    const dx2 = x2 - px0;
    const dy2 = y2 - py0;
    const dz = dy * dx2 - dx * dy2;
    if (
      (dz * dz) / d2 > delta2 ||
      Math.abs((dx * dx2 + dy * dy2) / d2 - 0.5) > 0.3 ||
      pa0 * pa1 + pb0 * pb1 + pc0 * pc1 < COS_MIN_DISTANCE
    ) {
      a /= m;
      b /= m;
      resampleLineTo(px0, py0, pa0, pb0, pc0, pe0a, pe0b, x2, y2, a, b, c, ea, eb, depth);
      out.lineTo(x2, y2);
      resampleLineTo(x2, y2, a, b, c, ea, eb, px1, py1, pa1, pb1, pc1, pe1a, pe1b, depth);
    }
  }
}

// ── The limb ───────────────────────────────────────────────────────────────

/** d3's `circleRadius`: the signed angle of a limb point about the view axis. */
function limbAngle(a: number, b: number, c: number): number {
  const pa = a - cr;
  const l = Math.sqrt(pa * pa + b * b + c * c);
  const nb = b / l;
  const nc = c / l;
  const v = -nb;
  const radius = v > 1 ? 0 : v < -1 ? PI : Math.acos(v);
  return ((-nc < 0 ? -radius : radius) + TAU - EPS) % TAU;
}

/**
 * d3's `circleStream` along the clip circle: the points from the limb point
 * at `from` to the one at `to` (offsets into `seg`) in `direction`, every 2°,
 * or the whole circle when `from` is negative.
 */
function interpolate(from: number, to: number, direction: 1 | -1) {
  const step = direction * LIMB_STEP;
  let t0: number;
  let t1: number;
  if (from < 0) {
    t0 = clipRad + direction * TAU;
    t1 = clipRad - step / 2;
  } else {
    t0 = limbAngle(seg[from] as number, seg[from + 1] as number, seg[from + 2] as number);
    t1 = limbAngle(seg[to] as number, seg[to + 1] as number, seg[to + 2] as number);
    if (direction > 0 ? t0 < t1 : t0 > t1) t0 += direction * TAU;
  }
  for (let t = t0; direction > 0 ? t > t1 : t < t1; t -= step) {
    emitPoint(cr, -sr * Math.cos(t), -sr * Math.sin(t));
  }
}

// ── Clipping ───────────────────────────────────────────────────────────────

function asin(x: number): number {
  return x > 1 ? HALF_PI : x < -1 ? -HALF_PI : Math.asin(x);
}

/** d3's `pointEqual` on two rotated points, which it phrases in λ and φ: a
 *  box of ε in each. Points farther apart than the box allows are unequal
 *  without the trigonometry; the rare near pair is checked as d3 checks it. */
function pointEqual(
  pa: number,
  pb: number,
  pc: number,
  qa: number,
  qb: number,
  qc: number,
): boolean {
  if (
    Math.abs(pa - qa) >= 2 * EPS ||
    Math.abs(pb - qb) >= 2 * EPS ||
    Math.abs(pc - qc) >= 2 * EPS
  ) {
    return false;
  }
  return (
    Math.abs(Math.atan2(pb, pa) - Math.atan2(qb, qa)) < EPS && Math.abs(asin(pc) - asin(qc)) < EPS
  );
}

/** Where `intersect` leaves its answer: the first root, and with `two` the second. */
let ia = 0;
let ib = 0;
let ic = 0;
let i2a = 0;
let i2b = 0;
let i2c = 0;

/**
 * d3's `intersect`: where the great circle through `p` and `q` meets the clip
 * circle. The first root — `p` itself when the two are polar — or false when
 * the great circle misses the circle. With `two`, both roots, and only when
 * the first lies on the short arc from `p` to `q`.
 */
function intersect(
  pa: number,
  pb: number,
  pc: number,
  qa: number,
  qb: number,
  qc: number,
  two: boolean,
): boolean {
  // n2 = p × q
  const n2x = pb * qc - pc * qb;
  const n2y = pc * qa - pa * qc;
  const n2z = pa * qb - pb * qa;
  const n2n2 = n2x * n2x + n2y * n2y + n2z * n2z;
  const n1n2 = n2x;
  const determinant = n2n2 - n1n2 * n1n2;
  if (!determinant) {
    if (two) return false;
    ia = pa;
    ib = pb;
    ic = pc;
    return true;
  }
  const c1 = (cr * n2n2) / determinant;
  const c2 = (-cr * n1n2) / determinant;
  // u = n1 × n2 with n1 = (1, 0, 0); A = c1·n1 + c2·n2.
  const uy = -n2z;
  const uz = n2y;
  const Ax = c1 + c2 * n2x;
  const Ay = c2 * n2y;
  const Az = c2 * n2z;
  const w = Ay * uy + Az * uz;
  const uu = uy * uy + uz * uz;
  const t2 = w * w - uu * (Ax * Ax + Ay * Ay + Az * Az - 1);
  if (t2 < 0) return false;
  const t = Math.sqrt(t2);
  const s = (-w - t) / uu;
  ia = Ax;
  ib = Ay + uy * s;
  ic = Az + uz * s;
  if (!two) return true;
  // Is the first root on the short arc from p to q? Past p turning toward
  // q, and short of q, on their great circle.
  const pxi = (pb * ic - pc * ib) * n2x + (pc * ia - pa * ic) * n2y + (pa * ib - pb * ia) * n2z;
  const ixq = (ib * qc - ic * qb) * n2x + (ic * qa - ia * qc) * n2y + (ia * qb - ib * qa) * n2z;
  if (pxi < 0 || ixq < 0) return false;
  const s2 = (-w + t) / uu;
  i2a = Ax;
  i2b = Ay + uy * s2;
  i2c = Az + uz * s2;
  return true;
}

/** d3's `code`: which sides of the clip circle's bounding box a point is past. */
function code(a: number, b: number, c: number): number {
  let bits = 0;
  if (b < 0 && (a < 0 || -b > a * tanR)) bits |= 1;
  else if (b > 0 && (a < 0 || b > a * tanR)) bits |= 2;
  if (c < -sr) bits |= 4;
  else if (c > sr) bits |= 8;
  return bits;
}

// The clip-line state, d3's, shared by the ring and line walks.
let hasPrev = false;
let pa0 = 0;
let pb0 = 0;
let pc0 = 0;
let v0 = false;
let v00 = false;
let code0 = 0;
let clean = 1;
// The current visible run: streamed straight to the emitter (a line), or
// buffered as a segment (a ring).
let buffering = false;
let runOpen = false;

function runStart() {
  runOpen = true;
  if (buffering) segStart.push(segLen);
  else emitStart(false);
}

function runPoint(a: number, b: number, c: number) {
  if (buffering) pushPoint(a, b, c);
  else emitPoint(a, b, c);
}

function runEnd(flag: number) {
  runOpen = false;
  if (buffering) {
    segEnd.push(segLen);
    segEndFlag.push(flag);
  } else {
    emitEnd();
  }
}

function clipStart(buffer: boolean) {
  buffering = buffer;
  hasPrev = false;
  v0 = false;
  v00 = false;
  clean = 1;
  runOpen = false;
}

/** d3's `clipLine.point`, on a rotated point. */
function clipPoint(a: number, b: number, c: number) {
  const v = a > cr;
  const cd = !v && notHemisphere ? code(a, b, c) : 0;
  if (!hasPrev) {
    v00 = v0 = v;
    if (v) runStart();
  }
  if (v !== v0) {
    clean = 0;
    if (v) {
      // Outside going in.
      runStart();
      intersect(a, b, c, pa0, pb0, pc0, false);
      runPoint(ia, ib, ic);
    } else {
      // Inside going out.
      intersect(pa0, pb0, pc0, a, b, c, false);
      runPoint(ia, ib, ic);
      runEnd(2);
    }
    pa0 = ia;
    pb0 = ib;
    pc0 = ic;
    hasPrev = true;
  } else if (notHemisphere && hasPrev && !v) {
    // Both outside the small circle: the edge may still dip through it.
    if (!(cd & code0) && intersect(a, b, c, pa0, pb0, pc0, true)) {
      clean = 0;
      runStart();
      runPoint(ia, ib, ic);
      runPoint(i2a, i2b, i2c);
      runEnd(0);
    }
  }
  if (v && (!hasPrev || !pointEqual(pa0, pb0, pc0, a, b, c))) runPoint(a, b, c);
  pa0 = a;
  pb0 = b;
  pc0 = c;
  hasPrev = true;
  v0 = v;
  code0 = cd;
}

function clipEnd() {
  if (v0 && runOpen) runEnd(0);
  hasPrev = false;
}

// ── Rings and polygons ─────────────────────────────────────────────────────

interface Intersection {
  /** Offset of the point in `seg`. */
  x: number;
  /** The segment it starts or ends, for the subject list. */
  z: number;
  o: Intersection;
  e: boolean;
  v: boolean;
  n: Intersection;
  p: Intersection;
  key: number;
}

/** d3's `compareIntersection` key: the point's place along the clip edge. */
function intersectionKey(at: number): number {
  const b = seg[at + 1] as number;
  const phi = asin(seg[at + 2] as number);
  return b < 0 ? phi - HALF_PI - EPS : HALF_PI - phi;
}

function makeIntersection(x: number, z: number, e: boolean): Intersection {
  const i = { x, z, e, v: false, key: 0 } as Intersection;
  i.o = i.n = i.p = i;
  return i;
}

function link(list: Intersection[]) {
  const n = list.length;
  if (!n) return;
  let a = list[0] as Intersection;
  for (let i = 1; i < n; i++) {
    const b = list[i] as Intersection;
    a.n = b;
    b.p = a;
    a = b;
  }
  const first = list[0] as Intersection;
  a.n = first;
  first.p = a;
}

function emitSegment(s: number, reverse: boolean, dropLast: boolean) {
  const from = segStart[s] as number;
  const to = (segEnd[s] as number) - (dropLast ? 3 : 0);
  if (reverse) {
    for (let i = to - 3; i >= from; i -= 3) {
      emitPoint(seg[i] as number, seg[i + 1] as number, seg[i + 2] as number);
    }
  } else {
    for (let i = from; i < to; i += 3) {
      emitPoint(seg[i] as number, seg[i + 1] as number, seg[i + 2] as number);
    }
  }
}

/** d3's `clipRejoin`, over the polygon's segments. */
function rejoin(startInside: boolean) {
  const subject: Intersection[] = [];
  const clip: Intersection[] = [];
  for (const s of polygonSegments) {
    const from = segStart[s] as number;
    const end = segEnd[s] as number;
    if (end - from <= 3) continue;
    const last = end - 3;
    if (
      pointEqual(
        seg[from] as number,
        seg[from + 1] as number,
        seg[from + 2] as number,
        seg[last] as number,
        seg[last + 1] as number,
        seg[last + 2] as number,
      )
    ) {
      if (!segEndFlag[s]) {
        emitStart(true);
        emitSegment(s, false, true);
        emitEnd();
        continue;
      }
      // d3 nudges the point's longitude so the two stay distinct in the sort.
      seg[last + 1] = (seg[last + 1] as number) + 2 * EPS;
    }
    const x0 = makeIntersection(from, s, true);
    const c0 = makeIntersection(from, -1, false);
    x0.o = c0;
    c0.o = x0;
    subject.push(x0);
    clip.push(c0);
    const x1 = makeIntersection(last, s, false);
    const c1 = makeIntersection(last, -1, true);
    x1.o = c1;
    c1.o = x1;
    subject.push(x1);
    clip.push(c1);
  }
  if (!subject.length) return;
  for (const c of clip) c.key = intersectionKey(c.x);
  clip.sort((a, b) => a.key - b.key);
  link(subject);
  link(clip);
  let inside = startInside;
  for (const c of clip) {
    inside = !inside;
    c.e = inside;
  }
  const start = subject[0] as Intersection;
  for (;;) {
    let current = start;
    let isSubject = true;
    while (current.v) {
      current = current.n;
      if (current === start) return;
    }
    emitStart(true);
    do {
      current.v = current.o.v = true;
      if (current.e) {
        if (isSubject) emitSegment(current.z, false, false);
        else interpolate(current.x, current.n.x, 1);
        current = current.n;
      } else {
        if (isSubject) emitSegment(current.p.z, true, false);
        else interpolate(current.x, current.p.x, -1);
        current = current.p;
      }
      current = current.o;
      isSubject = !isSubject;
    } while (!current.v);
    emitEnd();
  }
}

/**
 * Whether the polygon contains the point `(sx, sy, sz)`, world frame — d3's
 * `polygonContains`, answered by parity. The polygon's containment of a fixed
 * reference point is known (from d3, once), and each crossing of a ring's
 * edge by the arc from the reference to the point flips it. An edge costs a
 * few multiplications, none of them a trigonometric call.
 */
function contains(part: PolygonPart, sx: number, sy: number, sz: number): boolean {
  let rx = REF_U[0];
  let ry = REF_U[1];
  let rz = REF_U[2];
  let refInside: boolean;
  if (sx * rx + sy * ry + sz * rz < -0.99) {
    rx = REF2_U[0];
    ry = REF2_U[1];
    rz = REF2_U[2];
    if (part.refInside2 === null) part.refInside2 = refContains(part, REF2);
    refInside = part.refInside2;
  } else {
    if (part.refInside === null) part.refInside = refContains(part, REF);
    refInside = part.refInside;
  }
  // The arc's plane normal and midpoint direction.
  const nx = sy * rz - sz * ry;
  const ny = sz * rx - sx * rz;
  const nz = sx * ry - sy * rx;
  const mx = sx + rx;
  const my = sy + ry;
  const mz = sz + rz;
  let crossings = 0;
  for (const ring of part.rings) {
    const u = ring.u;
    const n = ring.n;
    if (n < 2) continue;
    let px = u[(n - 1) * 3] as number;
    let py = u[(n - 1) * 3 + 1] as number;
    let pz = u[(n - 1) * 3 + 2] as number;
    let dp = nx * px + ny * py + nz * pz;
    for (let i = 0; i < n; i++) {
      const qx = u[i * 3] as number;
      const qy = u[i * 3 + 1] as number;
      const qz = u[i * 3 + 2] as number;
      const dq = nx * qx + ny * qy + nz * qz;
      if (dp < 0 !== dq < 0) {
        // The edge straddles the arc's great circle. Does the arc straddle the
        // edge's, and do the two meet at the same one of the two points where
        // the circles cross?
        const ex = py * qz - pz * qy;
        const ey = pz * qx - px * qz;
        const ez = px * qy - py * qx;
        const es = ex * sx + ey * sy + ez * sz;
        const er = ex * rx + ey * ry + ez * rz;
        if (es < 0 !== er < 0) {
          const ix = ey * nz - ez * ny;
          const iy = ez * nx - ex * nz;
          const iz = ex * ny - ey * nx;
          const onEdge = ix * (px + qx) + iy * (py + qy) + iz * (pz + qz);
          const onArc = ix * mx + iy * my + iz * mz;
          if (onEdge < 0 === onArc < 0) crossings++;
        }
      }
      px = qx;
      py = qy;
      pz = qz;
      dp = dq;
    }
  }
  return refInside !== ((crossings & 1) === 1);
}

function refContains(part: PolygonPart, ref: [number, number]): boolean {
  // Once per polygon, and d3's own answer, so a ring wound the other way —
  // which d3 reads as the rest of the sphere — is read the same way here.
  return geoContains({ type: 'Polygon', coordinates: part.coords }, ref);
}

/**
 * Whether `polygon` contains `[lng, lat]`, by the parity test the clipper
 * uses. Exported so the test can hold it against `geoContains`.
 */
export function containsPoint(polygon: GeoJSON.Polygon, lng: number, lat: number): boolean {
  const rings = polygon.coordinates.map((ring) => {
    const n = Math.max(0, ring.length - 1);
    return { u: unitsOf(ring, n), n };
  });
  const part: PolygonPart = {
    ...capOf(rings.map((r) => r.u)),
    rings,
    coords: polygon.coordinates,
    refInside: null,
    refInside2: null,
  };
  const s = unitOf(lng, lat);
  return contains(part, s[0], s[1], s[2]);
}

/** The clip circle's start point, `[0, −clip]` in the rotated frame, in the world. */
function containsStart(part: PolygonPart): boolean {
  return contains(part, cr * ax - sr * cx, cr * ay - sr * cy, cr * az - sr * cz);
}

function drawPolygon(part: PolygonPart) {
  segLen = 0;
  segStart.length = 0;
  segEnd.length = 0;
  segEndFlag.length = 0;
  polygonSegments.length = 0;
  let anyHidden = false;
  for (const ring of part.rings) {
    const u = ring.u;
    const n = ring.n;
    if (n === 0) continue;
    const firstSegment = segStart.length;
    const base = segLen;
    clipStart(true);
    for (let i = 0; i < n; i++) {
      const x = u[i * 3] as number;
      const y = u[i * 3 + 1] as number;
      const z = u[i * 3 + 2] as number;
      clipPoint(ax * x + ay * y + az * z, bx * x + by * y + bz * z, cx * x + cy * y + cz * z);
    }
    // d3 closes the ring by streaming its first point again.
    const x = u[0] as number;
    const y = u[1] as number;
    const z = u[2] as number;
    clipPoint(ax * x + ay * y + az * z, bx * x + by * y + bz * z, cx * x + cy * y + cz * z);
    clipEnd();
    if (!clean || !v00 || !v0) anyHidden = true;
    const count = segStart.length - firstSegment;
    if (count === 0) continue;
    if (clean) {
      // No intersections: the ring as it is, less the repeated first point.
      emitStart(true);
      emitSegment(firstSegment, false, true);
      emitEnd();
      segStart.length = firstSegment;
      segEnd.length = firstSegment;
      segEndFlag.length = firstSegment;
      segLen = base;
      continue;
    }
    if (count > 1 && v00 && v0) {
      // First and last points visible: the run that wraps the ring's start is
      // one segment, the last's points followed by the first's.
      const lastS = segStart.length - 1;
      const firstFrom = segStart[firstSegment] as number;
      const firstTo = segEnd[firstSegment] as number;
      const firstFlag = segEndFlag[firstSegment] as number;
      for (let i = firstFrom; i < firstTo; i += 3) {
        pushPoint(seg[i] as number, seg[i + 1] as number, seg[i + 2] as number);
      }
      segEnd[lastS] = segLen;
      segEndFlag[lastS] = firstFlag;
      segStart.splice(firstSegment, 1);
      segEnd.splice(firstSegment, 1);
      segEndFlag.splice(firstSegment, 1);
    }
    for (let s = firstSegment; s < segStart.length; s++) {
      if ((segEnd[s] as number) - (segStart[s] as number) > 3) polygonSegments.push(s);
    }
  }
  if (polygonSegments.length) {
    rejoin(containsStart(part));
  } else if ((anyHidden || part.radius === PI) && containsStart(part)) {
    // A ring drawn whole and inside the view holds the clip circle's start
    // point only when its interior is the rest of the sphere, which the cap
    // radius already says; a small ring is spared the containment test.
    // Every ring is out of view and the polygon holds the view: the disc.
    emitStart(true);
    interpolate(-1, -1, 1);
    emitEnd();
  }
}

function drawLine(part: LinePart) {
  const u = part.u;
  const n = part.n;
  clipStart(false);
  for (let i = 0; i < n; i++) {
    const x = u[i * 3] as number;
    const y = u[i * 3 + 1] as number;
    const z = u[i * 3 + 2] as number;
    clipPoint(ax * x + ay * y + az * z, bx * x + by * y + bz * z, cx * x + cy * y + cz * z);
  }
  clipEnd();
}

// ── The layer ──────────────────────────────────────────────────────────────

type Input = GeoJSON.GeoJSON | GeoJSON.Geometry;

export function createOrthoLayer(input: Input): OrthoLayer {
  const polygons: PolygonPart[] = [];
  const lines: LinePart[] = [];

  const polygonOf = (coords: GeoJSON.Position[][]) => {
    const rings: Ring[] = [];
    for (const ring of coords) {
      // GeoJSON closes a ring with its first point; d3 drops it.
      const n = Math.max(0, ring.length - 1);
      rings.push({ u: unitsOf(ring, n), n });
    }
    const cap = capOf(rings.map((r) => r.u));
    // The cap bounds the ring; it bounds the interior only when the interior
    // is the ring's small side. d3 reads a ring wound the other way as the
    // rest of the sphere, which no cap this narrow holds — so it never culls.
    const outer = coords[0];
    if (cap.radius < PI && outer && geoArea({ type: 'Polygon', coordinates: [outer] }) > TAU) {
      cap.radius = PI;
    }
    polygons.push({ ...cap, rings, coords, refInside: null, refInside2: null });
  };
  const lineOf = (coords: GeoJSON.Position[]) => {
    const n = coords.length;
    const u = unitsOf(coords, n);
    lines.push({ ...capOf([u]), u, n, coords });
  };
  const collect = (g: Input | null): void => {
    if (!g) return;
    switch (g.type) {
      case 'FeatureCollection':
        for (const f of g.features) collect(f.geometry);
        return;
      case 'Feature':
        collect(g.geometry);
        return;
      case 'GeometryCollection':
        for (const child of g.geometries) collect(child);
        return;
      case 'Polygon':
        polygonOf(g.coordinates);
        return;
      case 'MultiPolygon':
        for (const poly of g.coordinates) polygonOf(poly);
        return;
      case 'LineString':
        lineOf(g.coordinates);
        return;
      case 'MultiLineString':
        for (const line of g.coordinates) lineOf(line);
        return;
      default:
        // Points stream as points, not paths; nothing here draws them.
        return;
    }
  };
  collect(input);

  // For `visible()`.
  const polygonOut: GeoJSON.Position[][][] = [];
  const lineOut: GeoJSON.Position[][] = [];
  const multiPolygon: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: polygonOut };
  const multiLine: GeoJSON.MultiLineString = { type: 'MultiLineString', coordinates: lineOut };
  const visibleResult: GeoJSON.Geometry =
    polygons.length > 0 && lines.length > 0
      ? { type: 'GeometryCollection', geometries: [multiPolygon, multiLine] }
      : lines.length > 0
        ? multiLine
        : multiPolygon;

  return {
    partCount: polygons.length + lines.length,
    draw(view, clipAngleDeg, precisionPx, sink) {
      ax = view.ax;
      ay = view.ay;
      az = view.az;
      bx = view.bx;
      by = view.by;
      bz = view.bz;
      cx = view.cx;
      cy = view.cy;
      cz = view.cz;
      k = view.k;
      tx = view.tx;
      ty = view.ty;
      clipRad = Math.min(90, clipAngleDeg) * DEG2RAD;
      cr = Math.cos(clipRad);
      sr = Math.sin(clipRad);
      tanR = Math.tan(clipRad);
      notHemisphere = Math.abs(cr) > EPS;
      delta2 = precisionPx * precisionPx;
      out = sink;
      // The cull: a part farther from the camera than the clip plus its own
      // radius has nothing to draw (`cap-cull.ts`).
      const clip = clipRad + CULL_MARGIN;
      for (const p of polygons) {
        const reach = p.radius + clip;
        if (reach < PI && p.x * ax + p.y * ay + p.z * az < Math.cos(reach)) continue;
        drawPolygon(p);
      }
      for (const l of lines) {
        const reach = l.radius + clip;
        if (reach < PI && l.x * ax + l.y * ay + l.z * az < Math.cos(reach)) continue;
        drawLine(l);
      }
    },
    visible(camLng, camLat, clipAngleDeg) {
      const lat = camLat * DEG2RAD;
      const lng = camLng * DEG2RAD;
      const cosLat = Math.cos(lat);
      const vx = cosLat * Math.cos(lng);
      const vy = cosLat * Math.sin(lng);
      const vz = Math.sin(lat);
      const clip = clipAngleDeg * DEG2RAD + CULL_MARGIN;
      polygonOut.length = 0;
      for (const p of polygons) {
        const reach = p.radius + clip;
        if (reach >= PI || p.x * vx + p.y * vy + p.z * vz >= Math.cos(reach)) {
          polygonOut.push(p.coords);
        }
      }
      lineOut.length = 0;
      for (const l of lines) {
        const reach = l.radius + clip;
        if (reach >= PI || l.x * vx + l.y * vy + l.z * vz >= Math.cos(reach)) {
          lineOut.push(l.coords);
        }
      }
      return visibleResult;
    },
  };
}
