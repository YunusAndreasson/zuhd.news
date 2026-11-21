/**
 * The events marketer counts once per install: `First Open` with
 * `install_kind`, `Install Attribution` (Android, after a yes to ad
 * measurement) and `Activated`, and the `install_id` that joins them. Each
 * `launch()` is a fresh set of modules over the same device storage.
 */
let mockKv: Map<string, string>;
let mockKvBroken = false;
const mockTracked: unknown[][] = [];
const mockAnswer: { value: boolean | null } = { value: null };
const mockPlatform = { OS: 'android' };
const mockReferrer = jest.fn<Promise<string>, []>();

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: (key: string) => {
      if (mockKvBroken) throw new Error('kv unreadable');
      return mockKv.get(key) ?? null;
    },
    setItemSync: (key: string, value: string) => {
      if (mockKvBroken) throw new Error('kv unwritable');
      mockKv.set(key, value);
    },
  },
}));
jest.mock('react-native', () => ({
  get Platform() {
    return mockPlatform;
  },
}));
jest.mock('expo-application', () => ({ getInstallReferrerAsync: () => mockReferrer() }));
jest.mock('../lib/analytics', () => ({
  analytics: {
    track: (...args: unknown[]) => {
      mockTracked.push(args);
      return Promise.resolve();
    },
  },
}));
jest.mock('../lib/measurement', () => ({ getMeasurementAnswer: () => mockAnswer.value }));

type Record_ = typeof import('../lib/install-record');
type Attribution = typeof import('../lib/install-attribution');
type InstallId = typeof import('../lib/install-id');

function launch(): Record_ & Attribution & InstallId {
  let mods: (Record_ & Attribution & InstallId) | undefined;
  jest.isolateModules(() => {
    mods = {
      ...(require('../lib/install-record') as Record_),
      ...(require('../lib/install-attribution') as Attribution),
      ...(require('../lib/install-id') as InstallId),
    };
  });
  if (!mods) throw new Error('modules did not load');
  return mods;
}

/** A launch of a new install (`new`) or one updated into this code. */
function open(kind: 'new' | 'existing') {
  const app = launch();
  app.openInstallRecord(kind);
  app.trackFirstOpen();
  return app;
}

const names = () => mockTracked.map(([event]) => event);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  mockKv = new Map();
  mockKvBroken = false;
  mockTracked.length = 0;
  mockAnswer.value = null;
  mockPlatform.OS = 'android';
  mockReferrer.mockReset();
  mockReferrer.mockResolvedValue('utm_source=meta&utm_campaign=launch');
});

describe('install_id', () => {
  it('is a random UUID v4, made once and kept across launches', () => {
    const id = launch().getInstallId();
    expect(id).toMatch(UUID_V4);
    expect(launch().getInstallId()).toBe(id);
  });

  it('an erase replaces it, and the new one is kept', () => {
    const app = launch();
    const old = app.getInstallId();
    const next = app.rotateInstallId();
    expect(next).toMatch(UUID_V4);
    expect(next).not.toBe(old);
    expect(app.getInstallId()).toBe(next);
    expect(launch().getInstallId()).toBe(next);
  });

  it('an unreadable store gives none, rather than a second one', () => {
    mockKvBroken = true;
    expect(launch().getInstallId()).toBeNull();
    mockKvBroken = false;
    expect(mockKv.size).toBe(0);
  });
});

describe('First Open', () => {
  it('a new install sends it once, as new, across launches', () => {
    open('new');
    open('new');
    open('existing');
    expect(mockTracked).toEqual([['First Open', { install_kind: 'new' }]]);
  });

  it('an install updated into this code sends it once, as existing', () => {
    open('existing');
    // A later launch keeps the kind it found, whatever it is told.
    open('new');
    expect(mockTracked).toEqual([['First Open', { install_kind: 'existing' }]]);
  });

  it('an unreadable store sends nothing and claims nothing', () => {
    mockKvBroken = true;
    open('new');
    mockKvBroken = false;
    expect(mockTracked).toEqual([]);
    open('new');
    expect(names()).toEqual(['First Open']);
  });

  it('a record it cannot read is never replaced or sent from', () => {
    mockKv.set('zuhd_install_v1', '{not json');
    open('new');
    expect(mockTracked).toEqual([]);
    expect(mockKv.get('zuhd_install_v1')).toBe('{not json');
  });
});

