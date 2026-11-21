/**
 * The record behind `first_time`: kept only from a new install's first open,
 * so an install that predates it never claims a first.
 */
let mockKv: Map<string, string>;

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn((key: string) => mockKv.get(key) ?? null),
    setItemSync: jest.fn((key: string, value: string) => {
      mockKv.set(key, value);
    }),
  },
}));

type Firsts = typeof import('../lib/firsts');

/** One launch: a fresh module over the same storage. */
function load(): Firsts {
  let mod: Firsts | undefined;
  jest.isolateModules(() => {
    mod = require('../lib/firsts');
  });
  if (!mod) throw new Error('firsts failed to load');
  return mod;
}

beforeEach(() => {
  mockKv = new Map();
});

it('an install with no record has no firsts: it was in use before the record began', () => {
  const firsts = load();
  expect(firsts.claimFirst('read')).toBe(false);
  expect(firsts.claimFirst('briefing')).toBe(false);
});

it('from a first open, each first is claimed once, across launches', () => {
  const first = load();
  first.startFirsts();
  expect(first.claimFirst('read')).toBe(true);
  expect(first.claimFirst('read')).toBe(false);
  const next = load();
  expect(next.claimFirst('read')).toBe(false);
  expect(next.claimFirst('briefing')).toBe(true);
  expect(load().claimFirst('briefing')).toBe(false);
});

it('after an erase nothing is a first', () => {
  const firsts = load();
  firsts.startFirsts();
  firsts.clearFirsts();
  expect(firsts.claimFirst('read')).toBe(false);
});

it('an unreadable record is no record', () => {
  mockKv.set('zuhd_firsts_v1', '{not json');
  expect(load().claimFirst('read')).toBe(false);
});
