import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { createContext, use, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import {
  type AppearanceMode,
  BG_RGB,
  type ColorPalette,
  DARK_COLORS,
  FONT_SIZE_SCALE,
  FONT_SOURCE,
  FONT_SYSTEM,
  type FontFamily,
  type FontSet,
  type FontSize,
  LIGHT_COLORS,
  makeBgAlpha,
  makeSheetStyles,
  makeTextStyles,
  makeTypography,
  type Preferences,
  type TextStyles,
  type Typography,
} from '../constants/theme';
import { setHapticsEnabled } from '../lib/haptics';
import {
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
  textStyles: TextStyles;
  sheetStyles: ReturnType<typeof makeSheetStyles>;
  bgAlpha: (a: number) => string;
  bgRgb: [number, number, number];
  resolvedAppearance: 'dark' | 'light';
}

export interface PreferencesApi {
  preferences: Preferences;
  setFontSize: (v: FontSize) => void;
  setFontFamily: (v: FontFamily) => void;
  setAppearance: (v: AppearanceMode) => void;
  setHaptics: (v: boolean) => void;
  setNotifications: (v: boolean) => void;
}

const ThemeContext = createContext<Theme | null>(null);
const PreferencesContext = createContext<PreferencesApi | null>(null);

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function usePreferences(): PreferencesApi {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within ThemeProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Eagerly start loading preferences at module import time so it resolves
// before the splash screen hides (fonts load in parallel).
// ---------------------------------------------------------------------------

const prefsPromise = getPreferences();

export function ThemeProvider({
  children,
  fontsAvailable = true,
}: {
  children: React.ReactNode;
  fontsAvailable?: boolean;
}) {
  const initialPrefs = use(prefsPromise);
  const [prefs, setPrefs] = useState<Preferences>(() => {
    setHapticsEnabled(initialPrefs.haptics);
    if (initialPrefs.notifications) {
      registerPushToken();
    }
    return initialPrefs;
  });
  const systemScheme = useColorScheme();

  const persist = useCallback((next: Preferences) => {
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
    async (v: boolean) => {
      if (v) {
        const granted = await enableNotifications();
        if (!granted) return;
        registerPushToken();
      } else {
        await disableNotifications();
        unregisterPushToken();
      }
      persist({ ...prefs, notifications: v });
    },
    [prefs, persist],
  );

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
    const textStyles = makeTextStyles(colors, font, typography);
    const sheetStyles = makeSheetStyles(colors);
    const bgRgb = BG_RGB[resolvedAppearance];
    const bgAlphaFn = makeBgAlpha(bgRgb);

    return {
      colors,
      font,
      typography,
      textStyles,
      sheetStyles,
      bgAlpha: bgAlphaFn,
      bgRgb,
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

  // Sync native system UI (Android nav bar + root background) with theme
  const { bg } = theme.colors;
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(bg).catch(() => {});
    if (Platform.OS === 'android') {
      NavigationBar.setBackgroundColorAsync(bg).catch(() => {});
      NavigationBar.setButtonStyleAsync(resolvedAppearance === 'dark' ? 'light' : 'dark').catch(
        () => {},
      );
    }
  }, [bg, resolvedAppearance]);

  return (
    <ThemeContext value={theme}>
      <PreferencesContext value={preferencesApi}>{children}</PreferencesContext>
    </ThemeContext>
  );
}