describe('new or existing', () => {
  const DAY = 86_400_000;

  it("is new at a store's first run, whenever that is", () => {
    const { installKind, NEW_INSTALLS_FROM } = launch();
    expect(installKind(true, NEW_INSTALLS_FROM - 400 * DAY)).toBe('new');
  });

  it('is new for an install first opened by an older build since counting began', () => {
    // An ad's install: its first launch ran the store bundle, this code came over the air.
    const { installKind, NEW_INSTALLS_FROM } = launch();
    expect(installKind(false, NEW_INSTALLS_FROM)).toBe('new');
    expect(installKind(false, NEW_INSTALLS_FROM + 30 * DAY)).toBe('new');
  });

  it('is existing for an install first opened before counting began', () => {
    const { installKind, NEW_INSTALLS_FROM } = launch();
    expect(installKind(false, NEW_INSTALLS_FROM - 1)).toBe('existing');
  });

  it('counting began on 2026-11-21, UTC', () => {
    expect(new Date(launch().NEW_INSTALLS_FROM).toISOString()).toBe('2026-11-21T00:00:00.000Z');
  });

  it('a new install first opened by an older build sends its referrer after a yes', async () => {
    mockAnswer.value = true;
    const app = launch();
    app.openInstallRecord(app.installKind(false, app.NEW_INSTALLS_FROM + 3_600_000));
    app.trackFirstOpen();
    await app.sendInstallAttribution();
    expect(mockTracked[0]).toEqual(['First Open', { install_kind: 'new' }]);
    expect(names()).toEqual(['First Open', 'Install Attribution']);
  });
});

describe('the upgrade path: an existing install', () => {
  it('has Install Attribution and Activated spent, and sends neither', async () => {
    mockAnswer.value = true;
    const app = open('existing');
    await app.sendInstallAttribution();
    for (let i = 0; i < 5; i++) app.noteActivation('story_read');
    app.noteActivation('briefing_completed');
    expect(mockReferrer).not.toHaveBeenCalled();
    expect(names()).toEqual(['First Open']);
  });
});

describe('Activated (a proposal: first finished briefing or third story read)', () => {
  it('goes out at the third story read, once', () => {
    const app = open('new');
    app.noteActivation('story_read');
    app.noteActivation('story_read');
    expect(names()).toEqual(['First Open']);
    app.noteActivation('story_read');
    app.noteActivation('story_read');
    app.noteActivation('briefing_completed');
    expect(mockTracked.slice(1)).toEqual([['Activated']]);
  });

  it('goes out at the first finished briefing, whichever comes first', () => {
    const app = open('new');
    app.noteActivation('story_read');
    app.noteActivation('briefing_completed');
    app.noteActivation('story_read');
    app.noteActivation('story_read');
    expect(names()).toEqual(['First Open', 'Activated']);
  });

  it('counts stories across launches', () => {
    open('new').noteActivation('story_read');
    open('new').noteActivation('story_read');
    open('new').noteActivation('story_read');
    expect(names()).toEqual(['First Open', 'Activated']);
    open('new').noteActivation('briefing_completed');
    expect(names()).toEqual(['First Open', 'Activated']);
  });

  it('the trigger is one table: any step at its count activates', () => {
    const { ACTIVATION, reachesActivation } = launch();
    expect(ACTIVATION).toEqual({ briefing_completed: 1, story_read: 3 });
    expect(reachesActivation({ briefing_completed: 0, story_read: 2 })).toBe(false);
    expect(reachesActivation({ briefing_completed: 0, story_read: 3 })).toBe(true);
    expect(reachesActivation({ briefing_completed: 1, story_read: 0 })).toBe(true);
  });

  it('an install with no record never activates', () => {
    const app = launch();
    for (let i = 0; i < 5; i++) app.noteActivation('story_read');
    expect(mockTracked).toEqual([]);
  });
});

