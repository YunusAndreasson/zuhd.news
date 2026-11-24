import * as Sentry from '@sentry/react-native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Slot, useNavigationContainerRef, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useCallback, useEffect, useState } from 'react';
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
import { installKind, openInstallRecord, trackFirstOpen } from '../lib/install-record';
import { markLaunch } from '../lib/launch-timing';
import { isMeasurementOn, startMeasurement, subscribeMeasurement } from '../lib/measurement';
import { subscribeConnectivity } from '../lib/network';
import { clearLegacyScheduledNotifications, setupNotificationChannels } from '../lib/notifications';
import { firstRun, getSnapshot as getOnboarding } from '../lib/onboarding-store';
import { startPublisherVisit } from '../lib/publisher-history';
import { checkpoint, noteActive } from '../lib/publisher-session';
import {
  getLaunchQueryClient,
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
  persister,
} from '../lib/query-client';
import { dropRetiredFound, startReadingVisit } from '../lib/read-store';
import { navigationIntegration, sentryEnabled } from '../lib/sentry';
import { observeWidget, refreshWidget } from '../lib/widget-store';

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
  void analytics.registerOnce({ install_date: utcDay(getOnboarding().seededAt) });
  openInstallRecord(installKind(firstRun, getOnboarding().seededAt), firstRun);
  checkpoint(true, trackFirstOpen(firstRun));
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
  const [queryClient] = useState(getLaunchQueryClient);
  const navigationRef = useNavigationContainerRef();
  useEffect(() => {
    if (navigationRef) navigationIntegration?.registerNavigationContainer(navigationRef);
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
      void observeWidget();
      void refreshWidget();
      sendColdOpen();
    }
    const stopConnectivity = subscribeConnectivity((online) => void refreshWidget(!online));
    const heartbeat = setInterval(() => {
      if (AppState.currentState === 'active') noteActive();
    }, 60_000);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      // A tick later, so a warm open answering the same change goes first
      // and sends this as the cold one it is.
      clearTimeout(timer);
      if (state === 'active') {
        void observeWidget();
        void refreshWidget();
        timer = setTimeout(() => {
          if (!sendColdOpen()) checkpoint(true);
        }, 0);
      } else {
        checkpoint(false);
        timer = setTimeout(() => checkpoint(false), STALE_THRESHOLD);
      }
    });
    return () => {
      subscription.remove();
      stopConnectivity();
      clearInterval(heartbeat);
      clearTimeout(timer);
    };
  }, []);
  // Back after five minutes or more: a warm open, and a new visit.
  const handleResume = useCallback((awayMs: number) => {
    startReadingVisit();
    startPublisherVisit();
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
      openInstallRecord(installKind(firstRun, getOnboarding().seededAt), firstRun);
      void analytics.registerOnce({ install_date: utcDay(getOnboarding().seededAt) });
      // The firsts only for the store's `firstRun`: an install updated over
      // the air into this code has seen them. For marketer it is new if it was
      // first opened since counting began (`installKind`).
      if (firstRun) startFirsts();
    }
    // Android only, on unless the reader turned it off (`lib/measurement.ts`).
    // Turning it back on is also when a held Install Attribution may go
    // (`lib/install-attribution.ts`).
    const measurement = IS_ANDROID
      ? subscribeMeasurement(() => {
          void analytics.register({ ad_measurement: isMeasurementOn() });
          void sendInstallAttribution();
        })
      : null;
    if (IS_ANDROID) {
      void analytics.register({ ad_measurement: isMeasurementOn() });
      void sendInstallAttribution();
    }
    // Give the opening frame priority over maintenance of previous installs.
    const maintenance = requestIdleCallback(
      () => {
        void registerBackgroundTask();
        void clearLegacyScheduledNotifications();
        dropRetiredFound();
      },
      { timeout: SPLASH_FALLBACK_MS },
    );
    // Unless the reader turned it off (`lib/measurement.ts`).
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
      cancelIdleCallback(maintenance);
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
            onSuccess={() => markLaunch('query-restore-complete')}
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
