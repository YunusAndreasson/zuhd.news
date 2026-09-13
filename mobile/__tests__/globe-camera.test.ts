import { geoOrthographic } from 'd3-geo';
import {
  anchorZoom,
  dragDelta,
  flingVelocity,
  invertOrthographic,
  MAX_CLIP,
  MAX_FLING_PX_S,
  MAX_LAT,
  MIN_CLIP,
  pinchClip,
  projScaleFor,
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
