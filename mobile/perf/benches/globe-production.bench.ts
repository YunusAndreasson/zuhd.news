/** The generated geometry and projection path used by MiniGlobe today.
 * Legacy projection benches intentionally remain as d3 reference workloads.
 * This measures JS geometry work; it excludes Skia and native rendering. */
import { type GeographyTier, getGlobeGeography } from '../../components/globe/geography';
import {
  createOrthoLayer,
  type OrthoLayer,
  type PathSink,
} from '../../components/globe/ortho-stream';
import { orthoView } from '../../components/globe/sphere-circles';
import { reachFor, viewAngleFor } from '../../lib/globe-camera';
import { bench } from '../bench-utils';

const CAMERAS = [
  [10, 50, 'Germany'],
  [-100, 40, 'United States of America'],
  [100, 35, 'China'],
  [39.8, 21.4, 'Saudi Arabia'],
  [-60, -15, 'Brazil'],
  [140, -25, 'Australia'],
] as const;

interface Scene {
  name: string;
  tier: GeographyTier;
  clip: number;
  precision: number;
  zoom?: boolean;
}

const SCENES: Scene[] = [
  { name: 'motion.rotate', tier: 'motion', clip: 40, precision: 0 },
  { name: 'motion.zoom', tier: 'motion', clip: 40, precision: 0, zoom: true },
  { name: 'overview', tier: 'overview', clip: 40, precision: 0.25 },
  { name: 'regional', tier: 'regional', clip: 10, precision: 0.25 },
  { name: 'detail', tier: 'detail', clip: 2, precision: 0.25 },
];

type Stage = 'land' | 'borders' | 'ice' | 'highlight' | 'all';

function setup(scene: Scene) {
  const geography = getGlobeGeography(scene.tier);
  const land = geography.land;
  const borders = geography.borders;
  const ice = geography.ice;
  const highlights = CAMERAS.map((camera) => geography.country(camera[2]));
  const output = {
    commands: 0,
    checksum: 0,
    moveTo(x: number, y: number) {
      this.commands++;
      this.checksum += x + y;
    },
    lineTo(x: number, y: number) {
      this.commands++;
      this.checksum += x + y;
    },
    close() {
      this.commands++;
    },
  } satisfies PathSink & { commands: number; checksum: number };
  return { land, borders, ice, highlights, output, frame: 0 };
}

function frame(ctx: ReturnType<typeof setup>, scene: Scene, stage: Stage) {
  const index = ctx.frame++ % CAMERAS.length;
  const [lng, lat] = CAMERAS[index] as (typeof CAMERAS)[number];
  const framing = scene.zoom ? scene.clip - index * 6 : scene.clip;
  const scale = 180 / Math.sin((framing * Math.PI) / 180);
  // MiniGlobe clips at the canvas corners, not at the story's framing.
  const clip = viewAngleFor(scale, reachFor(200, 300, 400, 600));
  const view = orthoView(lng, lat, scale, 200, 300);
  // MiniGlobe retains resampling above its MOTION_RESAMPLE_SCALE (400).
  const precision = scene.zoom && scale > 400 ? 0.25 : scene.precision;
  ctx.output.commands = 0;
  ctx.output.checksum = 0;
  const draw = (layer: OrthoLayer | undefined) => {
    layer?.draw(view, clip, precision, ctx.output);
  };
  if (stage === 'all' || stage === 'land') draw(ctx.land);
  if (stage === 'all' || stage === 'borders') draw(ctx.borders);
  if (stage === 'all' || stage === 'ice') draw(ctx.ice);
  if (stage === 'all' || stage === 'highlight') draw(ctx.highlights[index]);
}

// Named exports let the existing runner discover the component costs and
// the complete geometry pass, with exactly the same deterministic cameras.
function spec(sceneIndex: number, stage: Stage) {
  const scene = SCENES[sceneIndex] as Scene;
  return bench({
    name: `globe.production.${scene.name}.${stage}`,
    iterations: 240,
    warmup: 60,
    setup: () => setup(scene),
    run: (ctx) => frame(ctx, scene, stage),
  });
}

export const motionLand = spec(0, 'land');
export const motionBorders = spec(0, 'borders');
export const motionIce = spec(0, 'ice');
export const motionHighlight = spec(0, 'highlight');
export const motionAll = spec(0, 'all');
export const zoomAll = spec(1, 'all');
export const overviewLand = spec(2, 'land');
export const overviewBorders = spec(2, 'borders');
export const overviewIce = spec(2, 'ice');
export const overviewHighlight = spec(2, 'highlight');
export const overviewAll = spec(2, 'all');
export const regionalLand = spec(3, 'land');
export const regionalBorders = spec(3, 'borders');
export const regionalIce = spec(3, 'ice');
export const regionalHighlight = spec(3, 'highlight');
export const regionalAll = spec(3, 'all');
export const detailLand = spec(4, 'land');
export const detailBorders = spec(4, 'borders');
export const detailIce = spec(4, 'ice');
export const detailHighlight = spec(4, 'highlight');
export const detailAll = spec(4, 'all');

function construction(tier: GeographyTier) {
  return bench({
    name: `globe.production.${tier}.construct-land`,
    iterations: 30,
    warmup: 5,
    // The wide query returns all coordinates, rather than a viewport subset.
    setup: () => ({ geometry: getGlobeGeography(tier).land.visible(0, 0, 180), parts: 0 }),
    run: (ctx) => {
      ctx.parts = createOrthoLayer(ctx.geometry).partCount;
    },
  });
}
export const buildMotion = construction('motion');
export const buildOverview = construction('overview');
export const buildRegional = construction('regional');
export const buildDetail = construction('detail');
