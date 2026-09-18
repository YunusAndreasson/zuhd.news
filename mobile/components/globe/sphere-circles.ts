/**
 * Circles on the sphere, drawn in closed form for the globe's orthographic view.
 *
 * The graticule, the polar circles and the three daylight caps (day, night,
 * twilight) were streamed through d3-geo like the coastline: every vertex
 * rotated, clip-tested and resampled in JS, then handed to Skia one `lineTo` at
 * a time — about 1,300 points a frame, and a quarter of a moving frame's
 * projection on the emulator. None of it needs that. An orthographic projection
 * is a parallel projection, and the parallel projection of a circle is an
 * ellipse, so every one of these lines is an arc of an ellipse whose centre and
 * axes follow from the camera in a few multiplications. An ellipse arc is an
 * affine image of a circular arc, which a rational quadratic represents
 * exactly: each quarter is one `conicTo`, and Skia flattens it to device pixels
 * itself. A frame's worth is ~19 curves and ~90 path calls.
 *
 * Conventions match `geoOrthographic().rotate([-lng, -lat, 0]).scale(k)
 * .translate([tx, ty])`: in the rotated frame `a` points at the viewer, `b`
 * right and `c` up, a point is drawn at `(tx + k·b, ty − k·c)`, and it is on the
 * near side while `a > 0`. `__tests__/sphere-circles.test.ts` holds every
 * output within a fraction of a pixel of what d3 draws.
 *
 * One difference is deliberate. d3 clips at the view angle, which is less than
 * 90° once the globe is zoomed past the screen; these clip at the horizon. The
 * ground between the two lands farther from the centre than the canvas's
 * farthest corner (`viewAngleFor`), so nothing on screen changes.
 */

const DEG2RAD = Math.PI / 180;
const HALF_PI = Math.PI / 2;
const EPS = 1e-12;

/** The path calls the curves need — a Skia `SkPathBuilder` satisfies it. */
export interface ConicSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  conicTo(x1: number, y1: number, x2: number, y2: number, w: number): void;
  close(): void;
}

/** The camera, as the rotation d3's orthographic applies plus its scale. */
export interface OrthoView {
  /** Rotation rows: a world unit vector dotted with each gives a, b, c. */
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  cx: number;
  cy: number;
  cz: number;
  k: number;
  tx: number;
  ty: number;
}

/** The view for a camera at `[lng, lat]`, as `rotate([-lng, -lat, 0])` sees it. */
export function orthoView(lng: number, lat: number, k: number, tx: number, ty: number): OrthoView {
  // d3 turns longitude by −lng about the pole, then latitude by −lat about the
  // new b axis: a = x·cosφ − z·sinφ, b = y, c = z·cosφ + x·sinφ with
  // (x, y) the longitude-turned point and φ = −lat.
  const cl = Math.cos(-lng * DEG2RAD);
  const sl = Math.sin(-lng * DEG2RAD);
  const cp = Math.cos(-lat * DEG2RAD);
  const sp = Math.sin(-lat * DEG2RAD);
  return {
    ax: cl * cp,
    ay: -sl * cp,
    az: -sp,
    bx: sl,
    by: cl,
    bz: 0,
    cx: cl * sp,
    cy: -sl * sp,
    cz: cp,
    k,
    tx,
    ty,
  };
}

/** Unit vector for `[lng, lat]` in degrees, world frame (z through the north pole). */
export function unit(lng: number, lat: number): [number, number, number] {
  const l = lng * DEG2RAD;
  const p = lat * DEG2RAD;
  const c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}

/** Where `screenPoint` puts its answer, `[x, y]`; reused, so read it before
 *  the next call. */
export const SCREEN_POINT: [number, number] = [0, 0];

/**
 * A point on the sphere, by its unit vector, on screen — or `false` when it is
 * `clipCos` or farther from the camera (`cos` of the clip angle).
 *
 * The same answer as `geoDistance(p, camera) < clip` followed by d3's
 * projection, which spent trigonometry on both and allocated two arrays per
 * point: a dot product and two more multiply-adds instead. Every mark, label
 * anchor and city light on the globe goes through here each frame.
 */
export function screenPoint(
  view: OrthoView,
  x: number,
  y: number,
  z: number,
  clipCos: number,
): boolean {
  if (view.ax * x + view.ay * y + view.az * z <= clipCos) return false;
  SCREEN_POINT[0] = view.tx + view.k * (view.bx * x + view.by * y + view.bz * z);
  SCREEN_POINT[1] = view.ty - view.k * (view.cx * x + view.cy * y + view.cz * z);
  return true;
}

/**
 * `O + U·cos t + V·sin t` for `t` from `t0` by `sweep`, as conics of at most a
 * quarter turn. The caller has already moved or drawn to the start point.
 */
