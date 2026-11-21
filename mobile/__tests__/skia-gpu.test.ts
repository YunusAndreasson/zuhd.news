import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '@babel/parser';
import { gpuMissing, readSkiaGpu } from '../lib/skia-gpu';

describe('gpuMissing', () => {
  it('is a device where Dawn found no adapter', () => {
    // As a OnePlus 8 Pro on Android 11 reads it (Sentry ZUHD-2).
    expect(gpuMissing({ isAvailable: false, backend: '' })).toBe(true);
  });

  it('is not a lost device, which react-native-skia replaces', () => {
    expect(gpuMissing({ isAvailable: false, backend: 'Metal' })).toBe(false);
  });

  it('is not a working GPU, nor a reading there is none of', () => {
    expect(gpuMissing({ isAvailable: true, backend: 'Vulkan' })).toBe(false);
    expect(gpuMissing(null)).toBe(false);
    expect(gpuMissing(undefined)).toBe(false);
  });
});

it('reads nothing, rather than throwing, where Skia has no native module', () => {
  // The suite's mock of react-native-skia has no `Skia`.
  expect(readSkiaGpu()).toBeNull();
});

/**
 * The app's JS and worklets make no GPU call. Each of these needs a GPU
 * device: without one (no Dawn adapter) it throws, which on the UI runtime
 * takes the app down (ZUHD-2), and on the iOS main thread, where the UI
 * runtime runs, it waits on the device's lock or for Metal to compile a
 * pipeline (ZUHD-3, ZUHD-4: 10–24 s at launch). Images reach the GPU from the
 * canvases' render threads, as raster images (`bakeSprite`).
 */
const GPU_CALLS = new Set([
  'useTexture',
  'usePictureAsTexture',
  'useImageAsTexture',
  'makeTextureImage',
  'MakeOffscreen',
  'MakeFromGPUTexture',
  'MakeGPUTextureFromImage',
  'drawAsImage',
  'drawAsImageFromPicture',
  'makeImageFromView',
  'getNativeDevice',
]);

const ROOT = join(__dirname, '..');
const DIRS = ['app', 'components', 'hooks', 'lib', 'constants'];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

type Node = { type?: string; name?: unknown; [key: string]: unknown };

function walk(node: unknown, visit: (n: Node) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const n = node as Node;
  if (typeof n.type === 'string') visit(n);
  for (const [key, value] of Object.entries(n)) {
    if (key !== 'loc' && value && typeof value === 'object') walk(value, visit);
  }
}

it('makes no GPU call from JS or a worklet', () => {
  const files = DIRS.flatMap((dir) => sources(join(ROOT, dir)));
  expect(files.length).toBeGreaterThan(150);
  const found: string[] = [];
  for (const file of files) {
    const ast = parse(readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
    // Identifiers only: a comment may name what is not called.
    walk(ast.program, (n) => {
      if (n.type !== 'Identifier' || typeof n.name !== 'string' || !GPU_CALLS.has(n.name)) return;
      const line = (n.loc as { start: { line: number } } | undefined)?.start.line;
      found.push(`${relative(ROOT, file)}:${line} ${n.name}`);
    });
  }
  expect(found).toEqual([]);
});
