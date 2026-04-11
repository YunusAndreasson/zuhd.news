import { Asset } from 'expo-asset';
// Imperative createAudioPlayer (not useAudioPlayer hook) — player is created
// lazily on first toggle and torn down on background recovery, which the hook
// doesn't support since it allocates immediately on mount.
import {
  type AudioPlayer,
  type AudioStatus,
  createAudioPlayer,
  preload,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from 'expo-audio';
import { getItemAsync, setItemAsync } from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { API_BASE } from '../constants/theme';
import { hapticImpact, hapticTick } from '../lib/haptics';

const POSITION_KEY = 'zuhd_briefing_pos';
const DATE_KEY = 'zuhd_briefing_date';
const PLAYBACK_STATUS_UPDATE = 'playbackStatusUpdate';

const icon = require('../assets/icon.png');

interface BriefingPlayer {
  playing: boolean;
  elapsed: number;
  duration: number;
  toggle: () => void;
  seek: (seconds: number) => void;
}

// createAudioPlayer may throw in Expo Go when native module is outdated.
// Wrap to return null instead of crashing.
function safeCreatePlayer(url: string): AudioPlayer | null {
  try {
    return createAudioPlayer(url, { updateInterval: 500 });
  } catch {
    return null;
  }
}

export function useBriefingPlayer(date: string | undefined, feedDuration?: number): BriefingPlayer {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const subRef = useRef<{ remove(): void } | null>(null);
  const savedDate = useRef<string | null>(null);
  const lockScreenActive = useRef(false);
  const preloadedUrl = useRef<string | null>(null);
  // Suppress listener-driven setPlaying briefly after user taps toggle
  const userToggleAt = useRef(0);
  const backgroundAt = useRef<number>(0);
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const devMockActive = useRef(false);

  // Tear down stale player when app returns from extended background.
  // iOS reclaims native audio resources after ~30s of suspension — the JS
  // playerRef stays non-null but play() silently does nothing.
  // By releasing here, the next toggle() hits the fresh-creation path.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state !== 'active') {
        backgroundAt.current = Date.now();
        return;
      }
      if (!playerRef.current) return;

      const bgDuration = Date.now() - backgroundAt.current;

      // Short background — player is likely still alive, just re-sync
      if (bgDuration < 30_000) {
        if (playerRef.current.playing) {
          try {
            await setIsAudioActiveAsync(true);
          } catch {}
        }
        setPlaying(playerRef.current.playing);
        return;
      }

      // Extended background or player was paused — save position, tear down
      // so next toggle creates a fresh player with working native resources.
      try {
        const pos = playerRef.current.currentTime;
        if (pos > 0 && savedDate.current) {
          await setItemAsync(POSITION_KEY, String(Math.floor(pos)));
          await setItemAsync(DATE_KEY, savedDate.current);
        }
      } catch {}
      subRef.current?.remove();
      try {
        playerRef.current.clearLockScreenControls();
      } catch {}
      playerRef.current.remove();
      playerRef.current = null;
      subRef.current = null;
      lockScreenActive.current = false;
      setPlaying(false);
    });
    return () => sub.remove();
  }, []);

  // Preload audio as soon as we know the briefing date
  useEffect(() => {
    if (!date) return;
    const url = `${API_BASE}/audio/briefing-${date}.mp3`;
    if (preloadedUrl.current !== url) {
      try {
        preload(url, { preferredForwardBufferDuration: 30 });
      } catch {}
      preloadedUrl.current = url;
    }
  }, [date]);

  useEffect(() => {
    return () => {
      if (verifyTimer.current) clearTimeout(verifyTimer.current);
      savePosition();
      subRef.current?.remove();
      try {
        playerRef.current?.clearLockScreenControls();
      } catch {}
      playerRef.current?.remove();
      playerRef.current = null;
      subRef.current = null;
      lockScreenActive.current = false;
      setIsAudioActiveAsync(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const savePosition = useCallback(() => {
    if (!playerRef.current || !savedDate.current) return;
    try {
      const pos = playerRef.current.currentTime;
      if (pos > 0) {
        setItemAsync(POSITION_KEY, String(Math.floor(pos)));
        setItemAsync(DATE_KEY, savedDate.current);
      }
    } catch {}
  }, []);

  const activateLockScreen = useCallback(async (player: AudioPlayer) => {
    if (lockScreenActive.current) return;
    try {
      const assets = await Asset.loadAsync(icon);
      const artworkUrl = assets[0]?.localUri ?? assets[0]?.uri;
      player.setActiveForLockScreen(true, {
        title: 'Daily Briefing',
        artist: 'zuhd.news',
        ...(artworkUrl ? { artworkUrl } : {}),
      });
      lockScreenActive.current = true;
    } catch {}
  }, []);

  const toggle = useCallback(async () => {
    if (!date) return;

    hapticImpact();
    userToggleAt.current = Date.now();

    try {
      // Dev mock — no native player, just toggle UI state
      if (__DEV__ && !playerRef.current && devMockActive.current) {
        devMockActive.current = false;
        setPlaying(false);
        setElapsed(0);
        return;
      }

      // Resume/pause existing player
      if (playerRef.current) {
        if (playerRef.current.playing) {
          savePosition();
          playerRef.current.pause();
          setPlaying(false);
        } else {
          try {
            await setIsAudioActiveAsync(true);
          } catch {}
          playerRef.current.play();
          setPlaying(true);
          // Verify the player actually started — if native resources
          // were reclaimed, playing will still be false after a tick.
          verifyTimer.current = setTimeout(() => {
            if (playerRef.current && !playerRef.current.playing) {
              // Native player is dead — tear down so next tap recreates
              subRef.current?.remove();
              try {
                playerRef.current.clearLockScreenControls();
              } catch {}
              playerRef.current.remove();
              playerRef.current = null;
              subRef.current = null;
              lockScreenActive.current = false;
              setPlaying(false);
            }
          }, 300);
        }
        return;
      }

      // First play — create player
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
        });
        await setIsAudioActiveAsync(true);
      } catch {} // May fail in Expo Go

      const player = safeCreatePlayer(`${API_BASE}/audio/briefing-${date}.mp3`);
      if (!player) {
        // Native module unavailable (Expo Go) — fake expand for UI preview
        if (__DEV__) {
          devMockActive.current = true;
          setPlaying(true);
          setElapsed(272);
        }
        return;
      }

      // Sync play/pause state + elapsed from player events
      // This handles lock screen controls, headphone controls, interruptions
      const eventSub = player.addListener(PLAYBACK_STATUS_UPDATE, (status: AudioStatus) => {
        // Skip transient playing states shortly after user tap to avoid icon flash
        const sinceToggle = Date.now() - userToggleAt.current;
        if (sinceToggle < 500 && !status.didJustFinish) {
          // Still update elapsed time, just don't flip the play/pause icon
          if (status.currentTime > 0) setElapsed(Math.floor(status.currentTime));
          return;
        }
        setPlaying(status.playing);
        if (status.currentTime > 0) {
          setElapsed(Math.floor(status.currentTime));
        }
        if (status.didJustFinish) {
          setPlaying(false);
          setElapsed(0);
          setItemAsync(POSITION_KEY, '0');
          // Seek back to start so the player is ready for replay —
          // don't destroy it or deactivate the audio session, as iOS
          // can refuse to reactivate, requiring a force-kill.
          player.seekTo(0);
          try {
            player.clearLockScreenControls();
          } catch {}
          lockScreenActive.current = false;
        }
      });

      // Restore position if same date
      try {
        const [savedPos, savedDateStr] = await Promise.all([
          getItemAsync(POSITION_KEY),
          getItemAsync(DATE_KEY),
        ]);
        if (savedDateStr === date && savedPos) {
          const pos = parseInt(savedPos, 10);
          if (pos > 0) {
            player.seekTo(pos);
            setElapsed(pos);
          }
        }
      } catch {}

      savedDate.current = date;
      playerRef.current = player;
      subRef.current = eventSub;

      player.play();
      setPlaying(true);

      // Lock screen AFTER play
      activateLockScreen(player);
    } catch {
      // Clean up partially-created player on failure
      subRef.current?.remove();
      subRef.current = null;
      playerRef.current?.remove();
      playerRef.current = null;
    }
  }, [date, savePosition, activateLockScreen]);

  const seek = useCallback((seconds: number) => {
    if (!playerRef.current) return;
    const clamped = Math.max(0, Math.min(seconds, playerRef.current.duration || Infinity));
    playerRef.current.seekTo(clamped);
    setElapsed(Math.floor(clamped));
    hapticTick();
  }, []);

  // In dev without a native player, provide a mock duration so the bar renders properly
  const effectiveDuration =
    feedDuration || (__DEV__ && !playerRef.current && elapsed > 0 ? 720 : 0);

  return { playing, elapsed, duration: effectiveDuration, toggle, seek };
}
