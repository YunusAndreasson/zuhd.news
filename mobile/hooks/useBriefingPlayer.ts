import { Asset } from 'expo-asset';
import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioPlayer,
} from 'expo-audio';
import { getItemAsync, setItemAsync } from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../constants/theme';

const POSITION_KEY = 'zuhd_briefing_pos';
const DATE_KEY = 'zuhd_briefing_date';

const icon = require('../assets/icon.png');

interface BriefingPlayer {
  playing: boolean;
  elapsed: number;
  duration: number;
  toggle: () => void;
}

export function useBriefingPlayer(date: string | undefined, feedDuration?: number): BriefingPlayer {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const savedDate = useRef<string | null>(null);
  const lockScreenActive = useRef(false);

  // Polling: sync playing state + elapsed from player properties directly.
  // No reliance on events (iOS events are unreliable for streaming audio).
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;

      // Sync playing state (handles lock screen pause/play, interruptions)
      setPlaying(p.playing);

      // Update elapsed from currentTime
      const c = p.currentTime;
      if (c > 0 && isFinite(c)) {
        setElapsed(Math.floor(c));
      }

      // Detect finish (currentTime reaches or exceeds duration from feed)
      const fd = feedDuration ?? 0;
      if (fd > 0 && c >= fd - 1) {
        setPlaying(false);
        setElapsed(0);
        lockScreenActive.current = false;
        setItemAsync(POSITION_KEY, '0');
        clearInterval(pollRef.current);
      }
    }, 500);
  }, [feedDuration]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
      playerRef.current?.remove();
    };
  }, [stopPolling]);

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

    try {
      // Resume/pause existing player
      if (playerRef.current) {
        if (playerRef.current.playing) {
          savePosition();
          playerRef.current.pause();
          setPlaying(false);
        } else {
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

      const player = createAudioPlayer(`${API_BASE}/audio/briefing-${date}.mp3`, {
        updateInterval: 500,
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
      player.play();
      setPlaying(true);

      // Start polling for state + elapsed
      startPolling();

      // Lock screen AFTER play
      activateLockScreen(player);
    } catch {
      // expo-audio unavailable
    }
  }, [date, savePosition, activateLockScreen, startPolling]);

  return { playing, elapsed, duration: feedDuration ?? 0, toggle };
}
