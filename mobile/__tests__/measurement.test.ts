const mockKv = new Map<string, string>();
const mockSettings = {
  initializeSDK: jest.fn(),
  setAutoLogAppEventsEnabled: jest.fn(),
  setAdvertiserIDCollectionEnabled: jest.fn(),
};
const mockLogger = { setFlushBehavior: jest.fn(), flush: jest.fn() };
const mockPlatform = { OS: 'android' };
const KEY = 'zuhd_measurement_consent_v1';

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: (key: string) => mockKv.get(key) ?? null,
    setItemSync: (key: string, value: string) => mockKv.set(key, value),
  },
}));
jest.mock('react-native', () => ({
  LogBox: { ignoreLogs: jest.fn() },
  get Platform() {
    return mockPlatform;
  },
}));
jest.mock('react-native-fbsdk-next/lib/commonjs/FBSettings', () => ({
  __esModule: true,
  default: mockSettings,
}));
jest.mock('react-native-fbsdk-next/lib/commonjs/FBAppEventsLogger', () => ({
  __esModule: true,
  default: mockLogger,
}));

function load(): typeof import('../lib/measurement') {
  let mod: typeof import('../lib/measurement') | undefined;
  jest.isolateModules(() => {
    mod = require('../lib/measurement');
  });
  if (!mod) throw new Error('measurement did not load');
  return mod;
}

beforeEach(() => {
  mockKv.clear();
  mockPlatform.OS = 'android';
  jest.clearAllMocks();
});

describe('nothing runs without a yes', () => {
  it('a phone that was never asked touches no SDK at launch', () => {
    load().startMeasurement();
    expect(mockSettings.initializeSDK).not.toHaveBeenCalled();
    expect(mockSettings.setAdvertiserIDCollectionEnabled).not.toHaveBeenCalled();
  });

  it('a no on a phone that never said yes makes no SDK call', () => {
    load().setMeasurementAnswer(false);
    expect(mockSettings.initializeSDK).not.toHaveBeenCalled();
    expect(mockSettings.setAutoLogAppEventsEnabled).not.toHaveBeenCalled();
  });

  it.each([
    ['unparseable', 'not json'],
    ['another version', JSON.stringify({ allowed: true, version: 0 })],
    ['a non-boolean', JSON.stringify({ allowed: 'yes', version: 1 })],
  ])('%s reads as no answer', (_name, stored) => {
    mockKv.set(KEY, stored);
    const m = load();
    expect(m.getMeasurementAnswer()).toBeNull();
    m.startMeasurement();
    expect(mockSettings.initializeSDK).not.toHaveBeenCalled();
  });

  it('an iPhone never starts it, even with a stored yes', () => {
    mockPlatform.OS = 'ios';
    mockKv.set(KEY, JSON.stringify({ allowed: true, version: 1 }));
    const m = load();
    m.startMeasurement();
    m.setMeasurementAnswer(false);
    expect(mockSettings.initializeSDK).not.toHaveBeenCalled();
    expect(mockSettings.setAutoLogAppEventsEnabled).not.toHaveBeenCalled();
  });
});

describe('a yes', () => {
  it('turns collection on before it initializes, then sends the launch', () => {
    load().setMeasurementAnswer(true);
    const on = mockSettings.setAutoLogAppEventsEnabled.mock.invocationCallOrder[0] ?? Infinity;
    const init = mockSettings.initializeSDK.mock.invocationCallOrder[0] ?? -1;
    expect(mockSettings.setAutoLogAppEventsEnabled).toHaveBeenCalledWith(true);
    expect(mockSettings.setAdvertiserIDCollectionEnabled).toHaveBeenCalledWith(true);
    expect(on).toBeLessThan(init);
    expect(mockLogger.flush).toHaveBeenCalledTimes(1);
  });

  it('holds across launches, and starts once in a launch', () => {
    load().setMeasurementAnswer(true);
    jest.clearAllMocks();
    const next = load();
    expect(next.getMeasurementAnswer()).toBe(true);
    next.startMeasurement();
    next.startMeasurement();
    expect(mockSettings.initializeSDK).toHaveBeenCalledTimes(1);
  });
});

describe('withdrawing', () => {
  it('turns collection off and holds the queue', () => {
    const m = load();
    m.setMeasurementAnswer(true);
    jest.clearAllMocks();
    m.setMeasurementAnswer(false);
    expect(mockSettings.setAutoLogAppEventsEnabled).toHaveBeenCalledWith(false);
    expect(mockSettings.setAdvertiserIDCollectionEnabled).toHaveBeenCalledWith(false);
    expect(mockLogger.setFlushBehavior).toHaveBeenCalledWith('explicit_only');
    expect(mockLogger.flush).not.toHaveBeenCalled();
  });

  it('does not start on the next launch', () => {
    const m = load();
    m.setMeasurementAnswer(true);
    m.setMeasurementAnswer(false);
    jest.clearAllMocks();
    load().startMeasurement();
    expect(mockSettings.initializeSDK).not.toHaveBeenCalled();
  });

  it('a later yes releases the held queue', () => {
    const m = load();
    m.setMeasurementAnswer(true);
    m.setMeasurementAnswer(false);
    jest.clearAllMocks();
    m.setMeasurementAnswer(true);
    expect(mockLogger.setFlushBehavior).toHaveBeenCalledWith('auto');
    expect(mockLogger.flush).toHaveBeenCalledTimes(1);
  });
});

describe('who is asked', () => {
  it('a new Android reader who has not answered', () => {
    expect(load().shouldAskForMeasurement(0)).toBe(true);
  });

  it('not a reader who has already read', () => {
    expect(load().shouldAskForMeasurement(1)).toBe(false);
  });

  it('not twice, whatever the answer', () => {
    const m = load();
    m.setMeasurementAnswer(false);
    expect(m.shouldAskForMeasurement(0)).toBe(false);
  });

  it('never on iOS', () => {
    mockPlatform.OS = 'ios';
    expect(load().shouldAskForMeasurement(0)).toBe(false);
  });
});
