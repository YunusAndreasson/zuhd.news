import { NavigationBar } from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, AppState, useColorScheme, useWindowDimensions } from 'react-native';
import { ANALYTICS_EVENTS, type PrimerSource } from '../constants/analytics';
import { IS_ANDROID } from '../constants/platform';
import {
  type AppearanceMode,
  type ColorPalette,
  FONT_SIZE_SCALE,
  FONT_SOURCE,
  FONT_SOURCE_BOLD,
  FONT_SYSTEM,
  type FontSet,
  type FontSize,
  makeSheetStyles,
  makeTextVariants,
  type Preferences,
  paletteFor,
  type TextVariants,
  type Typography,
  typographyFor,
  widthTypeScale,
} from '../constants/theme';
import { analytics } from '../lib/analytics';
import { setHapticsEnabled } from '../lib/haptics';
import { subscribeConnectivity } from '../lib/network';
import {
  addPushTokenListener,
  disableNotifications,
  enableNotifications,
  notificationsGranted,
  registerPushToken,
  unregisterPushToken,
} from '../lib/notifications';
import { getPreferences, savePreferences } from '../lib/storage';
import { legibilityReady, useLegibility } from './useLegibility';

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

/** Who asked for notifications, for `Permission Result`: the primer, at one
 *  of its moments, or (unprimed) the settings toggle. */
export interface NotificationAsk {
  primed: boolean;
  source?: PrimerSource;
}

export interface PreferencesApi {
  preferences: Preferences;
  setFontSize: (v: FontSize) => void;
  setAppearance: (v: AppearanceMode) => void;
  setHaptics: (v: boolean) => void;
  /** Resolves with `true` if the preference was applied, `false` if the OS permission request was denied. */
  setNotifications: (v: boolean, ask?: NotificationAsk) => Promise<boolean>;
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
  // Bold Text and Increase Contrast, read before the first frame is drawn.
  use(legibilityReady());
  const { boldText, moreContrast } = useLegibility();
  const [prefs, setPrefs] = useState<Preferences>(() => {
    const current = latestPrefs ?? initialPrefs;
    setHapticsEnabled(current.haptics);
    return current;
  });
  const systemScheme = useColorScheme();

  const persist = useCallback(
    (change: Partial<Preferences>) => {
      const next = { ...(latestPrefs ?? initialPrefs), ...change };
      latestPrefs = next;
      setPrefs(next);
      void savePreferences(next);
    },
    [initialPrefs],
  );

  const setFontSize = useCallback((v: FontSize) => persist({ fontSize: v }), [persist]);
  const setAppearance = useCallback((v: AppearanceMode) => persist({ appearance: v }), [persist]);
  const setHaptics = useCallback(
    (v: boolean) => {
      setHapticsEnabled(v);
      persist({ haptics: v });
    },
    [persist],
  );
  const notificationRequest = useRef(0);
  const setNotifications = useCallback(
    async (v: boolean, ask: NotificationAsk = { primed: false }): Promise<boolean> => {
      const request = ++notificationRequest.current;
      if (v) {
        const { granted, osPrompt } = await enableNotifications();
        void analytics.track(ANALYTICS_EVENTS.PERMISSION_RESULT, {
          permission: 'notifications',
          granted,
          primed: ask.primed,
          os_prompt: osPrompt,
          ...(ask.source && { source: ask.source }),
        });
        if (!granted || request !== notificationRequest.current) return false;
        persist({ notifications: true });
      } else {
        persist({ notifications: false });
        void analytics.track(ANALYTICS_EVENTS.NOTIFICATIONS_TURNED_OFF);
        await disableNotifications();
      }
      return true;
    },
    [persist],
  );

  useEffect(() => {
    let current = true;
    const sync = () => {
      if (prefs.notifications) void registerPushToken();
      else void unregisterPushToken();
      // Whether a push can reach this reader: the setting, and the OS's
      // permission, which can be withdrawn in system settings while away.
      if (!prefs.notifications) {
        void analytics.register({ notifications_enabled: false });
        return;
      }
      void notificationsGranted().then((granted) => {
        if (current) void analytics.register({ notifications_enabled: granted });
      });
    };
    sync();
    const tokenSubscription = prefs.notifications ? addPushTokenListener() : null;
    let connected = true;
    const unsubscribeNetwork = subscribeConnectivity((next, initial) => {
      const previous = connected;
      connected = next;
      if (!initial && next && !previous) sync();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      current = false;
      tokenSubscription?.remove();
      unsubscribeNetwork();
      appState.remove();
    };
  }, [prefs.notifications]);

  const resolvedAppearance: 'dark' | 'light' =
    prefs.appearance === 'system'
      ? systemScheme === 'light'
        ? 'light'
        : 'dark'
      : prefs.appearance;

  // The sizes follow the live window; `typographyFor` hands back the same
  // object until a size actually steps, so a resize rebuilds nothing else.
  const { width } = useWindowDimensions();
  const typography = typographyFor(FONT_SIZE_SCALE[prefs.fontSize], widthTypeScale(width));

  // Theme depends only on visual inputs — haptics/notifications toggles
  // don't invalidate it, so consumers of useTheme don't re-render.
  const theme = useMemo<Theme>(() => {
    const colors = paletteFor(resolvedAppearance, moreContrast);
    // One typeface. The system face is only what draws when Source Sans has
    // not loaded, and it follows Bold Text by itself; Source Sans is handed
    // the next file up.
    const font = fontsAvailable ? (boldText ? FONT_SOURCE_BOLD : FONT_SOURCE) : FONT_SYSTEM;
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
  }, [resolvedAppearance, typography, fontsAvailable, boldText, moreContrast]);

  const preferencesApi = useMemo<PreferencesApi>(
    () => ({
      preferences: prefs,
      setFontSize,
      setAppearance,
      setHaptics,
      setNotifications,
    }),
    [prefs, setFontSize, setAppearance, setHaptics, setNotifications],
  );

  // An in-app light or dark choice is the whole app's, not only the JS
  // palette's: the platform sheets, the search keyboard, alerts and the share
  // sheet draw themselves from the native appearance, and without this they
  // stayed dark over a light app. `auto` hands it back to the system,
  // which is also what `useColorScheme` above then reports again.
  const appearancePref = prefs.appearance;
  useEffect(() => {
    Appearance.setColorScheme(appearancePref === 'system' ? 'auto' : appearancePref);
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
