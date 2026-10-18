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
import { RUNTIME_FONTS } from '../constants/fonts';
import { ANIMATION, DARK_COLORS } from '../constants/theme';
import { ThemeProvider, useTheme } from '../hooks/useTheme';
import { registerBackgroundTask } from '../lib/background-fetch';
import { clearLegacyScheduledNotifications, setupNotificationChannels } from '../lib/notifications';
import { PERSIST_BUSTER, PERSIST_MAX_AGE_MS, persister, queryClient } from '../lib/query-client';
import { dropRetiredFound } from '../lib/read-store';

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
  // iOS registers its faces here; Android's are embedded, so it is loaded at
  // the first render (`constants/fonts`).
  const [fontsLoaded, fontError] = useFonts(RUNTIME_FONTS);

  useEffect(() => {
    void registerBackgroundTask();
    void clearLegacyScheduledNotifications();
    dropRetiredFound();
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DARK_COLORS.bg,
  },
});
