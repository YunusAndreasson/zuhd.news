/**
 * The camera arithmetic a finger needs, in the globe's own projection.
 *
 * The web's map feels like a map because the ground under the finger stays
 * under the finger, a released drag glides, and a pinch zooms around the
 * fingers. Each of those is a statement about `geoOrthographic`, so each is
 * written here once, as a worklet, and pinned against d3 in
 * `__tests__/globe-camera.test.ts` — the failure mode is a globe that turns a
 * little too fast or zooms toward the wrong place, which nobody reports.
 *
 * Conventions match `MiniGlobe`: the camera is `[lng, lat]` in degrees and the
 * projection is `rotate([-lng, -lat, 0])`, `scale(radius / sin(clip))`,
 * `translate([cx, cy])`.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** The tightest clip a pinch reaches — the old closest zoom level. */
export const MIN_CLIP = 10;
/** A hemisphere: an orthographic projection cannot show more. */
export const MAX_CLIP = 90;
/** Past this the pole is under the finger and the projection has no up. */
export const MAX_LAT = 82;
/**
 * The fastest a released drag may leave the finger, in points per second —
 * MapLibre's `dragPan` default. A flick on a phone reports far more, and
 * handing that straight to a decay sends the earth round twice.
 */
export const MAX_FLING_PX_S = 1400;
/** Below this a release is a stop, not a throw. */
const MIN_FLING_PX_S = 180;
/** Longitude turns faster near the poles; past this it would spin. */
const MIN_COS_LAT = 0.2;

/** The orthographic scale at a clip angle: the disc radius over sin(clip). */
export function projScaleFor(clip: number, radius: number): number {
  'worklet';
  return radius / Math.sin(clip * DEG2RAD);
}

/**
 * Camera change for a finger movement, so the point under the finger moves
 * with it. At the centre of the disc a longitude step of `Δλ` moves the ground
 * `scale · cos φ · Δλ` points and a latitude step moves it `scale · Δφ`.
 */
export function dragDelta(
  changeX: number,
  changeY: number,
  clip: number,
  radius: number,
  lat: number,
): { dLng: number; dLat: number } {
  'worklet';
  const scale = projScaleFor(clip, radius);
  const cosLat = Math.max(MIN_COS_LAT, Math.cos(lat * DEG2RAD));
  return {
    dLng: (-changeX / (scale * cosLat)) * RAD2DEG,
    dLat: (changeY / scale) * RAD2DEG,
  };
}

/**
 * Release velocity in degrees per second, capped at `MAX_FLING_PX_S` along the
 * direction of travel. Zero when the release was slower than a throw.
 */
export function flingVelocity(
  velocityX: number,
  velocityY: number,
  clip: number,
  radius: number,
  lat: number,
): { vLng: number; vLat: number } {
  'worklet';
  const speed = Math.hypot(velocityX, velocityY);
  if (speed < MIN_FLING_PX_S) return { vLng: 0, vLat: 0 };
  const k = speed > MAX_FLING_PX_S ? MAX_FLING_PX_S / speed : 1;
  const d = dragDelta(velocityX * k, velocityY * k, clip, radius, lat);
  return { vLng: d.dLng, vLat: d.dLat };
}

/**
 * The clip after a pinch step. The disc's apparent scale is `1 / sin(clip)`,
 * so a pinch that spreads the fingers by `scaleChange` divides `sin(clip)` by
 * it. Clamped to `[MIN_CLIP, MAX_CLIP]`.
 */
export function pinchClip(clip: number, scaleChange: number): number {
  'worklet';
  if (!(scaleChange > 0)) return clip;
  const s = Math.sin(clip * DEG2RAD) / scaleChange;
  const lo = Math.sin(MIN_CLIP * DEG2RAD);
  const next = Math.asin(s >= 1 ? 1 : s <= lo ? lo : s) * RAD2DEG;
  return next < MIN_CLIP ? MIN_CLIP : next > MAX_CLIP ? MAX_CLIP : next;
}

/**
 * The `[lng, lat]` under a screen point, or null off the disc. The same answer
 * as `geoOrthographic().rotate([-camLng, -camLat, 0]).invert`, written out so
 * it can run in a gesture worklet.
 */