function ellipseArc(
  sink: ConicSink,
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  vx: number,
  vy: number,
  t0: number,
  sweep: number,
) {
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / HALF_PI - 1e-9));
  const h = sweep / (2 * n);
  const w = Math.cos(h);
  for (let i = 0; i < n; i++) {
    const tm = t0 + (2 * i + 1) * h;
    const te = tm + h;
    const cm = Math.cos(tm) / w;
    const sm = Math.sin(tm) / w;
    const ce = Math.cos(te);
    const se = Math.sin(te);
    sink.conicTo(
      ox + ux * cm + vx * sm,
      oy + uy * cm + vy * sm,
      ox + ux * ce + vx * se,
      oy + uy * ce + vy * se,
      w,
    );
  }
}

/** A circle on the sphere seen by `view`, as its screen ellipse and near arc. */
interface ProjectedCircle {
  ox: number;
  oy: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  /** `a` (toward the viewer) along the circle is `a0 + a1·cos t`. */
  a0: number;
  a1: number;
  /** The circle's centre direction, rotated. */
  na: number;
  nb: number;
  nc: number;
  cosR: number;
}

/**
 * The boundary of the cap of angular radius `radius` around `center`, as
 * `O + U·cos t + V·sin t` on screen. `t = 0` is the point nearest the viewer,
 * so the near side is always one arc about `t = 0`.
 */
function projectCircle(
  view: OrthoView,
  center: [number, number, number],
  radiusRad: number,
): ProjectedCircle {
  const [x, y, z] = center;
  const na = view.ax * x + view.ay * y + view.az * z;
  const nb = view.bx * x + view.by * y + view.bz * z;
  const nc = view.cx * x + view.cy * y + view.cz * z;
  const cosR = Math.cos(radiusRad);
  const sinR = Math.sin(radiusRad);
  const s = Math.sqrt(nb * nb + nc * nc);
  const k = view.k;
  // u: the direction in the circle's plane that leans most toward the viewer;
  // v = n × u. Centred on the view axis every direction is as good as another.
  let ub: number;
  let uc: number;
  let vb: number;
  let vc: number;
  let ua: number;
  if (s > 1e-9) {
    ua = s;
    ub = (-na * nb) / s;
    uc = (-na * nc) / s;
    vb = nc / s;
    vc = -nb / s;
  } else {
    ua = 0;
    ub = 1;
    uc = 0;
    vb = 0;
    vc = na >= 0 ? 1 : -1;
  }
  return {
    ox: view.tx + k * cosR * nb,
    oy: view.ty - k * cosR * nc,
    ux: k * sinR * ub,
    uy: -k * sinR * uc,
    vx: k * sinR * vb,
    vy: -k * sinR * vc,
    a0: cosR * na,
    a1: sinR * ua,
    na,
    nb,
    nc,
    cosR,
  };
}

/** Half-width of the near arc about `t = 0`: `π` all round, `0` none. */
function nearHalfArc(p: ProjectedCircle): number {
  if (p.a1 <= EPS) return p.a0 > 0 ? Math.PI : 0;
  const q = -p.a0 / p.a1;
  if (q <= -1) return Math.PI;
  if (q >= 1) return 0;
  return Math.acos(q);
}

function point(p: ProjectedCircle, t: number): [number, number] {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [p.ox + p.ux * c + p.vx * s, p.oy + p.uy * c + p.vy * s];
}

/** The whole ellipse, as a closed contour. */
function fullEllipse(sink: ConicSink, p: ProjectedCircle, reverse: boolean) {
  sink.moveTo(p.ox + p.ux, p.oy + p.uy);
  ellipseArc(sink, p.ox, p.oy, p.ux, p.uy, p.vx, p.vy, 0, reverse ? -2 * Math.PI : 2 * Math.PI);
  sink.close();
}

/** The limb — the horizon — as a closed contour, turning the way `sign` says. */
function fullLimb(sink: ConicSink, view: OrthoView, sign: 1 | -1) {
  const { k, tx, ty } = view;
  sink.moveTo(tx + k, ty);
  ellipseArc(sink, tx, ty, k, 0, 0, -k, 0, sign * 2 * Math.PI);
  sink.close();
}

/**
 * The visible part of a spherical cap, as a fill: the near arc of its boundary
 * closed along the horizon, through the stretch of horizon the cap contains.
 * A cap whose boundary is all on the near side is the ellipse, or — when it
 * contains the far pole — the disc with the ellipse cut out, wound against the
 * disc so the default nonzero fill leaves the hole.
 */
