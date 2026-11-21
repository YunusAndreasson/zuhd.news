/**
 * `Stories Read`: the 1st, 3rd and 10th story newly read in a visit — at most
 * three events a visit, never which story — and the count the primer's
 * fifth-story moment listens to.
 */
let mockKv: Map<string, string>;
const mockTracked: unknown[][] = [];
let mockFirst = true;

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn((key: string) => mockKv.get(key) ?? null),
    setItemSync: jest.fn((key: string, value: string) => {
      mockKv.set(key, value);
    }),
    removeItem: jest.fn(async () => {}),
  },
}));
jest.mock('../lib/analytics', () => ({
  analytics: {
    track: async (...args: unknown[]) => {
      mockTracked.push(args);
    },
  },
}));
jest.mock('../lib/firsts', () => ({
  claimFirst: () => {
    const first = mockFirst;
    mockFirst = false;
    return first;
  },
}));

type ReadStore = typeof import('../lib/read-store');

function load(): ReadStore {
  let mod: ReadStore | undefined;
  jest.isolateModules(() => {
    mod = require('../lib/read-store');
  });
  if (!mod) throw new Error('read-store failed to load');
  return mod;
}

beforeEach(() => {
  mockKv = new Map();
  mockTracked.length = 0;
  mockFirst = true;
});

it('sends the 1st, 3rd and 10th story newly read, and nothing for a story read again', () => {
  const store = load();
  for (let i = 1; i <= 12; i++) {
    store.markRead(`story-${i}`);
    store.markRead(`story-${i}`);
  }
  expect(mockTracked).toEqual([
    ['Stories Read', { count: 1, first_time: true }],
    ['Stories Read', { count: 3, first_time: true }],
    ['Stories Read', { count: 10, first_time: true }],
  ]);
});

it('a new visit counts again, and is no longer the first', () => {
  const store = load();
  store.markRead('a');
  store.startReadingVisit();
  store.markRead('b');
  expect(mockTracked).toEqual([
    ['Stories Read', { count: 1, first_time: true }],
    ['Stories Read', { count: 1, first_time: false }],
  ]);
});

it('tells a listener the visit’s count, until it unsubscribes', () => {
  const store = load();
  const counts: number[] = [];
  const stop = store.onVisitRead((count) => counts.push(count));
  store.markRead('a');
  store.markRead('a');
  store.markRead('b');
  stop();
  store.markRead('c');
  expect(counts).toEqual([1, 2]);
});
