import { act, renderHook } from '@testing-library/react';
import { Suspense } from 'react';
import { AccessibilityInfo } from 'react-native';
import { DARK_COLORS, DARK_CONTRAST_COLORS, DEFAULT_PREFS } from '../constants/theme';
import { ThemeProvider, usePreferences, useTheme } from '../hooks/useTheme';
import * as Network from 'expo-network';
import { analytics } from '../lib/analytics';
import { enableNotifications, publisherDelivery, unregisterPushToken } from '../lib/notifications';
import { savePreferences } from '../lib/storage';

jest.mock('react-native', () => ({
  Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android },
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 0.5 },
  Dimensions: { get: () => ({ width: 411, height: 914 }) },
  Appearance: { setColorScheme: jest.fn() },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  AccessibilityInfo: {
    isHighTextContrastEnabled: jest.fn(async () => false),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  useColorScheme: () => 'dark',
  useWindowDimensions: () => ({ width: 411, height: 914, fontScale: 1, scale: 2.625 }),
}));
jest.mock('expo-sqlite/kv-store', () => ({ getItemSync: () => null, setItemSync: jest.fn() }));
jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true })),
}));
jest.mock('expo-navigation-bar', () => ({ NavigationBar: { setStyle: jest.fn() } }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn(async () => {}) }));
jest.mock('../lib/notifications', () => ({
  addPushTokenListener: jest.fn(),
  registerPushToken: jest.fn(),
  unregisterPushToken: jest.fn(),
  enableNotifications: jest.fn(async () => ({ granted: true, osPrompt: true, outcome: 'granted' })),
  disableNotifications: jest.fn(),
  publisherDelivery: jest.fn(async () => ({ briefing: true, breaking: true })),
  setupNotificationChannels: jest.fn(async () => {}),
}));
jest.mock('../lib/analytics', () => ({
  analytics: { track: jest.fn(async () => {}), register: jest.fn(async () => {}) },
}));
jest.mock('../lib/storage', () => ({
  getPreferences: jest.fn(async () => require('../constants/theme').DEFAULT_PREFS),
  savePreferences: jest.fn(async () => {}),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ThemeProvider>{children}</ThemeProvider>
    </Suspense>
  );
}

const useSettings = () => ({ api: usePreferences(), theme: useTheme() });

it('keeps edited preferences when Android recreates the provider in the same runtime', async () => {
  let first!: ReturnType<typeof renderHook<ReturnType<typeof useSettings>, unknown>>;
  await act(async () => {
    first = renderHook(useSettings, { wrapper: Wrapper });
  });
  expect(first.result.current.api.preferences).toEqual(DEFAULT_PREFS);
  act(() => first.result.current.api.setAppearance('light'));
  act(() => first.result.current.api.setFontSize('large'));
  act(() => first.result.current.api.setHaptics(false));
  const edited = first.result.current.api.preferences;
  expect(savePreferences).toHaveBeenLastCalledWith(edited);
  first.unmount();
  const second = renderHook(useSettings, { wrapper: Wrapper });
  expect(second.result.current.api.preferences).toEqual(edited);
  expect(second.result.current.theme.resolvedAppearance).toBe('light');
});

it('merges a delayed notification permission result into the latest display preferences', async () => {
  let grant!: (value: { granted: boolean; osPrompt: boolean; outcome: 'granted' }) => void;
  jest.mocked(enableNotifications).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
  );
  let hook!: ReturnType<typeof renderHook<ReturnType<typeof usePreferences>, unknown>>;
  await act(async () => {
    hook = renderHook(usePreferences, { wrapper: Wrapper });
  });
  let pending!: Promise<boolean>;
  act(() => {
    pending = hook.result.current.setNotifications(true);
  });
  act(() => {
    hook.result.current.setAppearance('dark');
    hook.result.current.setFontSize('small');
  });
  await act(async () => {
    grant({ granted: true, osPrompt: true, outcome: 'granted' });
    await pending;
  });
  expect(hook.result.current.preferences).toMatchObject({
    appearance: 'dark',
    fontSize: 'small',
    notifications: true,
  });
});

it('retries notification opt-out on reconnect without resending on every network event', async () => {
  let hook!: ReturnType<typeof renderHook<ReturnType<typeof usePreferences>, unknown>>;
  await act(async () => {
    hook = renderHook(usePreferences, { wrapper: Wrapper });
  });
  await act(async () => {
    await hook.result.current.setNotifications(false);
  });
  const calls = jest.mocked(Network.addNetworkStateListener).mock.calls;
  const network = calls[calls.length - 1]?.[0];
  jest.mocked(unregisterPushToken).mockClear();
  await act(async () => {
    network?.({ isConnected: false } as never);
    network?.({ isConnected: true } as never);
    network?.({ isConnected: true } as never);
  });
  expect(unregisterPushToken).toHaveBeenCalledTimes(1);
});

