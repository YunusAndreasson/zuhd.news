import * as SystemUI from 'expo-system-ui';
import { createContext, use, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
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
  enableNotifications,
  registerPushToken,
  unregisterPushToken,
} from '../lib/notifications';
import { getPreferences, savePreferences } from '../lib/storage';

// ---------------------------------------------------------------------------
// Theme shape
// ---------------------------------------------------------------------------

interface Theme {
  colors: ColorPalette;
  font: FontSet;
  typography: Typography;
  textStyles: TextStyles;
  sheetStyles: ReturnType<typeof makeSheetStyles>;
  bgAlpha: (a: number) => string;
  bgRgb: [number, number, number];
  resolvedAppearance: 'dark' | 'light';
  preferences: Preferences;
  setFontSize: (v: FontSize) => void;
  setFontFamily: (v: FontFamily) => void;
  setAppearance: (v: AppearanceMode) => void;
  setHaptics: (v: boolean) => void;
  setNotifications: (v: boolean) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ThemeContext = createContext<Theme | null>(null);

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Eagerly start loading preferences at module import time so it resolves
// before the splash screen hides (fonts load in parallel).
// ---------------------------------------------------------------------------

const prefsPromise = getPreferences();

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const initialPrefs = use(prefsPromise);
  const [prefs, setPrefs] = useState<Preferences>(() => {
    setHapticsEnabled(initialPrefs.haptics);
    if (initialPrefs.notifications) {
      registerPushToken();
    }
    return initialPrefs;
  });
  const systemScheme = useColorScheme();

  const updatePref = useCallback((patch: Partial<Preferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  const setFontSize = useCallback((v: FontSize) => updatePref({ fontSize: v }), [updatePref]);
  const setFontFamily = useCallback((v: FontFamily) => updatePref({ fontFamily: v }), [updatePref]);
  const setAppearance = useCallback(
    (v: AppearanceMode) => updatePref({ appearance: v }),
    [updatePref],
  );
  const setHaptics = useCallback(
    (v: boolean) => {
      setHapticsEnabled(v);
      updatePref({ haptics: v });
    },
    [updatePref],
  );
  const setNotifications = useCallback(
    async (v: boolean) => {
      if (v) {
        const granted = await enableNotifications();
        if (!granted) return;
        registerPushToken();
      } else {
        unregisterPushToken();
      }
      updatePref({ notifications: v });
    },
    [updatePref],
  );

  const theme = useMemo<Theme>(() => {
    const resolvedAppearance: 'dark' | 'light' =
      prefs.appearance === 'system'
        ? systemScheme === 'light'
          ? 'light'
          : 'dark'
        : prefs.appearance;

    const colors = resolvedAppearance === 'dark' ? DARK_COLORS : LIGHT_COLORS;
    const font = prefs.fontFamily === 'source' ? FONT_SOURCE : FONT_SYSTEM;
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
      preferences: prefs,
      setFontSize,
      setFontFamily,
      setAppearance,
      setHaptics,
      setNotifications,
    };
  }, [
    prefs,
    systemScheme,
    setFontSize,
    setFontFamily,
    setAppearance,
    setHaptics,
    setNotifications,
  ]);

  // Sync root view background with theme (nav bar handled by OS via plugin)
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.bg).catch(() => {});
  }, [theme.colors.bg]);

  return <ThemeContext value={theme}>{children}</ThemeContext>;
}
