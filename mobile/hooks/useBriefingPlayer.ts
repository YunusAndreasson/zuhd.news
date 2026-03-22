import { Asset } from 'expo-asset';
import {
  createAudioPlayer,
  preload,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { getItemAsync, setItemAsync } from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../constants/theme';

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

export function useBriefingPlayer(date: string | undefined, feedDuration?: number): BriefingPlayer {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const subRef = useRef<any>(null);
  const savedDate = useRef<string | null>(null);
  const lockScreenActive = useRef(false);
  const preloadedUrl = useRef<string | null>(null);

  // Preload audio as soon as we know the briefing date
  useEffect(() => {
    if (!date) return;
    const url = `${API_BASE}/audio/briefing-${date}.mp3`;
    if (preloadedUrl.current !== url) {
      preload(url);
      preloadedUrl.current = url;
    }
  }, [date]);

  useEffect(() => {
    return () => {
      savePosition();
      subRef.current?.remove();
      playerRef.current?.remove();
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

      // Sync play/pause state + elapsed from player events
      // This handles lock screen controls, headphone controls, interruptions
      const eventSub = player.addListener(PLAYBACK_STATUS_UPDATE, (status: AudioStatus) => {
        setPlaying(status.playing);
        if (status.currentTime > 0) {
          setElapsed(Math.floor(status.currentTime));
        }
        if (status.didJustFinish) {
          setPlaying(false);
          setElapsed(0);
          setItemAsync(POSITION_KEY, '0');
          // Clean up native player + subscription
          try { player.clearLockScreenControls(); } catch {}
          eventSub.remove();
          player.remove();
          subRef.current = null;
          playerRef.current = null;
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