export function invertOrthographic(
  x: number,
  y: number,
  camLng: number,
  camLat: number,
  scale: number,
  cx: number,
  cy: number,
): [number, number] | null {
  'worklet';
  const px = (x - cx) / scale;
  const py = (cy - y) / scale;
  const z = Math.hypot(px, py);
  if (z > 1) return null;
  const c = Math.asin(z);
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);
  // Raw orthographic inverse, in the rotated frame.
  const lam = Math.atan2(px * sinC, z * cosC);
  const phi = Math.asin(z === 0 ? 0 : (py * sinC) / z);
  // Undo d3's rotation: φ by −camLat, then λ by −camLng.
  const cosPhi = Math.cos(phi);
  const vx = Math.cos(lam) * cosPhi;
  const vy = Math.sin(lam) * cosPhi;
  const vz = Math.sin(phi);
  const dPhi = -camLat * DEG2RAD;
  const cosD = Math.cos(dPhi);
  const sinD = Math.sin(dPhi);
  let lng = Math.atan2(vy, vx * cosD + vz * sinD) * RAD2DEG + camLng;
  const lat = Math.asin(Math.max(-1, Math.min(1, vz * cosD - vx * sinD))) * RAD2DEG;
  lng = ((((lng + 180) % 360) + 360) % 360) - 180;
  return [lng, lat];
}

/** Shortest signed longitude difference `a − b`, in (−180, 180]. */
function lngDiff(a: number, b: number): number {
  'worklet';
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Fixed-point passes in `anchorZoom`. One leaves ~0.3 px per step of drift
 *  off-centre (6 px over a 2× pinch); three converge below a hundredth. */
const ANCHOR_PASSES = 3;

/**
 * Camera after a pinch step that keeps the ground the fingers hold under them:
 * the point under `(fromX, fromY)` at `fromScale` ends under `(toX, toY)` at
 * `toScale`, so a pinch zooms about the fingers and a two-finger drag turns the
 * earth with them, as the web's map does.
 *
 * Each pass moves the camera by the held point minus the point under the
 * fingers now. A camera step is a rotation, not a translation, so one pass is
 * only first-order off the centre of the disc; a few converge. Null when the
 * fingers are off the disc: zoom about the centre then.
 */
export function anchorZoom(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  camLng: number,
  camLat: number,
  fromScale: number,
  toScale: number,
  cx: number,
  cy: number,
): { lng: number; lat: number } | null {
  'worklet';
  const target = invertOrthographic(fromX, fromY, camLng, camLat, fromScale, cx, cy);
  if (!target) return null;
  let lng = camLng;
  let lat = camLat;
  for (let i = 0; i < ANCHOR_PASSES; i++) {
    const under = invertOrthographic(toX, toY, lng, lat, toScale, cx, cy);
    if (!under) return null;
    lng += lngDiff(target[0], under[0]);
    lat += target[1] - under[1];
    lat = lat > MAX_LAT ? MAX_LAT : lat < -MAX_LAT ? -MAX_LAT : lat;
  }
  return { lng, lat };
}

/**
 * The farthest the canvas reaches from the globe's centre: the distance to its
 * farthest corner. Anything the projection places further out is off screen.
 */
export function reachFor(cx: number, cy: number, width: number, height: number): number {
  'worklet';
  const dx = Math.max(cx, width - cx);
  const dy = Math.max(cy, height - cy);
  return Math.hypot(dx, dy);
}

/**
 * How far from the camera, in degrees, the ground can be and still land on the
 * canvas. A point θ from the camera is drawn `scale · sin θ` from the centre,
 * so this is `asin(reach / scale)` once the planet outgrows the screen, and the
 * whole hemisphere — the real limb — until then.
 *
 * It is what the globe clips to. Zooming used to clip at the zoom's own angle
 * and stretch that cap across a fixed disc, which drew a patch of the ground
 * with a horizon painted around it; clipping at what the canvas can show lets
 * the planet grow past the screen's edges instead.
 */
export function viewAngleFor(scale: number, reach: number): number {
  'worklet';
  if (!(scale > reach)) return MAX_CLIP;
  return Math.asin(reach / scale) * RAD2DEG;
}

/** The most a swipe zooms out on its way between two stories, as a factor of
 *  the globe's scale. Never past the whole planet. */
export const SWIPE_OUT_MAX = 1.25;
/** Camera travel, in degrees, that earns the whole zoom-out. A swipe between
 *  two stories in one region barely leaves the ground. */
export const SWIPE_OUT_TRAVEL = 90;

/**
 * The clip partway through a swipe from one story's framing to the next.
 *
 * **Out, across, in** — the shape of a map's `flyTo`: the camera rises in
 * proportion to how far it is going, the planet turns under it, and it comes
 * down close over the story it lands on. Interpolated in log scale, because
 * zoom is perceived as a ratio. The rise is `sin²`, not `sin`: flat at both
 * ends, so the planet does not start moving the instant a finger does, and a
 * card settling onto its story does not bounce the zoom on the way in. At 1.7×
 * with a plain sine it read as the map jumping on every swipe.
 *
 * It replaced a smoothstep between the two framings, which — once zooming grew
 * the planet itself instead of the ground inside a fixed disc — made the whole
 * globe swell and shrink by two times between a small country and a large one,
 * with no relation to where the camera was going.
 */
export function swipeClip(
  fromClip: number,
  toClip: number,
  frac: number,
  travelDeg: number,
): number {
  'worklet';
  const t = frac <= 0 ? 0 : frac >= 1 ? 1 : frac;
  const eased = t * t * (3 - 2 * t);
  const from = Math.log(1 / Math.sin(fromClip * DEG2RAD));
  const to = Math.log(1 / Math.sin(toClip * DEG2RAD));
  const reach =
    travelDeg <= 0 ? 0 : travelDeg >= SWIPE_OUT_TRAVEL ? 1 : travelDeg / SWIPE_OUT_TRAVEL;
  const bump = Math.sin(Math.PI * t);
  const out = Math.log(SWIPE_OUT_MAX) * reach * bump * bump;
  const logScale = from + (to - from) * eased - out;
  if (logScale <= 0) return MAX_CLIP;
  return Math.asin(Math.exp(-logScale)) * RAD2DEG;
}

/**
 * A point partway along the great circle between two places, `[lat, lng]`.
 *
 * The globe turns along the surface of the sphere, the way a finger tracing a
 * route on a real globe would; interpolating latitude and longitude apart cuts
 * a rhumb line and swings wide near the poles. The deck and every flight use
 * this one path, pinned against d3's `geoInterpolate`. Points closer than a
 * few kilometres fall back to a straight step, where a slerp's `sin(ω)`
 * denominator vanishes.
 */
export function slerpLatLng(
  lat0: number,
  lng0: number,
  lat1: number,
  lng1: number,
  t: number,
): [number, number] {
  'worklet';
  const p0 = lat0 * DEG2RAD;
  const l0 = lng0 * DEG2RAD;
  const p1 = lat1 * DEG2RAD;
  const l1 = lng1 * DEG2RAD;
  const c0 = Math.cos(p0);
  const c1 = Math.cos(p1);
  const x0 = c0 * Math.cos(l0);
  const y0 = c0 * Math.sin(l0);
  const z0 = Math.sin(p0);
  const x1 = c1 * Math.cos(l1);
  const y1 = c1 * Math.sin(l1);
  const z1 = Math.sin(p1);
  const dot = x0 * x1 + y0 * y1 + z0 * z1;
  const omega = Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot);
  if (omega > 0.001) {
    const sinO = Math.sin(omega);
    const a = Math.sin((1 - t) * omega) / sinO;
    const b = Math.sin(t * omega) / sinO;
    const rx = a * x0 + b * x1;
    const ry = a * y0 + b * y1;
    const rz = a * z0 + b * z1;
    return [Math.asin(rz > 1 ? 1 : rz < -1 ? -1 : rz) * RAD2DEG, Math.atan2(ry, rx) * RAD2DEG];
  }
  let dLng = lng1 - lng0;
  if (dLng > 180) dLng -= 360;
  if (dLng < -180) dLng += 360;
  return [lat0 + (lat1 - lat0) * t, lng0 + dLng * t];
}

