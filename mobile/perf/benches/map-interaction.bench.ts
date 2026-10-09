import { GlobeFrameHistory, globeTransform, inverseGlobePoint } from '../../lib/globe-display';
import { type GlobeHitGeometry, hitGlobeMarks } from '../../lib/globe-hit-test';
import { markTap } from '../../lib/tap-result';
import { bench } from '../bench-utils';

const point = (i: number) => ({ x: (i * 73) % 400, y: (i * 137) % 800 });
const frame: GlobeHitGeometry = {
  storyMarks: Array.from({ length: 80 }, (_, i) => ({
    ...point(i),
    slug: `story-${i}`,
    color: 'story',
  })),
  readMarks: [],
  chokepoints: [],
  marketMarks: [],
  gdacsMarks: [],
  conflictMarks: Array.from({ length: 400 }, (_, i) => ({ ...point(i), id: `event-${i}` })),
  famineMarks: [],
  thermalMarks: [],
  genocideMarks: [],
  hotspotGlows: [],
  dot: null,
  makkah: null,
  discRadius: 600,
};
const context = {
  hotspot: () => markTap({ isHotspot: true }),
  dot: () => null,
  makkah: () => markTap({}),
};

export const denseTap = bench({
  name: 'map.interaction.dense-tap-480-marks',
  iterations: 1000,
  run() {
    const transform = globeTransform(
      { lat: 50, lng: 20, k: 600 },
      { lat: 51, lng: 24, clip: 17 },
      200,
      350,
      400,
      800,
      180,
    );
    const tap = inverseGlobePoint(190, 300, transform);
    hitGlobeMarks(frame, tap.x, tap.y, transform.scale, context);
  },
});

export const history = bench({
  name: 'map.interaction.publish-acknowledge',
  iterations: 1000,
  setup: () => new GlobeFrameHistory<GlobeHitGeometry>(),
  run(frames) {
    const revision = frames.publish(frame);
    frames.acknowledge(revision);
    frames.get(revision);
  },
});
