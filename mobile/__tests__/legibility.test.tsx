import { act, renderHook } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { PLAIN_LEGIBILITY, withSetting } from '../lib/legibility';

type Hook = typeof import('../hooks/useLegibility');

const react = jest.requireActual('react');
const reactNative = jest.requireMock('react-native');

/** A fresh store, as on a phone running iOS or Android: its own module, with
 *  the same React and the same mocked `AccessibilityInfo` as the test. */
function storeOn(os: 'ios' | 'android'): Hook {
  let hook!: Hook;
  jest.isolateModules(() => {
    jest.doMock('react', () => react);
    jest.doMock('react-native', () => reactNative);
    jest.doMock('../constants/platform', () => ({ IS_ANDROID: os === 'android' }));
    hook = require('../hooks/useLegibility');
  });
  return hook;
}

const info = jest.mocked(AccessibilityInfo);
/** The handler the store registered for an event. */
const handlerFor = (event: string) =>
  info.addEventListener.mock.calls.findLast(([name]) => name === event)?.[1] as
    | ((on: boolean) => void)
    | undefined;

beforeEach(() => jest.clearAllMocks());

it('reads Bold Text, Increase Contrast and Reduce Transparency on iOS', async () => {
  info.isBoldTextEnabled.mockResolvedValueOnce(true);
  info.isReduceTransparencyEnabled.mockResolvedValueOnce(true);
  const { legibilityReady, useLegibility } = storeOn('ios');
  await legibilityReady();
  const { result } = renderHook(useLegibility);
  expect(result.current).toEqual({ boldText: true, moreContrast: false, reduceTransparency: true });
  expect(info.isHighTextContrastEnabled).not.toHaveBeenCalled();
});

it('reads only High contrast text on Android, as more contrast', async () => {
  info.isHighTextContrastEnabled.mockResolvedValueOnce(true);
  const { legibilityReady, useLegibility } = storeOn('android');
  await legibilityReady();
  const { result } = renderHook(useLegibility);
  expect(result.current).toEqual({ ...PLAIN_LEGIBILITY, moreContrast: true });
  expect(info.isBoldTextEnabled).not.toHaveBeenCalled();
});

it('follows a setting turned on and off while the app runs', async () => {
  const { legibilityReady, useLegibility } = storeOn('ios');
  await legibilityReady();
  const { result } = renderHook(useLegibility);
  act(() => handlerFor('darkerSystemColorsChanged')?.(true));
  expect(result.current.moreContrast).toBe(true);
  act(() => handlerFor('darkerSystemColorsChanged')?.(false));
  expect(result.current.moreContrast).toBe(false);
});

it('counts a setting it could not read as off', async () => {
  info.isBoldTextEnabled.mockRejectedValueOnce(new Error('unavailable'));
  const { legibilityReady, useLegibility } = storeOn('ios');
  await legibilityReady();
  const { result } = renderHook(useLegibility);
  expect(result.current.boldText).toBe(false);
});

it('stops listening when nothing reads it', async () => {
  const remove = jest.fn();
  info.addEventListener.mockImplementation(() => ({ remove }) as never);
  const { legibilityReady, useLegibility } = storeOn('ios');
  await legibilityReady();
  const { unmount } = renderHook(useLegibility);
  expect(info.addEventListener).toHaveBeenCalledTimes(3);
  unmount();
  expect(remove).toHaveBeenCalledTimes(3);
  info.addEventListener.mockImplementation(() => ({ remove: jest.fn() }) as never);
});

it('keeps the same state when a setting reports what it already was', () => {
  expect(withSetting(PLAIN_LEGIBILITY, 'boldText', false)).toBe(PLAIN_LEGIBILITY);
  expect(withSetting(PLAIN_LEGIBILITY, 'boldText', true)).toEqual({
    ...PLAIN_LEGIBILITY,
    boldText: true,
  });
});
