import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { markLaunch } from '../lib/launch-timing';

const HEATMAP_SPLASH_GRACE_MS = 1200;

/** Give the cached globe layers a moment to paint together once the feed is readable. */
export function useLaunchSplash(loading: boolean, heatmapReady: boolean): void {
  const hidden = useRef(false);
  useEffect(() => {
    if (loading || hidden.current) return;
    const reveal = () => {
      hidden.current = true;
      markLaunch('splash-hide-requested');
      SplashScreen.hide();
    };
    if (heatmapReady) {
      reveal();
      return;
    }
    const timer = setTimeout(reveal, HEATMAP_SPLASH_GRACE_MS);
    return () => clearTimeout(timer);
  }, [loading, heatmapReady]);
}
