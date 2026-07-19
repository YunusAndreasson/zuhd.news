/**
 * Onboarding store (hint pills + notification primer) + hint eligibility.
 *
 * The store loads and seeds at import time, so every test (re)loads it via
 * jest.isolateModules against in-memory legacy-file and SQLite stores. Each load models one
 * app session (the shown-once-per-session guard resets with the module).
 */

// In-memory backing for the expo mocks. `mock` prefix required — jest.mock
// factories may only reference out-of-scope variables with that prefix.
let mockFiles: Map<string, string>;
let mockKv: Map<string, string>;
let mockSecure: Map<string, string>;
let mockPermissions: { granted: boolean; canAskAgain: boolean };
const mockPrefs = { notifications: false };

jest.mock('expo-file-system', () => ({
  Paths: { document: '/doc' },
  File: class MockFile {
    path: string;
    constructor(dir: string, name: string) {
      this.path = `${dir}/${name}`;
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    textSync() {
      const v = mockFiles.get(this.path);
      if (v == null) throw new Error(`missing file ${this.path}`);
      return v;
    }
    write(content: string) {
      mockFiles.set(this.path, content);
    }
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockSecure.set(k, v);
  }),
}));

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn((k: string) => mockKv.get(k) ?? null),
    setItemSync: jest.fn((k: string, v: string) => {
      mockKv.set(k, v);
    }),
    getItem: jest.fn(async (k: string) => mockKv.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockKv.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockKv.delete(k);
    }),
  },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => mockPermissions),
}));

jest.mock('../lib/storage', () => ({
  getPreferences: jest.fn(async () => mockPrefs),
}));

const ONBOARDING_PATH = '/doc/zuhd-onboarding.json';
const LAST_SEEN_PATH = '/doc/zuhd-last-seen';

type Store = typeof import('../lib/onboarding-store');
type Hints = typeof import('../hooks/useOnboardingHints');

/** One app session: fresh module instance over the shared in-memory fs. */
function loadStore(): Store {
  let store: Store | undefined;
  jest.isolateModules(() => {
    store = require('../lib/onboarding-store');
  });
  if (!store) throw new Error('store failed to load');
  return store;
}

function loadHints(): Hints {
  let hints: Hints | undefined;
  jest.isolateModules(() => {
    hints = require('../hooks/useOnboardingHints');
  });
  if (!hints) throw new Error('hints failed to load');
  return hints;
}

/** Let the fire-and-forget legacy-migration promise chain settle (fake-timer
 *  advancement flushes the interleaved microtasks). */
const settle = () => jest.advanceTimersByTimeAsync(10);

