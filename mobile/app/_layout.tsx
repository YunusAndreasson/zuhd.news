import * as Sentry from '@sentry/react-native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Slot, useNavigationContainerRef, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useCallback, useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ANALYTICS_EVENTS } from '../constants/analytics';
import { RUNTIME_FONTS } from '../constants/fonts';
import { IS_ANDROID } from '../constants/platform';
import { ANIMATION, DARK_COLORS, STALE_THRESHOLD } from '../constants/theme';
import { useAppResume } from '../hooks/useAppResume';
import { ThemeProvider, useTheme } from '../hooks/useTheme';
import { analytics } from '../lib/analytics';
import { awayBucket, utcDay } from '../lib/analytics-buckets';
import { registerBackgroundTask } from '../lib/background-fetch';
import { startFirsts } from '../lib/firsts';
import { sendInstallAttribution } from '../lib/install-attribution';
import { openInstallRecord, trackFirstOpen } from '../lib/install-record';
import { getMeasurementAnswer, startMeasurement, subscribeMeasurement } from '../lib/measurement';
import { clearLegacyScheduledNotifications, setupNotificationChannels } from '../lib/notifications';
import { firstRun, getSnapshot as getOnboarding } from '../lib/onboarding-store';
import { PERSIST_BUSTER, PERSIST_MAX_AGE_MS, persister, queryClient } from '../lib/query-client';
import { dropRetiredFound, startReadingVisit } from '../lib/read-store';
import { navigationIntegration, sentryEnabled } from '../lib/sentry';

configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: ANIMATION.normal });

// Fallback: if fonts or the first article load stall, force-hide the splash
// after 8s so the user sees *something* rather than a frozen launch screen.
const SPLASH_FALLBACK_MS = 8000;

// Once per JS runtime, not per mount: Android can recreate the activity, and
// so this layout, while the runtime lives on (`useTheme`'s `latestPrefs`).
let launchRecorded = false;
let coldOpenSent = false;
let lastScreen: string | null = null;

/** The launch's `App Opened`, once; true if this call sent it. */
function sendColdOpen(): boolean {
  if (coldOpenSent) return false;
  coldOpenSent = true;
  void analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' });
  return true;
}

function ThemedShell() {
  const { colors, resolvedAppearance } = useTheme();
  return (
    <>
      <StatusBar style={resolvedAppearance === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Slot />
      </View>
    </>
  );
}

function RootLayout() {
  const navigationRef = useNavigationContainerRef();
  useEffect(() => {
    if (navigationRef) navigationIntegration.registerNavigationContainer(navigationRef);
  }, [navigationRef]);

  // The route's pattern, never its params: a param can be a story's slug.
  const segments = useSegments();
  const screen = `/${segments.join('/')}` as const;
  useEffect(() => {
    // A recreated activity mounts the same route again; nothing came into view.
    if (screen === lastScreen) return;
    lastScreen = screen;
    void analytics.track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen });
  }, [screen]);

  // `App Opened` is the active-user event, so only when the reader can see
  // the app. iOS launches it in the background for the background task, and
  // a launch there waits for the reader to bring it up.
  useEffect(() => {
    if (AppState.currentState === 'active') {
      sendColdOpen();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      // A tick later, so a warm open answering the same change goes first
      // and sends this as the cold one it is.
      if (state === 'active') timer = setTimeout(sendColdOpen, 0);
    });
    return () => {
      subscription.remove();
      clearTimeout(timer);
    };
  }, []);
  // Back after five minutes or more: a warm open, and a new visit.
  const handleResume = useCallback((awayMs: number) => {
    startReadingVisit();
    if (sendColdOpen()) return;
    void analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'warm', away: awayBucket(awayMs) });
  }, []);
  useAppResume(handleResume, STALE_THRESHOLD);

  // iOS registers its faces here; Android's are embedded, so it is loaded at
  // the first render (`constants/fonts`).
  const [fontsLoaded, fontError] = useFonts(RUNTIME_FONTS);

  useEffect(() => {
    if (!launchRecorded) {
      launchRecorded = true;
      void analytics.registerOnce({ install_date: utcDay(getOnboarding().seededAt) });
      // New only for the store's `firstRun`; an install updated over the air
      // into this code is existing, and its firsts were long ago.
      if (firstRun) startFirsts();
      openInstallRecord(firstRun ? 'new' : 'existing');
      // After the install date, which it carries. Once per install, either kind.
      trackFirstOpen();
    }
    // Asked only on Android (`lib/measurement.ts`). A yes is also when a new
    // install's Install Attribution may go (`lib/install-attribution.ts`).
    const measurement = IS_ANDROID
      ? subscribeMeasurement(() => {
          void analytics.register({ ad_measurement: getMeasurementAnswer() === true });
          void sendInstallAttribution();
        })
      : null;
    if (IS_ANDROID) {
      void analytics.register({ ad_measurement: getMeasurementAnswer() === true });
      void sendInstallAttribution();
    }
    void registerBackgroundTask();
    void clearLegacyScheduledNotifications();
    dropRetiredFound();
    // Only if the reader has said yes (`lib/measurement.ts`).
    startMeasurement();
    // Set up Android channels at startup so they exist before any push, even
    // if the user grants notification permission later via OS settings.
    void setupNotificationChannels().catch(() => {});
    // Fallback: force-hide the splash if fonts/feed stall so the user sees
    // something rather than a frozen launch screen. Cleared on unmount.
    const splashFallback = setTimeout(() => {
      SplashScreen.hide();
    }, SPLASH_FALLBACK_MS);

    // Notification permission is no longer requested here. The onboarding
    // flow owns the ask: the one-time primer sheet (see lib/onboarding-store.ts
    // and NotificationPrimerSheet) fires the OS dialog only after the user
    // opts in. The legacy `zuhd_notif_asked` SecureStore key this block used
    // to write is still read at onboarding-store seed (so devices that
    // answered the old cold prompt are never re-asked) and re-written when
    // the primer spends the dialog (rollback insurance).

    return () => {
      clearTimeout(splashFallback);
      measurement?.();
    };
  }, []);

  // Proceed on load OR error (system fonts will be used as fallback)
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <Suspense fallback={<View style={styles.root} />}>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
              persister,
              maxAge: PERSIST_MAX_AGE_MS,
              buster: PERSIST_BUSTER,
            }}
          >
            {/* No BottomSheetModalProvider: gorhom needed one to own the portal
                every modal sheet rendered into. Platform sheets present
                themselves, and `@expo/ui` keeps the export only as a
                compat no-op that renders its children — so the wrapper was a
                tree level that did nothing. */}
            <ThemeProvider fontsAvailable={fontsLoaded}>
              <ThemedShell />
            </ThemeProvider>
          </PersistQueryClientProvider>
        </Suspense>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

export default sentryEnabled ? Sentry.wrap(RootLayout) : RootLayout;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DARK_COLORS.bg,
  },
});