export function capFill(
  sink: ConicSink,
  view: OrthoView,
  centerLng: number,
  centerLat: number,
  radiusDeg: number,
) {
  const p = projectCircle(view, unit(centerLng, centerLat), radiusDeg * DEG2RAD);
  const half = nearHalfArc(p);
  if (half === 0) {
    // Boundary all behind: the cap is either all behind or covers the near side.
    if (p.na >= p.cosR) fullLimb(sink, view, 1);
    return;
  }
  if (half === Math.PI) {
    if (-p.na >= p.cosR) {
      fullLimb(sink, view, 1);
      // The limb turns clockwise on screen; the ellipse must turn the other way.
      const cross = p.ux * p.vy - p.uy * p.vx;
      fullEllipse(sink, p, cross < 0);
    } else {
      fullEllipse(sink, p, false);
    }
    return;
  }
  const [sx, sy] = point(p, -half);
  sink.moveTo(sx, sy);
  ellipseArc(sink, p.ox, p.oy, p.ux, p.uy, p.vx, p.vy, -half, 2 * half);
  // Back along the horizon, through the limb point nearest the cap's centre.
  const [ex, ey] = point(p, half);
  const { k, tx, ty } = view;
  const th1 = Math.atan2(-(ey - ty), ex - tx);
  const th2 = Math.atan2(-(sy - ty), sx - tx);
  const mid = Math.atan2(p.nc, p.nb);
  const tau = 2 * Math.PI;
  const ccw = (((th2 - th1) % tau) + tau) % tau;
  const toMid = (((mid - th1) % tau) + tau) % tau;
  const sweep = toMid <= ccw ? ccw : ccw - tau;
  ellipseArc(sink, tx, ty, k, 0, 0, -k, th1, sweep);
  sink.close();
}

/** The visible part of the circle bounding a cap, as a line. */
export function circleLine(
  sink: ConicSink,
  view: OrthoView,
  centerLng: number,
  centerLat: number,
  radiusDeg: number,
) {
  const p = projectCircle(view, unit(centerLng, centerLat), radiusDeg * DEG2RAD);
  const half = nearHalfArc(p);
  if (half === 0) return;
  if (half === Math.PI) {
    fullEllipse(sink, p, false);
    return;
  }
  const [sx, sy] = point(p, -half);
  sink.moveTo(sx, sy);
  ellipseArc(sink, p.ox, p.oy, p.ux, p.uy, p.vx, p.vy, -half, 2 * half);
}

/** The visible part of the meridian at `lng`, from `latFrom` to `latTo` (degrees). */
export function meridianLine(
  sink: ConicSink,
  view: OrthoView,
  lng: number,
  latFrom: number,
  latTo: number,
) {
  // p(t) = cos t·E + sin t·Z: E on the equator at `lng`, Z the pole, t the latitude.
  const [ex, ey] = unit(lng, 0);
  const ea = view.ax * ex + view.ay * ey;
  const eb = view.bx * ex + view.by * ey;
  const ec = view.cx * ex + view.cy * ey;
  const za = view.az;
  const zb = view.bz;
  const zc = view.cz;
  const r = Math.hypot(ea, za);
  if (r < 1e-9) return; // edge-on: the meridian is the horizon itself
  // a(t) = r·cos(t − ψ) is positive within a quarter turn of ψ.
  const psi = Math.atan2(za, ea);
  const lo = latFrom * DEG2RAD;
  const hi = latTo * DEG2RAD;
  for (const shift of [0, -2 * Math.PI, 2 * Math.PI]) {
    const from = Math.max(lo, psi + shift - HALF_PI);
    const to = Math.min(hi, psi + shift + HALF_PI);
    if (to - from <= 1e-9) continue;
    const k = view.k;
    const ox = view.tx;
    const oy = view.ty;
    const ux = k * eb;
    const uy = -k * ec;
    const vx = k * zb;
    const vy = -k * zc;
    sink.moveTo(
      ox + ux * Math.cos(from) + vx * Math.sin(from),
      oy + uy * Math.cos(from) + vy * Math.sin(from),
    );
    ellipseArc(sink, ox, oy, ux, uy, vx, vy, from, to - from);
  }
}

/** Degrees between graticule lines, and where the meridians stop. */
export const GRATICULE_STEP = 30;
export const GRATICULE_CAP = 85;
/** The polar circles' distance from the poles, degrees. */
export const POLAR_CIRCLE_RADIUS = 23.44;

/**
 * The grid under the land — twelve meridians and five parallels, the web map's
 * — and the two polar circles, as lines.
 */
export function graticuleLines(sink: ConicSink, view: OrthoView) {
  for (let lng = -180; lng < 180; lng += GRATICULE_STEP) {
    meridianLine(sink, view, lng, -GRATICULE_CAP, GRATICULE_CAP);
  }
  for (let lat = -90 + GRATICULE_STEP; lat <= 90 - GRATICULE_STEP; lat += GRATICULE_STEP) {
    // A parallel is the edge of the cap around the north pole, 90° − lat wide.
    circleLine(sink, view, 0, 90, 90 - lat);
  }
  circleLine(sink, view, 0, 90, POLAR_CIRCLE_RADIUS);
  circleLine(sink, view, 0, -90, POLAR_CIRCLE_RADIUS);
}