it('steps the quiet inks up while High contrast text is on, and back when it is off', async () => {
  let hook!: ReturnType<typeof renderHook<ReturnType<typeof useTheme>, unknown>>;
  await act(async () => {
    hook = renderHook(useTheme, { wrapper: Wrapper });
  });
  expect(hook.result.current.colors).toBe(DARK_COLORS);
  const calls = jest.mocked(AccessibilityInfo.addEventListener).mock.calls;
  const changed = calls.findLast(([event]) => event === 'highTextContrastChanged')?.[1] as
    | ((on: boolean) => void)
    | undefined;
  expect(changed).toBeDefined();
  act(() => changed?.(true));
  expect(hook.result.current.colors).toBe(DARK_CONTRAST_COLORS);
  act(() => changed?.(false));
  expect(hook.result.current.colors).toBe(DARK_COLORS);
});

it('answers the primer’s ask with its source, and says whether a push can reach the reader', async () => {
  let hook!: ReturnType<typeof renderHook<ReturnType<typeof usePreferences>, unknown>>;
  await act(async () => {
    hook = renderHook(usePreferences, { wrapper: Wrapper });
  });
  jest.mocked(analytics.track).mockClear();
  jest.mocked(analytics.register).mockClear();
  // The OS has the permission off: on in the app is not enough.
  jest.mocked(publisherDelivery).mockResolvedValueOnce({ briefing: false, breaking: false });
  await act(async () => {
    await hook.result.current.setNotifications(true, { primed: true, source: 'finished_briefing' });
  });
  expect(analytics.track).toHaveBeenCalledWith('Permission Result', {
    permission: 'notifications',
    granted: true,
    primed: true,
    os_prompt: true,
    outcome: 'granted',
    source: 'finished_briefing',
  });
  expect(analytics.register).toHaveBeenLastCalledWith({ notifications_enabled: false });
  jest.mocked(analytics.track).mockClear();
  await act(async () => {
    await hook.result.current.setNotifications(false);
  });
  expect(analytics.track).toHaveBeenCalledWith('Notifications Turned Off');
  expect(analytics.register).toHaveBeenLastCalledWith({ notifications_enabled: false });
});

it('the settings toggle is an unprimed ask, with no source', async () => {
  let hook!: ReturnType<typeof renderHook<ReturnType<typeof usePreferences>, unknown>>;
  await act(async () => {
    hook = renderHook(usePreferences, { wrapper: Wrapper });
  });
  jest.mocked(analytics.track).mockClear();
  jest
    .mocked(enableNotifications)
    .mockResolvedValueOnce({ granted: false, osPrompt: false, outcome: 'denied' });
  await act(async () => {
    await hook.result.current.setNotifications(true);
  });
  expect(analytics.track).toHaveBeenCalledWith('Permission Result', {
    permission: 'notifications',
    granted: false,
    primed: false,
    os_prompt: false,
    outcome: 'denied',
  });
});

it('consumes a blocked return from Settings before a later independent OS grant', async () => {
  const { beginPublisherSettings } = require('../lib/publisher-history');
  const { AppState } = require('react-native');
  let hook!: ReturnType<typeof renderHook<ReturnType<typeof usePreferences>, unknown>>;
  await act(async () => {
    hook = renderHook(usePreferences, { wrapper: Wrapper });
  });
  await act(async () => {
    await hook.result.current.setNotifications(false);
  });
  const change = AppState.addEventListener.mock.lastCall[1];
  beginPublisherSettings();
  jest.mocked(publisherDelivery).mockResolvedValue({ briefing: false, breaking: false });
  await act(async () => {
    change('background');
    change('active');
  });
  jest.mocked(publisherDelivery).mockResolvedValue({ briefing: true, breaking: true });
  await act(async () => {
    change('background');
    change('active');
  });
  expect(hook.result.current.preferences.notifications).toBe(false);
  beginPublisherSettings();
  await act(async () => {
    change('active');
  });
  expect(hook.result.current.preferences.notifications).toBe(false);
  await act(async () => {
    change('background');
    change('active');
  });
  expect(hook.result.current.preferences.notifications).toBe(true);
});
