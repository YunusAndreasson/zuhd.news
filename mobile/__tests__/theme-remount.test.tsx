import { act, renderHook } from '@testing-library/react';
import { Suspense } from 'react';
import { DEFAULT_PREFS } from '../constants/theme';
import { ThemeProvider, usePreferences, useTheme } from '../hooks/useTheme';
import { savePreferences } from '../lib/storage';

jest.mock('react-native', () => ({
  Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android },
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 0.5 },
  Dimensions: { get: () => ({ width: 411, height: 914 }) },
  Appearance: { setColorScheme: jest.fn() },
  useColorScheme: () => 'dark',
}));
jest.mock('expo-navigation-bar', () => ({ NavigationBar: { setStyle: jest.fn() } }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn(async () => {}) }));
jest.mock('../lib/notifications', () => ({
  addPushTokenListener: jest.fn(),
  registerPushToken: jest.fn(),
  unregisterPushToken: jest.fn(),
  enableNotifications: jest.fn(),
  disableNotifications: jest.fn(),
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

it('keeps edited preferences when Android recreates the provider in the same runtime', async () => {
  const useSettings = () => ({ api: usePreferences(), theme: useTheme() });
  let first!: ReturnType<typeof renderHook<ReturnType<typeof useSettings>, unknown>>;
  await act(async () => {
    first = renderHook(useSettings, { wrapper: Wrapper });
  });
  expect(first.result.current.api.preferences).toEqual(DEFAULT_PREFS);
  act(() => first.result.current.api.setAppearance('light'));
  act(() => first.result.current.api.setFontSize('large'));
  act(() => first.result.current.api.setFontFamily('system'));
  act(() => first.result.current.api.setHaptics(false));
  const edited = first.result.current.api.preferences;
  expect(savePreferences).toHaveBeenLastCalledWith(edited);
  first.unmount();
  const second = renderHook(useSettings, { wrapper: Wrapper });
  expect(second.result.current.api.preferences).toEqual(edited);
  expect(second.result.current.theme.resolvedAppearance).toBe('light');
});
