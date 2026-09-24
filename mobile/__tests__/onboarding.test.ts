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

  it('caps reading depth once every contextual hint is eligible', () => {
    const s = loadStore();
    const listener = jest.fn();
    s.subscribe(listener);

    for (let i = 0; i < s.ONBOARDING_SNAP_CAP + 5; i++) s.recordArticleSnap();

    expect(s.getSnapshot().snapCount).toBe(s.ONBOARDING_SNAP_CAP);
    expect(listener).toHaveBeenCalledTimes(s.ONBOARDING_SNAP_CAP);
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
  const map = { screenReader: false, surface: 'map' as const };

  it('fresh state → swipe, the gesture that browses the news', () => {
    const s = loadStore();
    const h = loadHints();
    expect(h.eligibleHint(s.getSnapshot(), map)).toBe('swipe');
  });

  it('the globe lesson follows once the swipe has been performed', () => {
    const s = loadStore();
    const h = loadHints();
    s.recordArticleSnap(); // the first swipe retires the swipe lesson
    expect(h.eligibleHint(s.getSnapshot(), map)).toBe('globe');
  });

  it('the globe lesson follows a dismissed swipe lesson', () => {
    const s = loadStore();
    const h = loadHints();
    s.dismissHint('swipe');
    expect(h.eligibleHint(s.getSnapshot(), map)).toBe('globe');
  });

  it('the masthead lesson follows the globe lesson', () => {
    const s = loadStore();
    const h = loadHints();
    s.recordArticleSnap();
    s.markHintDone('globe');
    expect(h.eligibleHint(s.getSnapshot(), map)).toBe('masthead');
    s.markHintDone('masthead');
    expect(h.eligibleHint(s.getSnapshot(), map)).toBeNull();
  });

  it('a lesson that timed out on screen rests for the session, and the next follows', () => {
    const s = loadStore();
    const h = loadHints();
    s.recordArticleSnap();
    expect(h.eligibleHint(s.getSnapshot(), map, new Set(['globe']))).toBe('masthead');
    // Not dismissed: a later session, with nothing rested, teaches it again.
    expect(h.eligibleHint(s.getSnapshot(), map)).toBe('globe');
  });

  it('never teaches sources or bookmark — the grown card prints both as words', () => {
    const s = loadStore();
    const h = loadHints();
    s.recordArticleSnap();
    s.markHintDone('globe');
    s.markHintDone('masthead');
    s.recordArticleSnap();
    s.recordArticleSnap();
    expect(h.eligibleHint(s.getSnapshot(), map)).toBeNull();
  });

  it('hints are withheld from screen-reader users', () => {
    const s = loadStore();
    const h = loadHints();
    expect(h.eligibleHint(s.getSnapshot(), { ...map, screenReader: true })).toBeNull();
    s.recordArticleSnap();
    expect(h.eligibleHint(s.getSnapshot(), { ...map, screenReader: true })).toBeNull();
  });

  it('every lesson is taught on the map', () => {
    const h = loadHints();
    expect(h.hintSurface('globe')).toBe('map');
    expect(h.hintSurface('swipe')).toBe('map');
    expect(h.hintSurface('sources')).toBe('map');
    expect(h.hintSurface('bookmark')).toBe('map');
    expect(h.hintSurface('masthead')).toBe('map');
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
    // The exhausted swipe lesson steps aside for the next one.
    expect(h.eligibleHint(s2.getSnapshot(), map)).toBe('globe');
  });

  it('existing users are never eligible for anything', () => {
    mockFiles.set(LAST_SEEN_PATH, '1');
    const s = loadStore();
    const h = loadHints();
    expect(h.eligibleHint(s.getSnapshot(), map)).toBeNull();
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

  it('state saved before the masthead hint existed loads whole, with it dismissed', () => {
    mockKv.set(
      'zuhd_onboarding',
      JSON.stringify({
        version: 1,
        seededAt: 1,
        hints: {
          swipe: { status: 'done', showCount: 1 },
          sources: { status: 'pending', showCount: 0 },
          bookmark: { status: 'pending', showCount: 0 },
          globe: { status: 'pending', showCount: 2 },
        },
        snapCount: 2,
        primer: { status: 'declined', decidedAt: 5 },
      }),
    );
    const s = loadStore();
    const state = s.getSnapshot();
    // Not reseeded: the primer's answer and the reading depth survive.
    expect(state.primer.status).toBe('declined');
    expect(state.snapCount).toBe(2);
    expect(state.hints.globe).toEqual({ status: 'pending', showCount: 2 });
    expect(state.hints.masthead).toEqual({ status: 'dismissed', showCount: 0 });
  });

  it('show tips again re-arms the masthead lesson', () => {
    mockFiles.set(LAST_SEEN_PATH, '1');
    const s = loadStore();
    expect(s.getSnapshot().hints.masthead.status).toBe('dismissed');
    s.resetOnboarding();
    expect(s.getSnapshot().hints.masthead.status).toBe('pending');
  });

  it('markOsPromptSpent writes the legacy key', async () => {
    const s = loadStore();
    await s.markOsPromptSpent();
    expect(mockSecure.get('zuhd_notif_asked')).toBe('1');
  });
});