beforeEach(() => {
  // Fake timers keep each store instance's 100ms persist debounce from firing
  // across test boundaries and polluting the next test's in-memory fs — every
  // write in these tests goes through an explicit flushOnboarding().
  jest.useFakeTimers();
  mockFiles = new Map();
  mockKv = new Map();
  mockSecure = new Map();
  mockPermissions = { granted: false, canAskAgain: true };
  mockPrefs.notifications = false;
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('seeding', () => {
  it('fresh install: everything pending', () => {
    const s = loadStore();
    const state = s.getSnapshot();
    expect(state.snapCount).toBe(0);
    expect(state.primer.status).toBe('pending');
    for (const id of s.HINT_IDS) {
      expect(state.hints[id]).toEqual({ status: 'pending', showCount: 0 });
    }
  });

  it('existing user (zuhd-last-seen present): hints dismissed', () => {
    mockFiles.set(LAST_SEEN_PATH, '1751970000000');
    const s = loadStore();
    const state = s.getSnapshot();
    for (const id of s.HINT_IDS) {
      expect(state.hints[id].status).toBe('dismissed');
    }
  });

  it('existing user via bookmarks file only', () => {
    mockFiles.set('/doc/zuhd-bookmarks.json', '[]');
    const s = loadStore();
    expect(s.getSnapshot().hints.swipe.status).toBe('dismissed');
  });

  it('existing user via migrated SQLite state only', () => {
    mockKv.set('zuhd_last_seen', '1751970000000');
    const s = loadStore();
    expect(s.getSnapshot().hints.swipe.status).toBe('dismissed');
  });

  it('corrupt state file reseeds via the existing-user check', () => {
    mockFiles.set(ONBOARDING_PATH, '{not json');
    mockFiles.set(LAST_SEEN_PATH, '1');
    const s = loadStore();
    expect(s.getSnapshot().hints.swipe.status).toBe('dismissed');
  });
});

describe('legacy primer migration (runs only on seed)', () => {
  it('legacy cold-prompt key → legacy, never re-asked', async () => {
    mockSecure.set('zuhd_notif_asked', '1');
    const s = loadStore();
    await settle();
    expect(s.getSnapshot().primer.status).toBe('legacy');
  });

  it('OS permission already granted → accepted (beats legacy key)', async () => {
    mockSecure.set('zuhd_notif_asked', '1');
    mockPermissions = { granted: true, canAskAgain: false };
    const s = loadStore();
    await settle();
    expect(s.getSnapshot().primer.status).toBe('accepted');
  });

  it('prefs notifications on → accepted', async () => {
    mockPrefs.notifications = true;
    const s = loadStore();
    await settle();
    expect(s.getSnapshot().primer.status).toBe('accepted');
  });

  it('denied with canAskAgain=false → never (a primer could not deliver)', async () => {
    mockPermissions = { granted: false, canAskAgain: false };
    const s = loadStore();
    await settle();
    expect(s.getSnapshot().primer.status).toBe('never');
  });

  it('fresh device with no signals stays pending', async () => {
    const s = loadStore();
    await settle();
    expect(s.getSnapshot().primer.status).toBe('pending');
  });
});

describe('actions', () => {
  it('first snap completes the swipe lesson', () => {
    const s = loadStore();
    s.recordArticleSnap();
    const state = s.getSnapshot();
    expect(state.snapCount).toBe(1);
    expect(state.hints.swipe.status).toBe('done');
  });

  it('performing the taught action retires the hint across sessions', () => {
    let s = loadStore();
    s.markHintDone('sources');
    s.flushOnboarding();
    s = loadStore();
    expect(s.getSnapshot().hints.sources.status).toBe('done');
  });

  it('recordHintShown counts once per session', () => {
    const s = loadStore();
    s.recordHintShown('swipe');
    s.recordHintShown('swipe');
    expect(s.getSnapshot().hints.swipe.showCount).toBe(1);
  });

  it('a hint expires on its final permitted showing', () => {
    let s = loadStore();
    for (let session = 1; session <= s.MAX_HINT_SHOWS; session++) {
      s.recordHintShown('swipe');
      s.flushOnboarding();
      if (session < s.MAX_HINT_SHOWS) s = loadStore();
    }
    const entry = s.getSnapshot().hints.swipe;
    expect(entry.showCount).toBe(s.MAX_HINT_SHOWS);
    expect(entry.status).toBe('expired');
  });
});

describe('eligibleHint', () => {
  const ctx = { screenReader: false };

  it('fresh state → swipe', () => {
    loadStore();
    const h = loadHints();
    const s = loadStore();
    expect(h.eligibleHint(s.getSnapshot(), ctx)).toBe('swipe');
  });

  it('one hint at a time — one tip per article read, in sequence', () => {
    const s = loadStore();
    const h = loadHints();
    expect(h.eligibleHint(s.getSnapshot(), ctx)).toBe('swipe');
    s.recordArticleSnap(); // swipe done, snapCount 1 → 2nd article
    expect(h.eligibleHint(s.getSnapshot(), ctx)).toBe('sources');
    s.dismissHint('sources');
    s.recordArticleSnap(); // 3rd article
    expect(h.eligibleHint(s.getSnapshot(), ctx)).toBe('bookmark');
    s.markHintDone('bookmark');
    s.recordArticleSnap(); // 4th article
    expect(h.eligibleHint(s.getSnapshot(), ctx)).toBe('globe');
    s.markHintDone('globe');
    expect(h.eligibleHint(s.getSnapshot(), ctx)).toBeNull();
  });

  it('a later hint waits for its predecessor to resolve', () => {
    const s = loadStore();
    const h = loadHints();
    s.recordArticleSnap();
    s.recordArticleSnap(); // depth for bookmark reached…
    s.dismissHint('sources');
    expect(h.eligibleHint(s.getSnapshot(), ctx)).toBe('bookmark');
  });

  it('globe hint is withheld from screen-reader users', () => {
    const s = loadStore();
    const h = loadHints();
    s.markHintDone('swipe');
    s.markHintDone('sources');
    s.markHintDone('bookmark');
    for (let i = 0; i < 3; i++) s.recordArticleSnap();
    expect(h.eligibleHint(s.getSnapshot(), { screenReader: true })).toBeNull();
    expect(h.eligibleHint(s.getSnapshot(), { screenReader: false })).toBe('globe');
  });

  it('an exhausted showCount blocks a still-pending hint', () => {
    const s = loadStore();
    const h = loadHints();
    // Simulate prior sessions by writing the count directly through the API.
    for (let i = 0; i < s.MAX_HINT_SHOWS; i++) {
      s.recordHintShown('swipe'); // once-per-session guard…
    }
    // …means only one increment landed this session; force the rest via
    // reloads.
    s.flushOnboarding();
    let s2 = loadStore();
    s2.recordHintShown('swipe');
    s2.flushOnboarding();
    s2 = loadStore();
    s2.recordHintShown('swipe');
    expect(h.eligibleHint(s2.getSnapshot(), ctx)).toBeNull();
  });

  it('existing users are never eligible for anything', () => {
    mockFiles.set(LAST_SEEN_PATH, '1');
    const s = loadStore();
    const h = loadHints();
    expect(h.eligibleHint(s.getSnapshot(), ctx)).toBeNull();
  });
});

describe('persistence', () => {
  it('round-trips through SQLite', () => {
    let s = loadStore();
    s.recordArticleSnap();
    s.recordArticleSnap();
    s.setPrimerStatus('declined');
    s.flushOnboarding();
    expect(mockKv.has('zuhd_onboarding')).toBe(true);
    s = loadStore();
    const state = s.getSnapshot();
    expect(state.snapCount).toBe(2);
    expect(state.primer.status).toBe('declined');
    expect(state.hints.swipe.status).toBe('done');
  });

  it('migrates a valid legacy file into SQLite', () => {
    const first = loadStore();
    first.recordArticleSnap();
    first.flushOnboarding();
    const serialized = mockKv.get('zuhd_onboarding');
    expect(serialized).toBeDefined();

    mockKv.clear();
    mockFiles.set(ONBOARDING_PATH, serialized as string);
    const migrated = loadStore();

    expect(migrated.getSnapshot().snapCount).toBe(1);
    expect(mockKv.get('zuhd_onboarding')).toBe(serialized);
  });

  it('markOsPromptSpent writes the legacy key', async () => {
    const s = loadStore();
    await s.markOsPromptSpent();
    expect(mockSecure.get('zuhd_notif_asked')).toBe('1');
  });
});
