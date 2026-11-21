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

describe('on by default on Android, off only when turned off', () => {
  it('a phone with nothing stored starts it at launch, with nothing asked', () => {
    const m = load();
    expect(m.isMeasurementOn()).toBe(true);
    m.startMeasurement();
    expect(mockSettings.setAdvertiserIDCollectionEnabled).toHaveBeenCalledWith(true);
    expect(mockSettings.initializeSDK).toHaveBeenCalledTimes(1);
  });

  it("a stored no stays off: an older build's no, or its dismissed question", () => {
    mockKv.set(KEY, JSON.stringify({ allowed: false, version: 1 }));
    const m = load();
    expect(m.isMeasurementOn()).toBe(false);
    m.startMeasurement();
    expect(mockSettings.initializeSDK).not.toHaveBeenCalled();
    expect(mockSettings.setAdvertiserIDCollectionEnabled).not.toHaveBeenCalled();
  });

  it('turning it off before it started switches collection off and holds no queue', () => {
    load().setMeasurementAnswer(false);
    expect(mockSettings.initializeSDK).not.toHaveBeenCalled();
    expect(mockSettings.setAutoLogAppEventsEnabled).toHaveBeenCalledWith(false);
    expect(mockLogger.setFlushBehavior).not.toHaveBeenCalled();
  });

  it.each([
    ['unparseable', 'not json'],
    ['another version', JSON.stringify({ allowed: false, version: 0 })],
    ['a non-boolean', JSON.stringify({ allowed: 'no', version: 1 })],
  ])('%s reads as never set, which is on', (_name, stored) => {
    mockKv.set(KEY, stored);
    const m = load();
    expect(m.getMeasurementAnswer()).toBeNull();
    expect(m.isMeasurementOn()).toBe(true);
  });

  it('an iPhone never starts it, even with a stored yes', () => {
    mockPlatform.OS = 'ios';
    mockKv.set(KEY, JSON.stringify({ allowed: true, version: 1 }));
    const m = load();
    expect(m.isMeasurementOn()).toBe(false);
    m.startMeasurement();
    m.setMeasurementAnswer(false);
    expect(mockSettings.initializeSDK).not.toHaveBeenCalled();
    expect(mockSettings.setAutoLogAppEventsEnabled).not.toHaveBeenCalled();
  });

  it('an iPhone with nothing stored never starts it either', () => {
    mockPlatform.OS = 'ios';
    const m = load();
    expect(m.isMeasurementOn()).toBe(false);
    m.startMeasurement();
    expect(mockSettings.initializeSDK).not.toHaveBeenCalled();
  });
});

describe('turning it on', () => {
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

describe('turning it off', () => {
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

  it('turning it back on releases the held queue', () => {
    const m = load();
    m.setMeasurementAnswer(true);
    m.setMeasurementAnswer(false);
    jest.clearAllMocks();
    m.setMeasurementAnswer(true);
    expect(mockLogger.setFlushBehavior).toHaveBeenCalledWith('auto');
    expect(mockLogger.flush).toHaveBeenCalledTimes(1);
  });
});