/** The angle between two places at the earth's centre, in degrees. */
export function arcDegrees(lat0: number, lng0: number, lat1: number, lng1: number): number {
  'worklet';
  const p0 = lat0 * DEG2RAD;
  const p1 = lat1 * DEG2RAD;
  const dLng = (lng1 - lng0) * DEG2RAD;
  const cos = Math.sin(p0) * Math.sin(p1) + Math.cos(p0) * Math.cos(p1) * Math.cos(dLng);
  return Math.acos(cos > 1 ? 1 : cos < -1 ? -1 : cos) * RAD2DEG;
}

/** A flight between neighbours, and one to the far side of the planet. */
export const FLIGHT_MIN_MS = 450;
export const FLIGHT_MAX_MS = 1000;

/**
 * How long a flight takes for the distance it covers. A fixed 700 ms crawled
 * between two cities in one country and whipped the planet half round for a
 * story on the other side of it. The square root keeps a short hop brisk and
 * a long one from dragging; the rise that goes with it is `swipeClip`'s.
 */
export function flightDuration(travelDeg: number): number {
  'worklet';
  const f = travelDeg <= 0 ? 0 : travelDeg >= 180 ? 1 : travelDeg / 180;
  return Math.round(FLIGHT_MIN_MS + (FLIGHT_MAX_MS - FLIGHT_MIN_MS) * Math.sqrt(f));
}

/**
 * Take the camera for a gesture or a flight, starting from where the globe
 * last drew it. `cameraLat`/`cameraLng` only mean something while a target
 * owns the camera; while the deck owns it they keep whatever the last flight
 * left, and starting from them snapped the earth back to a story already
 * swiped past. `viewLat`/`viewLng` are where the globe is, whoever moved it.
 */
export function takeCamera(
  owner: { value: number },
  lat: { value: number },
  lng: { value: number },
  viewLat: { value: number },
  viewLng: { value: number },
): void {
  'worklet';
  if (owner.value === 1) return;
  lat.value = viewLat.value;
  lng.value = viewLng.value;
  owner.value = 1;
}
