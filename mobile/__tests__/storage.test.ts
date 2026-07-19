import { DEFAULT_PREFS, type Preferences } from '../constants/theme';

let mockFiles: Map<string, string>;
let mockKv: Map<string, string>;
let mockSecure: Map<string, string>;
const mockDeleteSecure = jest.fn(async (key: string) => {
  mockSecure.delete(key);
});

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
    async text() {
      const value = mockFiles.get(this.path);
      if (value == null) throw new Error(`missing file ${this.path}`);
      return value;
    }
    write(value: string) {
      mockFiles.set(this.path, value);
    }
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecure.get(key) ?? null),
  deleteItemAsync: mockDeleteSecure,
}));

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockKv.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockKv.set(key, value);
    }),
  },
}));

type StorageModule = typeof import('../lib/storage');

function loadStorage(): StorageModule {
  let storage: StorageModule | undefined;
  jest.isolateModules(() => {
    storage = require('../lib/storage');
  });
  if (!storage) throw new Error('storage failed to load');
  return storage;
}

const customPrefs: Preferences = {
  fontSize: 'large',
  fontFamily: 'system',
  appearance: 'light',
  haptics: false,
  notifications: true,
};

beforeEach(() => {
  mockFiles = new Map();
  mockKv = new Map();
  mockSecure = new Map();
  mockDeleteSecure.mockClear();
});

describe('SQLite-backed UX storage', () => {
  it('prefers current SQLite preferences over conflicting legacy values', async () => {
    mockKv.set('zuhd_preferences_v2', JSON.stringify(customPrefs));
    mockFiles.set('/doc/zuhd-preferences.json', JSON.stringify(DEFAULT_PREFS));
    mockSecure.set('zuhd_preferences', JSON.stringify(DEFAULT_PREFS));

    await expect(loadStorage().getPreferences()).resolves.toEqual(customPrefs);
    expect(mockDeleteSecure).not.toHaveBeenCalled();
  });

  it('migrates valid file preferences into SQLite', async () => {
    const serialized = JSON.stringify(customPrefs);
    mockFiles.set('/doc/zuhd-preferences.json', serialized);

    await expect(loadStorage().getPreferences()).resolves.toEqual(customPrefs);
    expect(mockKv.get('zuhd_preferences_v2')).toBe(serialized);
  });

  it('does not promote malformed legacy preferences into the active store', async () => {
    mockFiles.set('/doc/zuhd-preferences.json', '{bad json');

    await expect(loadStorage().getPreferences()).resolves.toEqual(DEFAULT_PREFS);
    expect(mockKv.has('zuhd_preferences_v2')).toBe(false);
  });

  it('migrates SecureStore last-seen state and removes the legacy secret', async () => {
    mockSecure.set('zuhd_lastSeenAt', '1751970000000');

    await expect(loadStorage().getLastSeenAt()).resolves.toBe(1751970000000);
    expect(mockKv.get('zuhd_last_seen')).toBe('1751970000000');
    expect(mockDeleteSecure).toHaveBeenCalledWith('zuhd_lastSeenAt');
  });

  it('writes current values directly to SQLite', async () => {
    const storage = loadStorage();
    await storage.saveLastSeenAt(1234);
    await storage.savePreferences(customPrefs);

    expect(mockKv.get('zuhd_last_seen')).toBe('1234');
    expect(JSON.parse(mockKv.get('zuhd_preferences_v2') as string)).toEqual(customPrefs);
  });
});
