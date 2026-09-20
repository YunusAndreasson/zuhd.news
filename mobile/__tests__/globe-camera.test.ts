import { geoDistance, geoInterpolate, geoOrthographic } from 'd3-geo';
import {
  anchorZoom,
  arcDegrees,
  dragDelta,
  FLIGHT_MAX_MS,
  FLIGHT_MIN_MS,
  flingVelocity,
  FLY_RHO,
  flyCurve,
  flyMs,
  flyPeak,
  flyPosition,
  flySpanClip,
  invertOrthographic,
  MAX_CLIP,
  MAX_FLING_PX_S,
  MAX_LAT,
  MIN_CLIP,
  pinchClip,
  projScaleFor,
  projScaleFor as projScale,
  reachFor,
  slerpLatLng,
  SPAN_PER_CLIP,
  SWIPE_OUT_MAX,
  takeCamera,
  viewAngleFor,
} from '../lib/globe-camera';

const R = 180;
const CX = 200;
const CY = 320;

function projection(lng: number, lat: number, scale: number) {
  return geoOrthographic()
    .clipAngle(90)
    .precision(0)
    .rotate([-lng, -lat, 0])
    .scale(scale)
    .translate([CX, CY]);
}

describe('dragDelta', () => {
  // The whole point: the ground at the centre of the disc moves with the finger.
  it.each([
    [0, 0, 90],
    [30, 45, 90],
    [-120, -20, 18],
    [45, 60, 10],
  ])('keeps the centre under the finger at lng %p lat %p clip %p', (lng, lat, clip) => {
    const scale = projScaleFor(clip, R);
    const dx = 2;
    const dy = -1.5;
    const { dLng, dLat } = dragDelta(dx, dy, clip, R, lat);
    const moved = projection(lng + dLng, lat + dLat, scale)([lng, lat]);
    expect(moved).not.toBeNull();
    expect(moved?.[0]).toBeCloseTo(CX + dx, 1);
    expect(moved?.[1]).toBeCloseTo(CY + dy, 1);
  });

  it('turns less for the same finger travel when zoomed in', () => {
    const wide = dragDelta(10, 0, 90, R, 0).dLng;
    const tight = dragDelta(10, 0, 18, R, 0).dLng;
    expect(Math.abs(tight)).toBeLessThan(Math.abs(wide));
  });

  it('does not spin near the pole', () => {
    const atPole = dragDelta(10, 0, 90, R, MAX_LAT).dLng;
    const at78 = dragDelta(10, 0, 90, R, 78.5).dLng;
    expect(atPole).toBeCloseTo(at78, 6);
  });
});

describe('flingVelocity', () => {
  it('treats a slow release as a stop', () => {
    expect(flingVelocity(60, 40, 90, R, 0)).toEqual({ vLng: 0, vLat: 0 });
  });

  it('caps the speed along the direction of travel', () => {
    const capped = flingVelocity(8000, 6000, 90, R, 0);
    const atCap = dragDelta(MAX_FLING_PX_S * 0.8, MAX_FLING_PX_S * 0.6, 90, R, 0);
    expect(capped.vLng).toBeCloseTo(atCap.dLng, 9);
    expect(capped.vLat).toBeCloseTo(atCap.dLat, 9);
  });

  it('matches the drag conversion under the cap', () => {
    const v = flingVelocity(600, 0, 18, R, 30);
    expect(v.vLng).toBeCloseTo(dragDelta(600, 0, 18, R, 30).dLng, 9);
    expect(v.vLat).toBe(0);
  });
});

describe('pinchClip', () => {
  it('is the identity at scale 1', () => {
    expect(pinchClip(37, 1)).toBeCloseTo(37, 9);
  });

  it('zooms in when the fingers spread and out when they close', () => {
    expect(pinchClip(40, 1.1)).toBeLessThan(40);
    expect(pinchClip(40, 0.9)).toBeGreaterThan(40);
  });

  it('scales the disc by exactly the pinch', () => {
    const before = projScaleFor(40, R);
    const after = projScaleFor(pinchClip(40, 1.25), R);
    expect(after / before).toBeCloseTo(1.25, 9);
  });

  it('clamps to the hemisphere and the tightest zoom', () => {
    expect(pinchClip(80, 0.5)).toBe(MAX_CLIP);
    expect(pinchClip(12, 4)).toBeCloseTo(MIN_CLIP, 9);
  });

  it('ignores a degenerate scale', () => {
    expect(pinchClip(30, 0)).toBe(30);
    expect(pinchClip(30, Number.NaN)).toBe(30);
  });
});

