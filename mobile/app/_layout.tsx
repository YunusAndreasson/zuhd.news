import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Slot } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { Suspense, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { DARK_COLORS } from '../constants/theme';
import { ThemeProvider, useTheme } from '../hooks/useTheme';
import { registerBackgroundTask } from '../lib/background-fetch';
import { enableNotifications, registerPushToken } from '../lib/notifications';
import { set as setPendingSlug } from '../lib/pending-notification';
import { getPreferences, savePreferences } from '../lib/storage';

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
SplashScreen.setOptions({ fade: true, duration: 250 });

function ThemedShell() {
  const { colors, resolvedAppearance } = useTheme();
  return (
    <>
      <StatusBar
        style={resolvedAppearance === 'dark' ? 'light' : 'dark'}
        translucent
        backgroundColor="transparent"
      />
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <Slot />
      </View>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'SourceSans3-Regular': require('../assets/fonts/SourceSans3-Regular.ttf'),
    'SourceSans3-SemiBold': require('../assets/fonts/SourceSans3-SemiBold.ttf'),
    'SourceSans3-Bold': require('../assets/fonts/SourceSans3-Bold.ttf'),
    'SourceSans3-Italic': require('../assets/fonts/SourceSans3-Italic.ttf'),
    'SourceSans3-BoldItalic': require('../assets/fonts/SourceSans3-BoldItalic.ttf'),
    'SourceSans3SC-SemiBold': require('../assets/fonts/SourceSans3SC-SemiBold.ttf'),
  });

  useEffect(() => {
    registerBackgroundTask();
    WebBrowser.warmUpAsync().catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const slug = response.notification.request.content.data?.slug;
      if (typeof slug === 'string') setPendingSlug(slug);
    });

    // Prompt notification permission on first launch so reviewers see native dialog
    const ASKED_KEY = 'zuhd_notif_asked';
    (async () => {
      try {
        const asked = await SecureStore.getItemAsync(ASKED_KEY);
        if (asked) return;
        await SecureStore.setItemAsync(ASKED_KEY, '1');
        // Small delay so the app is visible before the dialog appears
        await new Promise((r) => setTimeout(r, 1500));
        const granted = await enableNotifications();
        if (granted) {
          registerPushToken();
          const prefs = await getPreferences();
          await savePreferences({ ...prefs, notifications: true });
        }
      } catch {}
    })();

    return () => {
      sub.remove();
      WebBrowser.coolDownAsync().catch(() => {});
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <Suspense fallback={<View style={styles.root} />}>
        <ThemeProvider>
          <BottomSheetModalProvider>
            <ThemedShell />
          </BottomSheetModalProvider>
        </ThemeProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DARK_COLORS.bg,
  },
});
