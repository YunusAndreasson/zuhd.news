/**
 * d3-geo against `ortho-stream.ts` on the layers the globe draws every frame:
 * the coastline and the border mesh, at a story framing, straight chords (a
 * moving frame) and resampled (a settled one). Same cull, same output — the
 * test pins the commands equal — so the ratio is the projection's own cost.
 */

import { type GeoContext, geoOrthographic, geoPath } from 'd3-geo';
import { createCapCuller } from '../../components/globe/cap-cull';
import { createOrthoLayer, type PathSink } from '../../components/globe/ortho-stream';
import { orthoView } from '../../components/globe/sphere-circles';
import { bench } from '../bench-utils';
import { bordersMeshFull, landFull } from '../fixtures/globe-geometry';

const noop: GeoContext & PathSink = {
  beginPath() {},
  moveTo() {},
  lineTo() {},
  arc() {},
  closePath() {},
  close() {},
};

const CAMERAS: [number, number][] = [
  [10, 50],
  [-100, 40],
  [100, 35],
  [39.8, 21.4],
  [-60, -15],
  [140, -25],
];
const CLIP = 40;
const K = 180 / Math.sin((CLIP * Math.PI) / 180);
let frame = 0;

function d3Setup() {
  const proj = geoOrthographic().translate([200, 300]).scale(K);
  const pg = geoPath().projection(proj).context(noop);
  return { proj, pg, land: createCapCuller(landFull), borders: createCapCuller(bordersMeshFull) };
}

function d3Frame(ctx: ReturnType<typeof d3Setup>, precision: number) {
  const [lng, lat] = CAMERAS[frame++ % CAMERAS.length] as [number, number];
  ctx.proj.clipAngle(CLIP).precision(precision).rotate([-lng, -lat, 0]);
  ctx.pg(ctx.land.visible(lng, lat, CLIP));
  ctx.pg(ctx.borders.visible(lng, lat, CLIP));
}

function layerSetup() {
  return { land: createOrthoLayer(landFull), borders: createOrthoLayer(bordersMeshFull) };
}

function layerFrame(ctx: ReturnType<typeof layerSetup>, precision: number) {
  const [lng, lat] = CAMERAS[frame++ % CAMERAS.length] as [number, number];
  const view = orthoView(lng, lat, K, 200, 300);
  ctx.land.draw(view, CLIP, precision, noop);
  ctx.borders.draw(view, CLIP, precision, noop);
}

export const d3Moving = bench({
  name: 'ortho.d3.land+borders.moving',
  iterations: 300,
  warmup: 40,
  setup: d3Setup,
  run: (ctx) => d3Frame(ctx, 0),
});

export const layerMoving = bench({
  name: 'ortho.stream.land+borders.moving',
  iterations: 300,
  warmup: 40,
  setup: layerSetup,
  run: (ctx) => layerFrame(ctx, 0),
});

export const d3Settled = bench({
  name: 'ortho.d3.land+borders.settled',
  iterations: 300,
  warmup: 40,
  setup: d3Setup,
  run: (ctx) => d3Frame(ctx, 0.25),
});

export const layerSettled = bench({
  name: 'ortho.stream.land+borders.settled',
  iterations: 300,
  warmup: 40,
  setup: layerSetup,
  run: (ctx) => layerFrame(ctx, 0.25),
});

export default d3Moving;