describe('invertOrthographic', () => {
  it.each([
    [0, 0, 150, 140],
    [39.8, 21.4, 260, 300],
    [-100, 55, 90, 420],
    [170, -35, 330, 250],
  ])('matches d3 at camera (%p, %p), point (%p, %p)', (lng, lat, x, y) => {
    const scale = projScaleFor(40, R);
    const d3 = projection(lng, lat, scale).invert?.([x, y]);
    const ours = invertOrthographic(x, y, lng, lat, scale, CX, CY);
    expect(ours).not.toBeNull();
    expect(d3).toBeTruthy();
    // Compare as unit vectors so ±180 wrapping cannot fail an equal point.
    const toUnit = (p: [number, number]) => {
      const la = (p[1] * Math.PI) / 180;
      const lo = (p[0] * Math.PI) / 180;
      return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    };
    const a = toUnit(ours as [number, number]);
    const b = toUnit(d3 as [number, number]);
    for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i] as number, 6);
  });

  it('returns null off the disc', () => {
    expect(invertOrthographic(CX + R + 5, CY, 0, 0, R, CX, CY)).toBeNull();
  });
});

describe('anchorZoom', () => {
  it('keeps the ground under the fingers through a pinch', () => {
    let lng = 20;
    let lat = 30;
    let clip = 60;
    const fx = CX + 70;
    const fy = CY - 40;
    const target = invertOrthographic(fx, fy, lng, lat, projScaleFor(clip, R), CX, CY);
    expect(target).not.toBeNull();
    // Twenty small steps, as a gesture delivers them.
    for (let i = 0; i < 20; i++) {
      const next = pinchClip(clip, 1.04);
      const cam = anchorZoom(
        fx,
        fy,
        fx,
        fy,
        lng,
        lat,
        projScaleFor(clip, R),
        projScaleFor(next, R),
        CX,
        CY,
      );
      expect(cam).not.toBeNull();
      lng = cam?.lng ?? lng;
      lat = cam?.lat ?? lat;
      clip = next;
    }
    const where = projection(lng, lat, projScaleFor(clip, R))(target as [number, number]);
    expect(where?.[0]).toBeCloseTo(fx, -0.5);
    expect(where?.[1]).toBeCloseTo(fy, -0.5);
  });

  it('turns the earth with a two-finger drag', () => {
    let lng = -40;
    let lat = 10;
    const scale = projScaleFor(30, R);
    let fx = CX - 50;
    const fy = CY + 20;
    const target = invertOrthographic(fx, fy, lng, lat, scale, CX, CY);
    for (let i = 0; i < 12; i++) {
      const cam = anchorZoom(fx, fy, fx + 6, fy, lng, lat, scale, scale, CX, CY);
      expect(cam).not.toBeNull();
      lng = cam?.lng ?? lng;
      lat = cam?.lat ?? lat;
      fx += 6;
    }
    const where = projection(lng, lat, scale)(target as [number, number]);
    expect(where?.[0]).toBeCloseTo(fx, -0.5);
    expect(where?.[1]).toBeCloseTo(fy, -0.5);
  });

  it('declines when the fingers are off the disc', () => {
    expect(anchorZoom(CX + 400, CY, CX + 400, CY, 0, 0, R, R * 1.1, CX, CY)).toBeNull();
  });
});

describe('viewAngleFor', () => {
  it('draws the whole hemisphere while the planet fits the canvas', () => {
    expect(viewAngleFor(projScaleFor(90, R), 400)).toBe(MAX_CLIP);
    // A story's tight framing on a tall canvas still shows the real limb.
    expect(viewAngleFor(projScaleFor(25, R), reachFor(CX, CY, 400, 900))).toBe(MAX_CLIP);
  });

  it('stops where the ground leaves the farthest corner', () => {
    const reach = reachFor(CX, CY, 400, 640);
    const scale = projScaleFor(MIN_CLIP, R);
    const angle = viewAngleFor(scale, reach);
    expect(angle).toBeLessThan(MAX_CLIP);
    // A point that far north of the camera lands exactly `reach` from the centre.
    const pt = projection(0, 0, scale)([0, angle]);
    expect(pt).not.toBeNull();
    if (pt) expect(Math.hypot(pt[0] - CX, pt[1] - CY)).toBeCloseTo(reach, 6);
  });

  it('measures to the farthest corner, wherever the centre sits', () => {
    expect(reachFor(100, 100, 400, 500)).toBeCloseTo(Math.hypot(300, 400));
    expect(reachFor(350, 450, 400, 500)).toBeCloseTo(Math.hypot(350, 450));
  });
});

