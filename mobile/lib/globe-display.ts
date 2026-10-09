import { reachFor } from './globe-camera';

export interface RecordedCamera {
  lat: number;
  lng: number;
  k: number;
}

export interface LiveCamera {
  lat: number;
  lng: number;
  clip: number;
}

export interface GlobeTransform {
  x: number;
  y: number;
  scale: number;
}

/** Small enough to capture at touch-up without transferring hit geometry. */
export interface GlobeTapFrame extends GlobeTransform {
  revision: number;
}

export const IDENTITY_GLOBE_TRANSFORM: GlobeTransform = { x: 0, y: 0, scale: 1 };

/** Fade the approximation out while the globe's limb comes into view. */
const WARP_NO_LIMB = 0.4;
const WARP_FULL_LIMB = 0.6;

/** The same affine approximation drives drawing and inverse tap coordinates. */
export function globeTransform(
  cam: RecordedCamera | null,
  live: LiveCamera | null,
  cx: number,
  cy: number,
  width: number,
  height: number,
  radius: number,
): GlobeTransform {
  'worklet';
  if (!cam || !live || !(cam.k > 0)) return IDENTITY_GLOBE_TRANSFORM;
  const strength = Math.min(
    1,
    Math.max(
      0,
      (cam.k / reachFor(cx, cy, width, height) - WARP_NO_LIMB) / (WARP_FULL_LIMB - WARP_NO_LIMB),
    ),
  );
  if (strength === 0) return IDENTITY_GLOBE_TRANSFORM;
  const rad = Math.PI / 180;
  const phi0 = cam.lat * rad;
  const phi = live.lat * rad;
  const dl = (live.lng - cam.lng) * rad;
  const cosPhi = Math.cos(phi);
  if (Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * cosPhi * Math.cos(dl) <= 0.2)
    return IDENTITY_GLOBE_TRANSFORM;
  const dx = strength * cam.k * cosPhi * Math.sin(dl);
  const dy =
    -strength * cam.k * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * cosPhi * Math.cos(dl));
  const kNow = radius / Math.sin(Math.max(1, live.clip) * rad);
  const scale = 1 + (kNow / cam.k - 1) * strength;
  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05 && Math.abs(scale - 1) < 1e-4)
    return IDENTITY_GLOBE_TRANSFORM;
  return { x: cx - scale * (cx + dx), y: cy - scale * (cy + dy), scale };
}

export function inverseGlobePoint(x: number, y: number, transform: GlobeTransform) {
  'worklet';
  return { x: (x - transform.x) / transform.scale, y: (y - transform.y) / transform.scale };
}

/** Keep hit geometry until the UI has consumed it. Acknowledgements and taps
 * arrive on the same UI → JS queue, so a newer acknowledgement cannot evict
 * a frame whose tap is still ahead of it in that queue. Keep one predecessor
 * too, for the frame boundary at which the acknowledgement is scheduled.
 * No Skia pictures or geographic paths belong in this history. */
export class GlobeFrameHistory<T> {
  private frames = new Map<number, T>();
  private revision = 0;

  publish(frame: T): number {
    this.frames.set(++this.revision, frame);
    return this.revision;
  }

  get(revision: number): T | undefined {
    return this.frames.get(revision);
  }

  acknowledge(revision: number): void {
    for (const key of this.frames.keys()) {
      if (key < revision - 1) this.frames.delete(key);
    }
  }
}