describe('Install Attribution', () => {
  it('splits the raw referrer into 200-character parts, in order', () => {
    const { splitReferrer } = launch();
    const referrer = `${'a'.repeat(200)}${'b'.repeat(200)}${'c'.repeat(50)}`;
    const parts = splitReferrer(referrer);
    expect(Object.keys(parts)).toEqual(['referrer_0', 'referrer_1', 'referrer_2']);
    expect(parts.referrer_2).toBe('c'.repeat(50));
    expect(Object.values(parts).join('')).toBe(referrer);
    expect(splitReferrer('x'.repeat(200))).toEqual({ referrer_0: 'x'.repeat(200) });
  });

  it('after a yes, a new Android install sends the raw referrer once', async () => {
    mockAnswer.value = true;
    await open('new').sendInstallAttribution();
    await open('new').sendInstallAttribution();
    expect(mockTracked).toEqual([
      ['First Open', { install_kind: 'new' }],
      ['Install Attribution', { referrer_0: 'utm_source=meta&utm_campaign=launch' }],
    ]);
    expect(mockReferrer).toHaveBeenCalledTimes(1);
  });

  it('a long referrer arrives in parts', async () => {
    mockAnswer.value = true;
    const referrer = `utm_source=apps.facebook.com&utm_content=${'%7B'.repeat(150)}`;
    mockReferrer.mockResolvedValue(referrer);
    await open('new').sendInstallAttribution();
    const [, parts] = mockTracked[1] as [string, Record<string, string>];
    expect(Object.keys(parts)).toEqual(['referrer_0', 'referrer_1', 'referrer_2']);
    expect(Object.values(parts).join('')).toBe(referrer);
  });

  describe('the measurement gate', () => {
    it('no answer yet: nothing is read or sent', async () => {
      await open('new').sendInstallAttribution();
      expect(mockReferrer).not.toHaveBeenCalled();
      expect(names()).toEqual(['First Open']);
    });

    it('a no: never read, never sent, across launches', async () => {
      mockAnswer.value = false;
      await open('new').sendInstallAttribution();
      await open('new').sendInstallAttribution();
      expect(mockReferrer).not.toHaveBeenCalled();
      expect(names()).toEqual(['First Open']);
    });

    it('a later yes sends it then, in the same launch', async () => {
      mockAnswer.value = false;
      const app = open('new');
      await app.sendInstallAttribution();
      mockAnswer.value = true;
      await app.sendInstallAttribution();
      expect(names()).toEqual(['First Open', 'Install Attribution']);
    });

    it('a yes on a later launch sends it then', async () => {
      mockAnswer.value = false;
      await open('new').sendInstallAttribution();
      mockAnswer.value = true;
      await open('new').sendInstallAttribution();
      expect(names()).toEqual(['First Open', 'Install Attribution']);
    });

    it('a no given while the Play Store answers: not sent, and still owed', async () => {
      mockAnswer.value = true;
      const app = open('new');
      let answer: (value: string) => void = () => {};
      mockReferrer.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      const sending = app.sendInstallAttribution();
      mockAnswer.value = false;
      answer('utm_campaign=launch');
      await sending;
      expect(names()).toEqual(['First Open']);
      mockAnswer.value = true;
      await app.sendInstallAttribution();
      expect(names()).toEqual(['First Open', 'Install Attribution']);
    });
  });

  it('iOS sends none and never reads', async () => {
    mockPlatform.OS = 'ios';
    mockAnswer.value = true;
    await open('new').sendInstallAttribution();
    expect(mockReferrer).not.toHaveBeenCalled();
    expect(names()).toEqual(['First Open']);
  });

  it('an empty referrer settles it: nothing sent, nothing read again', async () => {
    mockAnswer.value = true;
    mockReferrer.mockResolvedValue('');
    await open('new').sendInstallAttribution();
    mockReferrer.mockResolvedValue('null');
    await open('new').sendInstallAttribution();
    expect(mockReferrer).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['First Open']);
  });

  it('a stringified null referrer is empty too', async () => {
    mockAnswer.value = true;
    mockReferrer.mockResolvedValue('null');
    await open('new').sendInstallAttribution();
    await open('new').sendInstallAttribution();
    expect(mockReferrer).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['First Open']);
  });

  it('a failed read is tried on a later launch, not again in the same one', async () => {
    mockAnswer.value = true;
    mockReferrer.mockRejectedValueOnce(new Error('service unavailable'));
    const app = open('new');
    await app.sendInstallAttribution();
    await app.sendInstallAttribution();
    expect(mockReferrer).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['First Open']);
    await open('new').sendInstallAttribution();
    expect(names()).toEqual(['First Open', 'Install Attribution']);
  });

  it('is read at most three times, then given up', async () => {
    mockAnswer.value = true;
    mockReferrer.mockRejectedValue(new Error('service unavailable'));
    for (let i = 0; i < 5; i++) await open('new').sendInstallAttribution();
    expect(mockReferrer).toHaveBeenCalledTimes(3);
    mockReferrer.mockResolvedValue('utm_campaign=late');
    await open('new').sendInstallAttribution();
    expect(names()).toEqual(['First Open']);
  });

  it('a read that never answers times out and counts as a failure', async () => {
    jest.useFakeTimers();
    try {
      mockAnswer.value = true;
      mockReferrer.mockReturnValue(new Promise(() => {}));
      const sending = open('new').sendInstallAttribution();
      await jest.advanceTimersByTimeAsync(10_000);
      await sending;
      expect(names()).toEqual(['First Open']);
      expect(JSON.parse(mockKv.get('zuhd_install_v1') ?? '{}').referrerFailures).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('concurrent calls read once', async () => {
    mockAnswer.value = true;
    const app = open('new');
    await Promise.all([app.sendInstallAttribution(), app.sendInstallAttribution()]);
    expect(mockReferrer).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['First Open', 'Install Attribution']);
  });

  it('carries no install_id of its own: only the super property', async () => {
    mockAnswer.value = true;
    await open('new').sendInstallAttribution();
    const [, parts] = mockTracked[1] as [string, Record<string, string>];
    expect(Object.keys(parts).every((key) => /^referrer_\d+$/.test(key))).toBe(true);
  });
});
