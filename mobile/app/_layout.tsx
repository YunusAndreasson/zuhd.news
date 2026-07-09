import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { DARK_COLORS } from '../constants/theme';
import { ThemeProvider, useTheme } from '../hooks/useTheme';
import { registerBackgroundTask } from '../lib/background-fetch';
import { clearLegacyScheduledNotifications, setupNotificationChannels } from '../lib/notifications';
import {
  setBriefing as setPendingBriefing,
  set as setPendingSlug,
} from '../lib/pending-notification';
import { PERSIST_MAX_AGE_MS, persister, queryClient } from '../lib/query-client';

configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

// Skia 2.6.2 deprecates SkPath mutation methods (moveTo, lineTo, addCircle…)
// in favor of `Skia.PathBuilder.Make().…detach()`. Reading the native binding
// (cpp/api/JsiSkPathBuilder.h:326 — `build()` constructs a JsiSkPath whose
// EXPORT_JSI_API_TYPENAME is "Path") confirms the built path satisfies the
// `isPath` predicate the JSX <Path> renderer uses, so the migration works.
// disaster-glyphs.ts is on the new API; remaining call sites
// (LocationsBlock, TrendBlock, SankeyBlock, TrajectoryChart, MiniGlobe) still
// emit deprecation warnings — silence them in dev until the sweep completes
// so iteration logs stay readable. Remove this filter once all sites move
// over.
if (__DEV__) {
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('[react-native-skia] SkPath.')) {
      return;
    }
    origWarn(...args);
  };
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 250 });

// Fallback: if fonts or the first article load stall, force-hide the splash
// after 8s so the user sees *something* rather than a frozen launch screen.
const SPLASH_FALLBACK_MS = 8000;

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

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'SourceSans3-Regular': require('../assets/fonts/SourceSans3-Regular.ttf'),
    'SourceSans3-SemiBold': require('../assets/fonts/SourceSans3-SemiBold.ttf'),
    'SourceSans3-Bold': require('../assets/fonts/SourceSans3-Bold.ttf'),
    'SourceSans3-Italic': require('../assets/fonts/SourceSans3-Italic.ttf'),
    'SourceSans3-BoldItalic': require('../assets/fonts/SourceSans3-BoldItalic.ttf'),
    'SourceSans3SC-SemiBold': require('../assets/fonts/SourceSans3SC-SemiBold.ttf'),
  });

  useEffect(() => {
    registerBackgroundTask();
    clearLegacyScheduledNotifications();
    // Set up Android channels at startup so they exist before any push, even
    // if the user grants notification permission later via OS settings.
    setupNotificationChannels();
    const stashResponse = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      // Daily-briefing pushes carry `kind: 'briefing'` — they have no article
      // slug, so route them to the briefing player rather than the article view.
      if (data?.kind === 'briefing') {
        setPendingBriefing();
        return;
      }
      if (typeof data?.slug === 'string') setPendingSlug(data.slug);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(stashResponse);
    // Cold-start: the listener above only catches responses delivered AFTER it
    // subscribes, but a tap on a notification while the app was killed launches
    // the JS bundle with the response already dispatched. `getLastNotificationResponseAsync`
    // returns the response that brought the app to the foreground, so we
    // route it through the same handler. Without this, cold-start taps were
    // silently dropped.
    //
    // Clearing afterwards is critical: the OS persists the last response
    // across app launches, so without `clearLastNotificationResponseAsync`
    // a user who taps a push, reads, swipes the app away, and re-opens it
    // would see the same article re-open every launch.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        stashResponse(response);
        Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => {});

    // Fallback: force-hide the splash if fonts/feed stall so the user sees
    // something rather than a frozen launch screen. Cleared on unmount.
    const splashFallback = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
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
      sub.remove();
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
            persistOptions={{ persister, maxAge: PERSIST_MAX_AGE_MS }}
          >
            <ThemeProvider fontsAvailable={fontsLoaded}>
              <BottomSheetModalProvider>
                <ThemedShell />
              </BottomSheetModalProvider>
            </ThemeProvider>
          </PersistQueryClientProvider>
        </Suspense>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DARK_COLORS.bg,
  },
});
