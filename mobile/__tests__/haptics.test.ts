/**
 * `lib/haptics` on each platform. Android goes through
 * `performAndroidHapticsAsync` (`View.performHapticFeedback`) and nothing else:
 * `impactAsync`, `selectionAsync` and `notificationAsync` are raw `Vibrator`
 * waveforms there — the buzz Android's guidance prefers silence over — and
 * they ignore the system's touch-feedback setting. Below the API level a
 * constant arrived in, an older View constant stands in, never the Vibrator.
 */
type HapticsLib = typeof import('../lib/haptics');
type ExpoHaptics = typeof import('expo-haptics');

function load(os: 'ios' | 'android', version = 0): { lib: HapticsLib; native: ExpoHaptics } {
  let lib: HapticsLib | undefined;
  let native: ExpoHaptics | undefined;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: os, Version: version } }));
    jest.doMock('../constants/platform', () => ({ IS_ANDROID: os === 'android' }));
    native = require('expo-haptics');
    lib = require('../lib/haptics');
  });
  if (!lib || !native) throw new Error('haptics failed to load');
  return { lib, native };
}

const fireAll = (lib: HapticsLib) => {
  lib.hapticTick();
  lib.hapticSwipe();
  lib.hapticImpact();
  lib.hapticNotification();
  lib.hapticError();
};

const androidCalls = (native: ExpoHaptics) =>
  (native.performAndroidHapticsAsync as jest.Mock).mock.calls.map(([type]) => type);

const vibratorCalls = (native: ExpoHaptics) =>
  [native.impactAsync, native.selectionAsync, native.notificationAsync].reduce(
    (n, fn) => n + (fn as jest.Mock).mock.calls.length,
    0,
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('haptics', () => {
  it('uses the API 34 and API 30 constants where the OS has them', () => {
    const { lib, native } = load('android', 34);
    fireAll(lib);
    expect(androidCalls(native)).toEqual([
      'segment-tick',
      'segment-frequent-tick',
      'clock-tick',
      'confirm',
      'reject',
    ]);
    expect(vibratorCalls(native)).toBe(0);
  });

  it('falls back to older View constants below them, never to the Vibrator', () => {
    for (const [api, expected] of [
      [30, ['clock-tick', 'clock-tick', 'clock-tick', 'confirm', 'reject']],
      [26, ['clock-tick', 'clock-tick', 'clock-tick', 'context-click', 'long-press']],
    ] as const) {
      jest.clearAllMocks();
      const { lib, native } = load('android', api);
      fireAll(lib);
      expect(androidCalls(native)).toEqual(expected);
      expect(vibratorCalls(native)).toBe(0);
    }
  });

  it('uses the feedback generators on iOS', () => {
    const { lib, native } = load('ios');
    fireAll(lib);
    expect(native.selectionAsync).toHaveBeenCalledTimes(1);
    expect((native.impactAsync as jest.Mock).mock.calls).toEqual([['soft'], ['light']]);
    expect((native.notificationAsync as jest.Mock).mock.calls).toEqual([['success'], ['error']]);
    expect(native.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it('is silent while the reader has haptics off', () => {
    for (const os of ['ios', 'android'] as const) {
      jest.clearAllMocks();
      const { lib, native } = load(os, 34);
      lib.setHapticsEnabled(false);
      fireAll(lib);
      expect(androidCalls(native)).toEqual([]);
      expect(vibratorCalls(native)).toBe(0);
      lib.setHapticsEnabled(true);
      lib.hapticTick();
      expect(androidCalls(native).length + vibratorCalls(native)).toBe(1);
    }
  });

  it('swallows a rejected call: a constant the device lacks is not an error', async () => {
    const { lib, native } = load('android', 34);
    (native.performAndroidHapticsAsync as jest.Mock).mockReturnValueOnce(
      Promise.reject(new Error('This device does not support the selected haptic type')),
    );
    expect(() => lib.hapticTick()).not.toThrow();
    await Promise.resolve();
  });
});
