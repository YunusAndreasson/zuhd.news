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
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
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
  date: string;
  toggle: () => void;
  seek: (seconds: number) => void;
  close: () => void;
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

/** Today's UTC date as YYYY-MM-DD — fallback when the feed hasn't surfaced
 *  a fresher briefing date. Briefings are generated on UTC cycles, so the
 *  audio file at this URL is the one a "play latest" tap should hit. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useBriefingPlayer(date: string | undefined, feedDuration?: number): BriefingPlayer {
  const effectiveDate = date ?? todayUtc();
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const subRef = useRef<{ remove(): void } | null>(null);
  const savedDate = useRef<string | null>(null);
  const lockScreenActive = useRef(false);
  const lockScreenDurationKnown = useRef(false);
  const preloadedUrl = useRef<string | null>(null);
  // Suppress listener-driven setPlaying briefly after user taps toggle
  const userToggleAt = useRef(0);
  const backgroundAt = useRef<number>(0);
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  // One-shot guard consumed by the next toggle(): suppresses position restore
  // after the user dismisses the player with X. Synchronous so it beats the
  // async POSITION_KEY write that close() fires off.
  const skipRestoreRef = useRef(false);
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
      lockScreenDurationKnown.current = false;
      setPlaying(false);
    });
    return () => sub.remove();
  }, []);

  // Preload audio for the latest briefing date
  useEffect(() => {
    const url = `${API_BASE}/audio/briefing-${effectiveDate}.mp3`;
    if (preloadedUrl.current !== url) {
      try {
        preload(url, { preferredForwardBufferDuration: 30 });
      } catch {}
      preloadedUrl.current = url;
    }
  }, [effectiveDate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup-only effect — runs on unmount, refs capture current values
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
      lockScreenDurationKnown.current = false;
      setIsAudioActiveAsync(false);
    };
  }, []);

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

  // Writes NowPlayingInfo. Safe to call more than once — re-calling after the
  // AVPlayer knows its duration makes iOS refresh the lock-screen scrubber.
  const writeLockScreenInfo = useCallback(async (player: AudioPlayer) => {
    try {
      const assets = await Asset.loadAsync(icon);
      const artworkUrl = assets[0]?.localUri ?? assets[0]?.uri;
      player.setActiveForLockScreen(
        true,
        {
          title: 'Daily Briefing',
          artist: 'zuhd.news',
          albumTitle: savedDate.current ?? undefined,
          ...(artworkUrl ? { artworkUrl } : {}),
        },
        { showSeekForward: true, showSeekBackward: true },
      );
      lockScreenActive.current = true;
    } catch {}
  }, []);

  const toggle = useCallback(async () => {
    hapticImpact();
    userToggleAt.current = Date.now();
    closedRef.current = false;
    if (verifyTimer.current) {
      clearTimeout(verifyTimer.current);
      verifyTimer.current = null;
    }

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
              lockScreenDurationKnown.current = false;
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

      const player = safeCreatePlayer(`${API_BASE}/audio/briefing-${effectiveDate}.mp3`);
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
        // Ignore status updates after user closed the player — the paused
        // player still fires events that would flicker state back to visible.
        if (closedRef.current) return;
        // Refresh NowPlayingInfo once the AVPlayer knows its duration so
        // iOS lock-screen gets a real timing scrubber. The initial
        // activation below fires before duration is loaded; this second
        // write updates it.
        if (!lockScreenDurationKnown.current && status.duration > 0) {
          lockScreenDurationKnown.current = true;
          writeLockScreenInfo(player);
        }
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
          lockScreenDurationKnown.current = false;
        }
      });

      // Restore position if same date — unless the user just closed with X,
      // in which case the one-shot guard forces a fresh 0:00 start.
      if (skipRestoreRef.current) {
        skipRestoreRef.current = false;
      } else {
        try {
          const [savedPos, savedDateStr] = await Promise.all([
            getItemAsync(POSITION_KEY),
            getItemAsync(DATE_KEY),
          ]);
          if (savedDateStr === effectiveDate && savedPos) {
            const pos = parseInt(savedPos, 10);
            if (pos > 0) {
              player.seekTo(pos);
              setElapsed(pos);
            }
          }
        } catch {}
      }

      savedDate.current = effectiveDate;
      playerRef.current = player;
      subRef.current = eventSub;

      player.play();
      setPlaying(true);

      // A freshly-created AVPlayer isn't necessarily ready to play on the
      // first play() call — for the first-ever toggle of a session the
      // preload registry warms it up, but on a second open (after close
      // tore the player down and consumed the registry entry), play() on a
      // cold AVPlayer silently no-ops while it's still buffering. Poll and
      // retry play() until it actually starts, so the user never has to tap
      // LISTEN a second time. Give up after ~1.5s to avoid a hot loop.
      let attempts = 0;
      const retryPlay = () => {
        if (!playerRef.current || playerRef.current !== player) return;
        if (player.playing) {
          verifyTimer.current = null;
          return;
        }
        attempts += 1;
        if (attempts >= 15) {
          verifyTimer.current = null;
          return;
        }
        try {
          player.play();
        } catch {}
        verifyTimer.current = setTimeout(retryPlay, 100);
      };
      verifyTimer.current = setTimeout(retryPlay, 100);

      // Activate lock-screen controls right after play so iOS registers
      // NowPlayingInfo while the audio session is hot. The status listener
      // will refresh this entry once duration is known, populating the
      // lock-screen scrubber.
      writeLockScreenInfo(player);
    } catch {
      // Clean up partially-created player on failure
      subRef.current?.remove();
      subRef.current = null;
      playerRef.current?.remove();
      playerRef.current = null;
    }
  }, [effectiveDate, savePosition, writeLockScreenInfo]);

  const lastHapticSecRef = useRef(-1);
  const seek = useCallback((seconds: number) => {
    if (!playerRef.current) return;
    const clamped = Math.max(0, Math.min(seconds, playerRef.current.duration || Infinity));
    playerRef.current.seekTo(clamped);
    const sec = Math.floor(clamped);
    setElapsed(sec);
    // Discrete tick per scrubbed-second boundary. hapticImpact (not Tick) —
    // iOS's AVAudioSession in playback mode suppresses selectionAsync(), so
    // the Light impact is the reliable choice during audio playback.
    if (sec !== lastHapticSecRef.current) {
      lastHapticSecRef.current = sec;
      hapticImpact();
    }
  }, []);

  const close = useCallback(() => {
    closedRef.current = true;
    // Consumed by the next toggle() to skip position restore synchronously.
    // We can't rely on the async SecureStore writes below landing before
    // the user taps LISTEN again — this ref closes the race.
    skipRestoreRef.current = true;
    if (verifyTimer.current) {
      clearTimeout(verifyTimer.current);
      verifyTimer.current = null;
    }
    // Close = stop & forget. Clear both persisted keys so even after the
    // in-memory guard resets, a cold start won't resurrect an old position.
    deleteItemAsync(POSITION_KEY).catch(() => {});
    deleteItemAsync(DATE_KEY).catch(() => {});
    // Fully tear down the player and its lock-screen card.
    if (playerRef.current) {
      subRef.current?.remove();
      try {
        playerRef.current.pause();
        playerRef.current.clearLockScreenControls();
      } catch {}
      playerRef.current.remove();
      playerRef.current = null;
      subRef.current = null;
      lockScreenActive.current = false;
      lockScreenDurationKnown.current = false;
    }
    setPlaying(false);
    setElapsed(0);
    hapticImpact();
  }, []);

  // In dev without a native player, provide a mock duration so the bar renders properly
  const effectiveDuration =
    feedDuration || (__DEV__ && !playerRef.current && elapsed > 0 ? 720 : 0);

  return {
    playing,
    elapsed,
    duration: effectiveDuration,
    date: effectiveDate,
    toggle,
    seek,
    close,
  };
}
