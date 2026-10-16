import { createJsonCache } from '../lib/json-cache';

let mockFiles: Map<string, string>;
let mockFailWrites: boolean;

// Like expo-file-system 58: `write()` is asynchronous and lands on a later
// tick; `writeSync()` lands before it returns.
jest.mock('expo-file-system', () => ({
  Paths: { cache: '/cache' },
  File: class MockFile {
    path: string;
    constructor(dir: string, name: string) {
      this.path = `${dir}/${name}`;
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    async text() {
      return this.textSync();
    }
    textSync() {
      const value = mockFiles.get(this.path);
      if (value == null) throw new Error(`missing file ${this.path}`);
      return value;
    }
    write(content: string) {
      return new Promise<void>((resolve, reject) =>
        setTimeout(() => {
          if (mockFailWrites) return reject(new Error('disk full'));
          mockFiles.set(this.path, content);
          resolve();
        }, 10),
      );
    }
    writeSync(content: string) {
      if (mockFailWrites) throw new Error('disk full');
      mockFiles.set(this.path, content);
    }
    delete() {
      mockFiles.delete(this.path);
    }
  },
}));

type Feed = { generated: string };
const isFeed = (value: unknown): value is Feed =>
  typeof value === 'object' && value !== null && typeof (value as Feed).generated === 'string';

beforeEach(() => {
  mockFiles = new Map();
  mockFailWrites = false;
});

describe('the JSON cache', () => {
  // A background task resolves once the feed is saved, and the OS may suspend
  // the runtime the moment it does: the write has to have landed by then.
  it('has written the value by the time a write resolves', async () => {
    const cache = createJsonCache('feed.json', isFeed);
    await cache.write({ generated: '2026-10-16T12:00:00Z' });
    expect(mockFiles.get('/cache/feed.json')).toBe('{"generated":"2026-10-16T12:00:00Z"}');
    expect(cache.readSync()).toEqual({ generated: '2026-10-16T12:00:00Z' });
  });

  it('resolves quietly when a write fails', async () => {
    mockFailWrites = true;
    const cache = createJsonCache('feed.json', isFeed);
    await expect(cache.write({ generated: 'x' })).resolves.toBeUndefined();
    expect(mockFiles.has('/cache/feed.json')).toBe(false);
  });

  it('reads a value that fails validation as a miss', async () => {
    mockFiles.set('/cache/feed.json', '{"generated":42}');
    const cache = createJsonCache('feed.json', isFeed);
    await expect(cache.read()).resolves.toBeNull();
    expect(cache.readSync()).toBeNull();
  });
});
