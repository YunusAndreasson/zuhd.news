/** Code-only lifecycle probe. Each sample gets a fresh Node process and JSON
 * module cache. Run: node --import tsx perf/check-geography-lifecycle.ts
 * V8 timings/retention exclude Hermes, React, Skia paths and native memory. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { GeographyTier } from '../components/globe/geography';
import { orthoView } from '../components/globe/sphere-circles';
import { reachFor, viewAngleFor } from '../lib/globe-camera';

const tiers: GeographyTier[] = ['motion', 'overview', 'regional', 'detail'];
const scales = { motion: 280, overview: 280, regional: 1050, detail: 5158 };
const cameras = [
  [10, 50],
  [-100, 40],
  [100, 35],
  [39.8, 21.4],
  [-60, -15],
  [140, -25],
];
const file = fileURLToPath(import.meta.url);

function memory() {
  assert(global.gc, 'Worker requires --expose-gc');
  for (let i = 0; i < 3; i++) global.gc();
  const { heapUsed, external, arrayBuffers, rss } = process.memoryUsage();
  return { heapUsed, external, arrayBuffers, rss };
}

function sink() {
  return {
    commands: 0,
    checksum: 0,
    moveTo(x: number, y: number) {
      assert(Number.isFinite(x) && Number.isFinite(y), 'Nonfinite projected coordinates');
      this.commands++;
      this.checksum += x + y;
    },
    lineTo(x: number, y: number) {
      this.moveTo(x, y);
    },
    close() {
      this.commands++;
    },
  };
}

async function worker(mode: string, tier: GeographyTier) {
  const geography = await import('../components/globe/geography');
  const before = memory();
  const stages: { name: string; ms: number }[] = [];
  const measure = <T>(name: string, run: () => T) => {
    const start = performance.now();
    const result = run();
    stages.push({ name, ms: performance.now() - start });
    return result;
  };
  const output = sink();
  const draw = (
    geo: ReturnType<typeof geography.getGlobeGeography>,
    current: GeographyTier,
    index: number,
    name: string,
  ) => {
    const [lng = 0, lat = 0] = cameras[index % cameras.length] ?? [];
    const scale = scales[current];
    const view = orthoView(lng, lat, scale, 200, 300);
    const clip = viewAngleFor(scale, reachFor(200, 300, 400, 600));
    for (const layer of [geo.land, geo.ice, geo.borders, geo.country(name)]) {
      layer?.draw(view, clip, current === 'motion' ? 0 : 0.25, output);
    }
  };
  if (mode === 'cold' || mode === 'staged') {
    if (mode === 'staged') {
      for (const name of ['asset', 'decode', 'land', 'borders', 'ice']) {
        assert.equal(
          measure(name, () => geography.warmGlobeGeography(tier)),
          false,
        );
      }
      assert.equal(geography.warmGlobeGeography(tier), true);
    }
    measure('first-frame', () => draw(geography.getGlobeGeography(tier), tier, 0, 'Germany'));
    const firstCommands = output.commands;
    const firstChecksum = output.checksum;
    output.commands = 0;
    output.checksum = 0;
    measure('cached-frame', () => draw(geography.getGlobeGeography(tier), tier, 0, 'Germany'));
    assert.equal(output.commands, firstCommands);
    assert.equal(output.checksum, firstChecksum);
    assert(firstCommands > 0);
    return {
      mode,
      tier,
      stages,
      commands: firstCommands,
      checksum: firstChecksum,
      before,
      after: memory(),
    };
  }
  assert.equal(mode, 'memory');
  const loaded = tiers.map((current) => {
    const geo = geography.getGlobeGeography(current);
    // The asset is now intentionally loaded; include every named country,
    // including islands unlikely to be reached by a random camera sample.
    const packed = JSON.parse(
      readFileSync(new URL(`../assets/geo/countries-${current}.json`, import.meta.url), 'utf8'),
    );
    const names: string[] = packed.objects.countries.geometries.map(
      (g: { properties: { name: string } }) => g.properties.name,
    );
    return { tier: current, geo, names };
  });
  const checkpoints: { cycle: number; memory: ReturnType<typeof memory> }[] = [];
  for (let cycle = 0; cycle < 7; cycle++) {
    measure(`exploration-${cycle}`, () => {
      for (const { tier: current, geo, names } of loaded) {
        for (let i = 0; i < names.length; i++) {
          const name = names[(i + cycle * 31) % names.length] ?? '';
          const layer = geo.country(name);
          assert(layer && layer === geo.country(name), 'Country layer was not reused');
          assert.equal(geo.country(`missing-${cycle}-${i}`), undefined);
          draw(geo, current, i + cycle, name);
          geo.countryAt(((i * 137.5 + cycle) % 360) - 180, ((i * 17 + cycle) % 160) - 80);
        }
      }
    });
    checkpoints.push({ cycle, memory: memory() });
  }
  // Discard the first two full passes: countryAt may populate a feature not
  // selected by duplicate names, and projection scratch buffers grow on use.
  const retained = checkpoints
    .slice(2)
    .map((point) => point.memory.heapUsed + point.memory.arrayBuffers);
  const spread = Math.max(...retained) - Math.min(...retained);
  const allowance = Math.max(1024 * 1024, (retained[0] ?? 0) * 0.02);
  assert(
    spread < allowance,
    `Retained JS memory varied by ${spread} bytes (allowance ${allowance})`,
  );
  return {
    mode,
    stages,
    before,
    checkpoints,
    retainedSpreadBytes: spread,
    allowanceBytes: allowance,
    selections: loaded.reduce((n, item) => n + item.names.length, 0) * 7,
  };
}

async function main() {
  const mode = process.argv[2];
  if (mode) {
    const tier = process.argv[3] as GeographyTier;
    assert(mode === 'memory' || tiers.includes(tier));
    process.stdout.write(JSON.stringify(await worker(mode, tier)));
    return;
  }
  const samples: unknown[] = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const current of tiers) {
      for (const scenario of ['cold', 'staged']) {
        const child = spawnSync(
          process.execPath,
          ['--expose-gc', '--import', 'tsx', file, scenario, current],
          { encoding: 'utf8', timeout: 120_000 },
        );
        assert.equal(child.status, 0, child.stderr || String(child.error));
        samples.push(JSON.parse(child.stdout));
      }
    }
    const child = spawnSync(process.execPath, ['--expose-gc', '--import', 'tsx', file, 'memory'], {
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(child.status, 0, child.stderr || String(child.error));
    samples.push(JSON.parse(child.stdout));
    process.stderr.write(`Completed lifecycle sample ${repeat + 1}/3\n`);
  }
  const hashes = Object.fromEntries(
    [
      'components/globe/geography.ts',
      'components/globe/ortho-stream.ts',
      'perf/check-geography-lifecycle.ts',
    ].map((path) => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]),
  );
  process.stdout.write(
    `${JSON.stringify({ date: new Date().toISOString(), node: process.version, cpu: os.cpus()[0]?.model, limitations: 'V8 geometry only; excludes module import/transform, Hermes, React, Skia, native memory and device frame timing. Fresh process JSON loads may use OS filesystem cache. Forced GC checks retention, not peak allocation.', hashes, samples }, null, 2)}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