describe('flyCurve', () => {
  const rise = (from: number, to: number, travel: number) => flyPeak(flyCurve(from, to, travel));

  it('lands exactly on each framing', () => {
    const c = flyCurve(25, 45, 80);
    expect(flySpanClip(c, 0)).toBeCloseTo(25, 6);
    expect(flySpanClip(c, 1)).toBeCloseTo(45, 6);
  });

  it('does not leave the ground between two stories in one place', () => {
    const c = flyCurve(25, 45, 0);
    const mid = flySpanClip(c, 0.5);
    expect(mid).toBeGreaterThan(25);
    expect(mid).toBeLessThan(45);
    // Nowhere to travel, so the position never moves off the one place.
    expect(flyPosition(c, 0.5)).toBe(0.5);
  });

  it('rises further the longer the crossing', () => {
    const hop = rise(21, 21, 10);
    const near = rise(21, 21, 25);
    const far = rise(21, 21, 60);
    expect(hop).toBeGreaterThan(1);
    expect(near).toBeGreaterThan(hop);
    expect(far).toBeGreaterThan(near);
  });

  it('gives a mid-range hop a rise a reader can see', () => {
    // The law this replaced was linear in travel to a 90° saturation, so a
    // 40° crossing — most of them — rose 10% and read as no zoom at all.
    expect(rise(21, 21, 40)).toBeGreaterThan(1.14);
  });

  it('holds the ceiling exactly once the uncapped path would pass it', () => {
    for (const travel of [60, 90, 120, 180]) {
      expect(rise(21, 21, travel)).toBeCloseTo(SWIPE_OUT_MAX, 6);
      // Held by bending ρ down, never by clipping the top off the curve.
      expect(flyCurve(21, 21, travel).rho).toBeLessThan(FLY_RHO);
    }
    // Under the ceiling the path is the paper's own.
    expect(flyCurve(21, 21, 20).rho).toBe(FLY_RHO);
  });

  it('never zooms out past the whole planet', () => {
    expect(flySpanClip(flyCurve(80, 80, 180), 0.5)).toBe(MAX_CLIP);
  });

  it('covers the ground while it is furthest out', () => {
    // The point of the curve: the middle half of a long crossing, where the
    // camera is highest, carries more than half the distance — which is what
    // holds the ground to one speed across the screen. A linear pass would
    // carry exactly half.
    const c = flyCurve(21, 21, 90);
    const middle = flyPosition(c, 0.75) - flyPosition(c, 0.25);
    expect(middle).toBeGreaterThan(0.5);
  });

  it('is monotone along the arc and exact at both ends', () => {
    const c = flyCurve(18, 24, 70);
    expect(flyPosition(c, 0)).toBeCloseTo(0, 9);
    expect(flyPosition(c, 1)).toBeCloseTo(1, 9);
    let last = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const at = flyPosition(c, t);
      expect(at).toBeGreaterThanOrEqual(last);
      last = at;
    }
  });

  // An independent transcription of van Wijk & Nuij (2003) — the formulation
  // MapLibre's `flyTo` flies — so a typo in the port is a failing number
  // rather than a globe that swings oddly and nobody reports.
  it.each([
    [21, 21, 20],
    [18, 24, 40],
    [24, 18, 55],
    [19, 22, 8],
  ])('matches the paper for %p° → %p° over %p°', (from, to, travelDeg) => {
    const c = flyCurve(from, to, travelDeg);
    const rho = c.rho;
    const u1 = travelDeg / SPAN_PER_CLIP;
    const r = (i: 0 | 1) => {
      const b =
        (to * to - from * from + (i ? -1 : 1) * rho ** 4 * u1 * u1) /
        (2 * (i ? to : from) * rho * rho * u1);
      return Math.log(Math.sqrt(b * b + 1) - b);
    };
    const r0 = r(0);
    const S = (r(1) - r0) / rho;
    expect(c.S).toBeCloseTo(S, 9);
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const s = t * S;
      const w = (from * Math.cosh(r0)) / Math.cosh(r0 + rho * s);
      const u =
        (from * (Math.cosh(r0) * Math.tanh(r0 + rho * s) - Math.sinh(r0))) / (rho * rho) / u1;
      expect(flySpanClip(c, t)).toBeCloseTo(w, 9);
      expect(flyPosition(c, t)).toBeCloseTo(u, 9);
    }
  });

  it('measures a journey in screenfuls of ground', () => {
    // `SPAN_PER_CLIP` stands in for the exact span the projection shows, which
    // is what `viewAngleFor` computes. Over the framings a story rests at, on
    // the screens the app ships to, the approximation is within a few percent.
    const screens: [number, number][] = [
      [393, 852],
      [360, 800],
      [430, 932],
    ];
    for (const [width, height] of screens) {
      const radius = Math.round(0.46 * Math.min(width, Math.round(0.34 * height)));
      for (const clip of [18, 21, 24, 26]) {
        const exact = 2 * viewAngleFor(projScale(clip, radius), width / 2);
        expect(exact / clip).toBeCloseTo(SPAN_PER_CLIP, 0.6);
      }
    }
  });
});

