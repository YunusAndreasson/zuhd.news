import { Asset } from 'expo-asset';
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
import { hapticImpact } from '../lib/haptics';

const POSITION_KEY = 'zuhd_briefing_pos';
const DATE_KEY = 'zuhd_briefing_date';
const PLAYBACK_STATUS_UPDATE = 'playbackStatusUpdate';

const icon = require('../assets/icon.png');

interface BriefingPlayer {
  playing: boolean;
  elapsed: number;
  duration: number;
  toggle: () => void;
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

  // Re-sync state when app returns from background
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state === 'active' && playerRef.current) {
        // Re-activate audio session — iOS may have deactivated it during background
        try {
          await setIsAudioActiveAsync(true);
        } catch {}
        // Sync React playing state with native player
        setPlaying(playerRef.current.playing);
      }
    });
    return () => sub.remove();
  }, []);

  // Preload audio as soon as we know the briefing date
  useEffect(() => {
    if (!date) return;
    const url = `${API_BASE}/audio/briefing-${date}.mp3`;
    if (preloadedUrl.current !== url) {
      try {
        preload(url);
      } catch {}
      preloadedUrl.current = url;
    }
  }, [date]);

  useEffect(() => {
    return () => {
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
      // Resume/pause existing player
      if (playerRef.current) {
        if (playerRef.current.playing) {
          savePosition();
          playerRef.current.pause();
          setPlaying(false);
        } else {
          // Re-activate audio session in case iOS deactivated it (e.g. after background)
          try {
            await setIsAudioActiveAsync(true);
          } catch {}
          playerRef.current.play();
          setPlaying(true);
        }
        return;
      }

      // First play — create player
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
      await setIsAudioActiveAsync(true);

      const player = safeCreatePlayer(`${API_BASE}/audio/briefing-${date}.mp3`);
      if (!player) return; // Native module unavailable (Expo Go)

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

  return { playing, elapsed, duration: feedDuration ?? 0, toggle };
}
