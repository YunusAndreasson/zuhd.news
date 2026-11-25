import { NavigationBar } from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, AppState, useColorScheme, useWindowDimensions } from 'react-native';
import {
  ANALYTICS_EVENTS,
  type PermissionOutcome,
  type PrimerSource,
  type RegistrationReason,
} from '../constants/analytics';
import { IS_ANDROID } from '../constants/platform';
import {
  type AppearanceMode,
  type BriefingSpeed,
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
  publisherDelivery,
  registerPushToken,
  setupNotificationChannels,
  unregisterPushToken,
} from '../lib/notifications';
import { offerHistory, publisherSettingsTransition, saveOffer } from '../lib/publisher-history';
import { observePublisher } from '../lib/publisher-session';
import {
  publisherChanges,
  publisherEnabled,
  publisherSnapshot,
  setDelivery,
  setRegistration,
} from '../lib/publisher-state';
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
  onAnswer?: (answer: PermissionOutcome) => void;
}

export interface PreferencesApi {
  preferences: Preferences;
  setFontSize: (v: FontSize) => void;
  setAppearance: (v: AppearanceMode) => void;
  setBriefingSpeed: (v: BriefingSpeed) => void;
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
    const consent = offerHistory().consent;
    latestPrefs = consent === undefined ? current : { ...current, notifications: consent };
    return latestPrefs;
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
  const setBriefingSpeed = useCallback(
    (v: BriefingSpeed) => persist({ briefingSpeed: v }),
    [persist],
  );
  const setHaptics = useCallback(
    (v: boolean) => {
      setHapticsEnabled(v);
      persist({ haptics: v });
    },
    [persist],
  );
  const notificationRequest = useRef(0);
  const prompting = useRef(false);
  const setNotifications = useCallback(
    async (v: boolean, ask: NotificationAsk = { primed: false }): Promise<boolean> => {
      const request = ++notificationRequest.current;
      const consentGeneration = (offerHistory().generation ?? 0) + 1;
      prompting.current = v;
      if (v) {
        // A process death at the OS dialog retains the explicit publisher choice.
        saveOffer({
          promptChoice: true,
          origin: ask.source,
          generation: consentGeneration,
        });
        const { granted, osPrompt, outcome } = await enableNotifications(ask.primed || !ask.source);
        const delivery = await publisherDelivery();
        if (request === notificationRequest.current) prompting.current = false;
        void analytics.track(ANALYTICS_EVENTS.PERMISSION_RESULT, {
          permission: 'notifications',
          granted,
          outcome,
          primed: ask.primed,
          os_prompt: osPrompt,
          ...(ask.source && { source: ask.source }),
        });
        if (
          request !== notificationRequest.current ||
          offerHistory().generation !== consentGeneration
        )
          return false;
        ask.onAnswer?.(outcome);
        setDelivery(delivery);
        if (!granted) {
          saveOffer({ promptChoice: false });
          return false;
        }
        setRegistration('pending', 'enable');
        saveOffer({ consent: true, disabled: false, promptChoice: false });
        persist({ notifications: true });
      } else {
        saveOffer({
          generation: consentGeneration,
          consent: false,
          disabled: true,
          promptChoice: false,
        });
        void unregisterPushToken();
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
    let generation = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 15_000;
    const consent = prefs.notifications;
    const observe = () => {
      if (!current) return;
      const snapshot = publisherSnapshot();
      if (offerHistory().registration !== snapshot.status)
        saveOffer({ registration: snapshot.status });
      const effective = publisherEnabled(consent, snapshot);
      void analytics.register({ notifications_enabled: effective });
      observePublisher(
        {
          consent,
          ...snapshot.delivery,
          registration: snapshot.status,
          effective,
          observed_at: Date.now(),
        },
        snapshot.reason,
      );
    };
    const unsubscribe = publisherChanges.subscribe(observe);
    const sync = async (reason: RegistrationReason) => {
      clearTimeout(retryTimer);
      const attempt = ++generation;
      await setupNotificationChannels().catch(() => {});
      const delivery = await publisherDelivery();
      if (
        !current ||
        prompting.current ||
        attempt !== generation ||
        (latestPrefs ?? initialPrefs).notifications !== consent
      )
        return;
      setDelivery(delivery);
      if (!consent && offerHistory().promptChoice) {
        saveOffer({ promptChoice: false });
        if (delivery.briefing || delivery.breaking) {
          saveOffer({ consent: true, disabled: false });
          persist({ notifications: true });
          return;
        }
      }
      if (consent && (delivery.briefing || delivery.breaking))
        await registerPushToken(undefined, reason, offerHistory().generation);
      else if (!consent) await unregisterPushToken();
      observe();
      if (
        current &&
        attempt === generation &&
        consent &&
        (delivery.briefing || delivery.breaking) &&
        ['pending', 'failed'].includes(publisherSnapshot().status)
      ) {
        retryTimer = setTimeout(() => {
          if (AppState.currentState === 'active') void sync('retry');
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 300_000);
      } else retryDelay = 15_000;
    };
    void sync('refresh');
    const tokenSubscription = consent ? addPushTokenListener(offerHistory().generation) : null;
    const unsubscribeNetwork = subscribeConnectivity((online, initial) => {
      if (!initial && online) void sync('reconnect');
    });
    const appState = AppState.addEventListener('change', (state) => {
      const trip = publisherSettingsTransition(state === 'active');
      if (state === 'active') {
        if (trip !== undefined && !consent) {
          void publisherDelivery().then((delivery) => {
            if (!current || offerHistory().generation !== trip) return;
            if (delivery.briefing || delivery.breaking) {
              setDelivery(delivery);
              saveOffer({ consent: true, disabled: false });
              persist({ notifications: true });
            } else void sync('refresh');
          });
        } else void sync('refresh');
      } else if (state === 'background') observe();
    });
    return () => {
      current = false;
      clearTimeout(retryTimer);
      tokenSubscription?.remove();
      unsubscribeNetwork();
      unsubscribe();
      appState.remove();
    };
  }, [prefs.notifications, persist, initialPrefs]);

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
      setBriefingSpeed,
      setHaptics,
      setNotifications,
    }),
    [prefs, setFontSize, setAppearance, setBriefingSpeed, setHaptics, setNotifications],
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
