import { NavigationBar } from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { IS_ANDROID } from '../constants/platform';
import {
  type AppearanceMode,
  type ColorPalette,
  DARK_COLORS,
  FONT_SIZE_SCALE,
  FONT_SOURCE,
  FONT_SYSTEM,
  type FontFamily,
  type FontSet,
  type FontSize,
  LIGHT_COLORS,
  makeSheetStyles,
  makeTextVariants,
  makeTypography,
  type Preferences,
  type TextVariants,
  type Typography,
} from '../constants/theme';
import { setHapticsEnabled } from '../lib/haptics';
import {
  addPushTokenListener,
  disableNotifications,
  enableNotifications,
  registerPushToken,
  unregisterPushToken,
} from '../lib/notifications';
import { getPreferences, savePreferences } from '../lib/storage';

// ---------------------------------------------------------------------------
// Theme = visual style only. Splitting theme from preferences lets toggles
// like haptics/notifications re-render only the settings page, not the whole tree.
// ---------------------------------------------------------------------------

export interface Theme {
  colors: ColorPalette;
  font: FontSet;
  typography: Typography;
  textVariants: TextVariants;
  sheetStyles: ReturnType<typeof makeSheetStyles>;
  resolvedAppearance: 'dark' | 'light';
}

export interface PreferencesApi {
  preferences: Preferences;
  setFontSize: (v: FontSize) => void;
  setFontFamily: (v: FontFamily) => void;
  setAppearance: (v: AppearanceMode) => void;
  setHaptics: (v: boolean) => void;
  /** Resolves with `true` if the preference was applied, `false` if the OS permission request was denied. */
  setNotifications: (v: boolean) => Promise<boolean>;
}

const ThemeContext = createContext<Theme | null>(null);
const PreferencesContext = createContext<PreferencesApi | null>(null);

export function useTheme(): Theme {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function usePreferences(): PreferencesApi {
  const ctx = use(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within ThemeProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Eagerly start loading preferences at module import time so it resolves
// before the splash screen hides (fonts load in parallel).
// ---------------------------------------------------------------------------

const prefsPromise = getPreferences();
// Android can recreate the activity while keeping the JS runtime alive (for
// example after a system font-size change). The eager promise still contains
// the launch-time values, so preserve edits across a provider remount too.
let latestPrefs: Preferences | undefined;

export function ThemeProvider({
  children,
  fontsAvailable = true,
}: {
  children: React.ReactNode;
  fontsAvailable?: boolean;
}) {
  const initialPrefs = use(prefsPromise);
  const [prefs, setPrefs] = useState<Preferences>(() => {
    const current = latestPrefs ?? initialPrefs;
    setHapticsEnabled(current.haptics);
    return current;
  });
  const systemScheme = useColorScheme();

  const persist = useCallback((next: Preferences) => {
    latestPrefs = next;
    setPrefs(next);
    savePreferences(next);
  }, []);

  const setFontSize = useCallback(
    (v: FontSize) => persist({ ...prefs, fontSize: v }),
    [prefs, persist],
  );
  const setFontFamily = useCallback(
    (v: FontFamily) => persist({ ...prefs, fontFamily: v }),
    [prefs, persist],
  );
  const setAppearance = useCallback(
    (v: AppearanceMode) => persist({ ...prefs, appearance: v }),
    [prefs, persist],
  );
  const setHaptics = useCallback(
    (v: boolean) => {
      setHapticsEnabled(v);
      persist({ ...prefs, haptics: v });
    },
    [prefs, persist],
  );
  const setNotifications = useCallback(
    async (v: boolean): Promise<boolean> => {
      if (v) {
        const granted = await enableNotifications();
        if (!granted) return false;
      } else {
        await disableNotifications();
        void unregisterPushToken();
      }
      persist({ ...prefs, notifications: v });
      return true;
    },
    [prefs, persist],
  );

  useEffect(() => {
    if (!prefs.notifications) return;
    void registerPushToken();
    const subscription = addPushTokenListener();
    return () => subscription.remove();
  }, [prefs.notifications]);

  const resolvedAppearance: 'dark' | 'light' =
    prefs.appearance === 'system'
      ? systemScheme === 'light'
        ? 'light'
        : 'dark'
      : prefs.appearance;

  // Theme depends only on visual inputs — haptics/notifications toggles
  // don't invalidate it, so consumers of useTheme don't re-render.
  const theme = useMemo<Theme>(() => {
    const colors = resolvedAppearance === 'dark' ? DARK_COLORS : LIGHT_COLORS;
    const font = prefs.fontFamily === 'source' && fontsAvailable ? FONT_SOURCE : FONT_SYSTEM;
    const sizeScale = FONT_SIZE_SCALE[prefs.fontSize];
    const typography = makeTypography(sizeScale);
    const textVariants = makeTextVariants(colors, font, typography);
    const sheetStyles = makeSheetStyles(colors);

    return {
      colors,
      font,
      typography,
      textVariants,
      sheetStyles,
      resolvedAppearance,
    };
  }, [resolvedAppearance, prefs.fontFamily, prefs.fontSize, fontsAvailable]);

  const preferencesApi = useMemo<PreferencesApi>(
    () => ({
      preferences: prefs,
      setFontSize,
      setFontFamily,
      setAppearance,
      setHaptics,
      setNotifications,
    }),
    [prefs, setFontSize, setFontFamily, setAppearance, setHaptics, setNotifications],
  );

  // An in-app light or dark choice is the whole app's, not only the JS
  // palette's: the platform sheets, the search keyboard, alerts and the share
  // sheet draw themselves from the native appearance, and without this they
  // stayed dark over a light app. `unspecified` hands it back to the system,
  // which is also what `useColorScheme` above then reports again.
  const appearancePref = prefs.appearance;
  useEffect(() => {
    Appearance.setColorScheme(appearancePref === 'system' ? 'unspecified' : appearancePref);
  }, [appearancePref]);

  // Sync native system UI with theme. Android edge-to-edge (SDK 54+) makes the
  // nav bar transparent and ignores setBackgroundColorAsync — only setStyle
  // (button icon color) still has effect on three-button navigation.
  const { bg } = theme.colors;
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(bg).catch(() => {});
    if (IS_ANDROID) {
      NavigationBar.setStyle(resolvedAppearance === 'dark' ? 'light' : 'dark');
    }
  }, [bg, resolvedAppearance]);

  return (
    <ThemeContext value={theme}>
      <PreferencesContext value={preferencesApi}>{children}</PreferencesContext>
    </ThemeContext>
  );
}