describe('flyMs', () => {
  const ms = (travel: number) => flyMs(flyCurve(21, 21, travel));

  it('runs from a brisk hop to a long crossing, and no further', () => {
    expect(ms(0)).toBe(FLIGHT_MIN_MS);
    expect(ms(180)).toBe(FLIGHT_MAX_MS);
    expect(ms(400)).toBe(FLIGHT_MAX_MS);
    let last = 0;
    for (const deg of [0, 5, 20, 45, 90, 135, 180]) {
      const each = ms(deg);
      expect(each).toBeGreaterThanOrEqual(last);
      last = each;
    }
  });

  it('keeps the one pacing that was tuned by hand', () => {
    // The square-root law it replaced gave a 90° crossing 839 ms; `FLY_SPEED`
    // is set so the curve still does, and everything either side of it now
    // follows from the same arithmetic as the rise.
    expect(ms(90)).toBeGreaterThan(800);
    expect(ms(90)).toBeLessThan(880);
  });
});

// The deck and every flight share one great-circle path. d3 works in
// `[lng, lat]`; the camera in `[lat, lng]`.
const PLACES: [string, number, number, number, number][] = [
  ['Khartoum → Tokyo', 15.5, 32.5, 35.7, 139.7],
  ['Tokyo → San Francisco, over the Pacific', 35.7, 139.7, 37.8, -122.4],
  ['Oslo → Wellington, nearly antipodal', 59.9, 10.8, -41.3, 174.8],
  ['Kyiv → Kharkiv', 50.45, 30.52, 49.99, 36.23],
  ['one city, a street apart', 51.5, -0.12, 51.5001, -0.1201],
];

describe('slerpLatLng', () => {
  it.each(PLACES)('follows d3 geoInterpolate — %s', (_, lat0, lng0, lat1, lng1) => {
    const d3 = geoInterpolate([lng0, lat0], [lng1, lat1]);
    for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const [lat, lng] = slerpLatLng(lat0, lng0, lat1, lng1, t);
      const [dLng, dLat] = d3(t);
      expect(lat).toBeCloseTo(dLat, 6);
      // Longitudes compare round the dateline.
      expect(((lng - dLng + 540) % 360) - 180).toBeCloseTo(0, 6);
    }
  });

  it('crosses the Pacific rather than going the long way round', () => {
    const [, lng] = slerpLatLng(35.7, 139.7, 37.8, -122.4, 0.5);
    expect(Math.abs(lng)).toBeGreaterThan(150);
  });
});

describe('arcDegrees', () => {
  it.each(PLACES)('matches d3 geoDistance — %s', (_, lat0, lng0, lat1, lng1) => {
    const expected = (geoDistance([lng0, lat0], [lng1, lat1]) * 180) / Math.PI;
    expect(arcDegrees(lat0, lng0, lat1, lng1)).toBeCloseTo(expected, 6);
  });
});

describe('takeCamera', () => {
  const v = (value: number) => ({ value });

  it('starts from where the globe last drew the camera', () => {
    const owner = v(0);
    const lat = v(-5);
    const lng = v(170);
    takeCamera(owner, lat, lng, v(12), v(34));
    expect([owner.value, lat.value, lng.value]).toEqual([1, 12, 34]);
  });

  it('leaves a camera a target already holds exactly where it is', () => {
    const owner = v(1);
    const lat = v(-5);
    const lng = v(170);
    takeCamera(owner, lat, lng, v(12), v(34));
    expect([owner.value, lat.value, lng.value]).toEqual([1, -5, 170]);
  });
});
