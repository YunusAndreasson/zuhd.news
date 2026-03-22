import { Asset } from 'expo-asset';
import {
  createAudioPlayer,
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
  remaining: number; // seconds remaining, 0 if unknown
  toggle: () => void;
}

export function useBriefingPlayer(date: string | undefined, feedDuration?: number): BriefingPlayer {
  const [playing, setPlaying] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const subRef = useRef<any>(null);
  const savedDate = useRef<string | null>(null);
  const lockScreenActive = useRef(false);
  const feedDurationRef = useRef(feedDuration ?? 0);
  feedDurationRef.current = feedDuration ?? 0;

  // Clean up on unmount
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
      if (playerRef.current) {
        if (playing) {
          savePosition();
          playerRef.current.pause();
          setPlaying(false);
        } else {
          playerRef.current.play();
          setPlaying(true);
        }
        return;
      }

      // Configure audio session
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
      await setIsAudioActiveAsync(true);

      // Create player with periodic status updates for countdown
      const player = createAudioPlayer(`${API_BASE}/audio/briefing-${date}.mp3`, {
        updateInterval: 500,
      });

      // Event subscription — only for detecting playback end
      const eventSub = player.addListener(PLAYBACK_STATUS_UPDATE, (status: AudioStatus) => {
        if (status.didJustFinish) {
          setPlaying(false);
          setRemaining(0);
          lockScreenActive.current = false;
          setItemAsync(POSITION_KEY, '0');
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
          if (pos > 0) player.seekTo(pos);
        }
      } catch {}

      // Play
      savedDate.current = date;
      playerRef.current = player;
      player.play();
      setPlaying(true);

      // Lock screen AFTER play
      activateLockScreen(player);

      // Poll player properties directly for countdown (iOS may not report
      // duration in events for streaming audio without Content-Length)
      const countdownInterval = setInterval(() => {
        if (!playerRef.current) { clearInterval(countdownInterval); return; }
        const d = playerRef.current.duration;
        const c = playerRef.current.currentTime;
        // Use player duration if available, otherwise fall back to feed duration
        const duration = (d > 0 && isFinite(d)) ? d : feedDurationRef.current;
        if (duration > 0) {
          const left = Math.ceil(duration - c);
          setRemaining(left > 0 ? left : 0);
        }
      }, 500);
      subRef.current = {
        remove: () => {
          clearInterval(countdownInterval);
          eventSub.remove();
        },
      };
    } catch {
      // expo-audio unavailable
    }
  }, [date, playing, savePosition, activateLockScreen]);

  return { playing, remaining, toggle };
}
