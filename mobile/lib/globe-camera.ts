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

/** The tightest clip a pinch reaches. It was 10°, the old closest zoom level,
 *  and the user asked to be able to go a little closer (2026-09-23): 7° is
 *  1.4× the scale, still inside what the detail coastline holds up to. */
export const MIN_CLIP = 7;
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

/** How far past the story's own framing, as a factor on the disc's scale, a
 *  pinch may end and still be "back out to the story": the overshoot of a
 *  reader pinching back to where they started. */
export const PINCH_HAND_BACK_SPREAD = 1.15;
/** A pinch ending this many degrees inside the story's framing is on it. */
const PINCH_HAND_BACK_SLACK = 0.5;

/**
 * Whether a pinch that ends at `zoomClip` gives zoom back to the story in
 * front, whose own framing is `storyClip`.
 *
 * Only a pinch that ends *near* the story's framing does. It was every pinch
 * that ended at the framing or wider, so pinching out to see the whole planet
 * sprang back to the story the moment the fingers lifted, and the whole disc
 * could be seen only while it was being held (2026-09-22). A pinch out past
 * this band stays where it was left, as a pinch in always has; the story's
 * framing comes back when the reader moves to a story, which flies there.
 */
export function pinchHandsBack(zoomClip: number, storyClip: number): boolean {
  'worklet';
  if (!(storyClip > 0)) return false;
  if (zoomClip < storyClip - PINCH_HAND_BACK_SLACK) return false;
  // The disc's scale is `1 / sin(clip)`: this is the story's scale over the
  // pinch's, which grows as the pinch zooms out.
  return Math.sin(zoomClip * DEG2RAD) <= Math.sin(storyClip * DEG2RAD) * PINCH_HAND_BACK_SPREAD;
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

/** A flight between neighbours, and one to the far side of the planet. */
export const FLIGHT_MIN_MS = 450;
export const FLIGHT_MAX_MS = 1000;
/**
 * How long the deck's landing spring really takes to settle.
 *
 * Reanimated's `duration` is *perceptual*: `withSpring` documents the actual
 * settling as 1.5× it, so `ANIMATION.springSettle`'s 350 ms is about 525 ms of
 * travel. `__tests__/motion-tokens.test.ts` holds the two together.
 *
 * It is the bar a landed swipe is measured against. The spring carried the
 * camera whatever the distance, so a quarter of the planet crossed in the same
 * half second as a neighbouring city — and that is the *common* case, because
 * consecutive stories are ordered by time and can be anywhere on earth. A
 * card is text and wants to snap; the earth is a place and wants the time the
 * distance asks for. Where the crossing's own `flyMs` is longer than this, the
 * camera leaves the deck at the finger's lift and flies the rest itself: the
 * same curve, the same landing on the story's framing. Where it is shorter,
 * nothing changes and the earth stays welded to the card, which is what makes
 * a short swipe feel direct. Comparing the two durations rather than picking
 * an arc is what guarantees the hand-off only ever *lengthens* a crossing —
 * one arc could not, because the same distance flies at different speeds from
 * an 18° framing and a 24° one.
 */
export const DECK_SETTLE_MS = Math.round(350 * 1.5);

/** The most a camera move zooms out on its way between two places, as a factor
 *  of the wider of the two framings. Never past the whole planet. */
export const SWIPE_OUT_MAX = 1.25;
/**
 * Ground degrees across the screen, per degree of clip.
 *
 * The projection draws a point θ from the camera at `scale · sin θ`, so the
 * ground the screen's width covers is `2 · asin(halfWidth / scale)`. Over the
 * framings a story ever rests at that is very nearly three times the clip angle
 * on every phone the app ships to: 3.02 at 18°, 3.04 at 21° and 3.11 at 26° on
 * a 393×852 screen; 2.94 to 3.01 on a 360×800 one.
 *
 * `flyCurve` needs it for one ratio only — how many screenfuls of ground a
 * journey is — so it is a calibration constant, not a projection, and the
 * exact figure lives in `viewAngleFor`. `__tests__/globe-camera.test.ts` holds
 * the approximation against it across the band.
 */
export const SPAN_PER_CLIP = 3;
/**
 * Van Wijk's ρ: how far a crossing bows out of its way. 1.35 is the web map's
 * own `flyTo({ curve: 1.35 })` (`public/islands/situation-map.ts`), so the app
 * and the site bend a crossing by the same amount.
 */
export const FLY_RHO = 1.35;
/**
 * Van Wijk's V, in screenfuls of ground per second. Set so a 90° crossing still
 * takes the 839 ms the square-root law it replaced took: that one figure was
 * tuned, the rest of the curve was not, and now follows from it.
 */
const FLY_SPEED = 1.6125;
/** Below this a journey is no journey: `b` would divide by zero. */
const FLY_DEGENERATE_U = 2e-6;
/** Halvings that fit a path under `SWIPE_OUT_MAX`. 24 puts ρ within 1e-7, and
 *  it runs once per crossing, not once per frame. */
const RHO_FIT_STEPS = 24;

/**
 * A camera crossing, worked out once: how far out it rises, how far along it is
 * at a given moment, and how long it should take.
 *
 * **Out, across, in** — the shape of a map's `flyTo`, and now literally that
 * shape: van Wijk & Nuij's *Smooth and efficient zooming and panning* (2003),
 * the path MapLibre's `flyTo` flies. One ρ sets the rise and the pacing
 * together, and the ground crosses the screen at a constant speed — which is
 * the whole point of the paper and the whole point here.
 *
 * It replaced two laws that could not be reconciled because nothing coupled
 * them: a rise linear in travel to a hard ceiling (`ln(1.25) · travel/90 ·
 * sin²(πt)`, which gave an 8° hop 2% and a 40° hop 10%, so most swipes had no
 * zoom at all) and a duration that was a square root of the same travel. At
 * ~500 ms a long crossing rushed the ground past at close range whatever the
 * rise did.
 *
 * Spans are kept in **clip degrees**, so `flySpanClip` reads straight off `w`
 * and both ends of a crossing are exact; the journey is converted into the same
 * units by `SPAN_PER_CLIP`. `u1 === 0` marks the degenerate path — two stories
 * in one place — where the position never moves and the span is a plain
 * exponential between the two framings.
 */
export type FlyCurve = {
  r0: number;
  rho: number;
  /** Path length in van Wijk's `s`; the duration is this over a speed. */
  S: number;
  w0: number;
  w1: number;
  u1: number;
};

/** Van Wijk's `r(i)` — the zoom-out factor at one end of the path. */
function flyR(w0: number, w1: number, u1: number, rho: number, descent: boolean): number {
  'worklet';
  const rho2 = rho * rho;
  const b =
    (w1 * w1 - w0 * w0 + (descent ? -1 : 1) * rho2 * rho2 * u1 * u1) /
    (2 * (descent ? w1 : w0) * rho2 * u1);
  return Math.log(Math.sqrt(b * b + 1) - b);
}

/** The span at path distance `s`, in clip degrees. */
function flySpanAt(c: FlyCurve, s: number): number {
  'worklet';
  if (c.u1 === 0) return c.w0 * Math.exp((c.w1 < c.w0 ? -1 : 1) * c.rho * s);
  return (c.w0 * Math.cosh(c.r0)) / Math.cosh(c.r0 + c.rho * s);
}

function flyBuild(w0: number, w1: number, u1: number, rho: number): FlyCurve {
  'worklet';
  const r0 = flyR(w0, w1, u1, rho, false);
  const r1 = flyR(w0, w1, u1, rho, true);
  return { r0, rho, S: (r1 - r0) / rho, w0, w1, u1 };
}

/** How far out of its way a path bows, as a factor of the wider framing. The
 *  top of the arc is where `r0 + ρs` reaches zero, if that falls inside it. */
export function flyPeak(c: FlyCurve): number {
  'worklet';
  const top = -c.r0 / c.rho;
  const s = top < 0 ? 0 : top > c.S ? c.S : top;
  return flySpanAt(c, s) / (c.w0 > c.w1 ? c.w0 : c.w1);
}

/**
 * The crossing from one framing to another over a given arc.
 *
 * Uncapped, the paper's path is steep: two stories 90° apart at a 21° framing
 * bow out to 1.61×, which is the swell that was tried and rejected twice. The
 * ceiling is held by **bisecting ρ down until the path just touches it** —
 * still a true van Wijk path, only a flatter one. MapLibre bounds ρ instead by
 * `√(2·wMax/u1)`, which at these framings still lands near 1.6×, so it is not
 * enough on a globe.
 */
export function flyCurve(fromClip: number, toClip: number, travelDeg: number): FlyCurve {
  'worklet';
  const u1 = travelDeg > 0 ? travelDeg / SPAN_PER_CLIP : 0;
  if (u1 < FLY_DEGENERATE_U) {
    return {
      r0: 0,
      rho: FLY_RHO,
      S: Math.abs(Math.log(toClip / fromClip)) / FLY_RHO,
      w0: fromClip,
      w1: toClip,
      u1: 0,
    };
  }
  const full = flyBuild(fromClip, toClip, u1, FLY_RHO);
  if (flyPeak(full) <= SWIPE_OUT_MAX) return full;
  let lo = 1e-4;
  let hi = FLY_RHO;
  for (let i = 0; i < RHO_FIT_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    if (flyPeak(flyBuild(fromClip, toClip, u1, mid)) > SWIPE_OUT_MAX) hi = mid;
    else lo = mid;
  }
  return flyBuild(fromClip, toClip, u1, lo);
}

/** The clip angle partway through a crossing. `t` is 0 at the place left and 1
 *  at the one landed on, and both ends come back exact. */
export function flySpanClip(c: FlyCurve, t: number): number {
  'worklet';
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const clip = flySpanAt(c, k * c.S);
  return clip >= MAX_CLIP ? MAX_CLIP : clip;
}

/**
 * How far along the great circle a crossing has got at `t`, from 0 to 1.
 *
 * Not `t` itself: the path covers most of its ground while it is furthest out,
 * which is exactly what holds the ground to one speed across the screen. Feed
 * it to `slerpLatLng` in place of the raw fraction.
 */
export function flyPosition(c: FlyCurve, t: number): number {
  'worklet';
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  if (c.u1 === 0) return k;
  const s = k * c.S;
  const u =
    (c.w0 * (Math.cosh(c.r0) * Math.tanh(c.r0 + c.rho * s) - Math.sinh(c.r0))) /
    (c.rho * c.rho) /
    c.u1;
  return u <= 0 ? 0 : u >= 1 ? 1 : u;
}

/** How long a flight along this crossing takes: its own length over a speed,
 *  held between a brisk hop and the far side of the planet. */
export function flyMs(c: FlyCurve): number {
  'worklet';
  const ms = (1000 * c.S) / FLY_SPEED;
  return Math.round(ms < FLIGHT_MIN_MS ? FLIGHT_MIN_MS : ms > FLIGHT_MAX_MS ? FLIGHT_MAX_MS : ms);
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
