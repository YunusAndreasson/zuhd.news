import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../constants/theme';
import { getItemAsync, setItemAsync } from 'expo-secure-store';

const POSITION_KEY = 'zuhd_briefing_pos';
const DATE_KEY = 'zuhd_briefing_date';

interface BriefingPlayer {
  playing: boolean;
  toggle: () => void;
}

export function useBriefingPlayer(date: string | undefined): BriefingPlayer {
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<any>(null);
  const subRef = useRef<any>(null);
  const savedDate = useRef<string | null>(null);

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

  const toggle = useCallback(async () => {
    if (!date) return;

    try {
      const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');

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

      // First play — create player
      await setAudioModeAsync({ playsInSilentMode: true });
      const player = createAudioPlayer({
        uri: `${API_BASE}/audio/briefing-${date}.mp3`,
      });

      // Lock screen controls with artwork
      try {
        const { Asset } = require('expo-asset');
        const [icon] = await Asset.loadAsync(require('../assets/icon.png'));
        player.setActiveForLockScreen(true, {
          title: `Daily Briefing — ${date}`,
          artist: 'zuhd.news',
          artworkUrl: icon.localUri ?? icon.uri,
        });
      } catch {}

      // Listen for playback end
      subRef.current = player.addListener('playbackStatusUpdate', (status: any) => {
        if (status.didJustFinish) {
          setPlaying(false);
          // Clear saved position on completion
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
          if (pos > 0) {
            player.seekTo(pos);
          }
        }
      } catch {}

      savedDate.current = date;
      playerRef.current = player;
      player.play();
      setPlaying(true);
    } catch {
      // expo-audio unavailable
    }
  }, [date, playing, savePosition]);

  return { playing, toggle };
}
