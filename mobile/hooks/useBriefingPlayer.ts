import { Asset } from 'expo-asset';
// The managed player starts with a null source; native media loading remains
// lazy while Expo owns subscription and unmount cleanup.
import {
  type AudioPlayer,
  type AudioStatus,
  preload,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { deleteItemAsync, getItemAsync } from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { API_BASE } from '../constants/theme';
import { hapticImpact } from '../lib/haptics';

const POSITION_KEY = 'zuhd_briefing_pos';
const DATE_KEY = 'zuhd_briefing_date';
const PLAYBACK_STATUS_UPDATE = 'playbackStatusUpdate';
// Hard cap on how long we'll wait for an AVPlayer to report `isLoaded: true`
// after a play() request before giving up and tearing it down. Replaces the
// older 100ms x 15 polling loop and the 300ms verify-after-resume timer
// with a single status-driven path.
const PLAY_GIVE_UP_MS = 10_000;

const icon = require('../assets/icon.png');

// Module-scoped artwork resolution. The icon never changes during a session,
// and Asset.loadAsync runs an async I/O probe — caching the URI once
// eliminates the per-write redundancy when we activate the lock-screen card,
// refresh metadata after duration is known, or recreate the player.
let cachedArtworkUrl: string | undefined;
async function getArtworkUrl(): Promise<string | undefined> {
  if (cachedArtworkUrl !== undefined) return cachedArtworkUrl;
  try {
    const assets = await Asset.loadAsync(icon);
    cachedArtworkUrl = assets[0]?.localUri ?? assets[0]?.uri;
  } catch {
    cachedArtworkUrl = undefined;
  }
  return cachedArtworkUrl;
}

interface BriefingPlayer {
  playing: boolean;
  elapsed: number;
  duration: number;
  date: string;
  /** False when the feed didn't surface a briefing date — typically because
   *  the latest mp3 has aged out of the 7-day server retention window or
   *  generation has been broken longer than that. Consumers should toast
   *  rather than calling toggle, since toggle() is a no-op in this state. */
  available: boolean;
  toggle: () => void;
  seek: (seconds: number) => void;
  close: () => void;
}

// Resolve once AVPlayer's currentItem has loaded enough metadata to know its
// duration, or after `timeoutMs` regardless. Lock-screen activation must wait
// for this — `setActiveForLockScreen` writes the first MPNowPlayingInfo entry
// synchronously, and if `player.duration` is still 0 at that moment iOS pins
// the empty-scrubber state for the lifetime of the card. Subsequent
// `updateLockScreenMetadata` calls do not reliably reset it.
function waitForLoaded(player: AudioPlayer, timeoutMs = 5000): Promise<void> {
  if (player.isLoaded && player.duration > 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        sub.remove();
      } catch {}
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    const sub = player.addListener(PLAYBACK_STATUS_UPDATE, (status: AudioStatus) => {
      if (status.isLoaded && status.duration > 0) finish();
    });
  });
}

export function useBriefingPlayer(date: string | undefined, feedDuration?: number): BriefingPlayer {
  // No synthetic fallback to today's UTC date — that path produced a
  // guaranteed 404 whenever the latest briefing was >36h old. The feed
  // exposes the date of the most recent mp3 still on disk; if that's
  // missing entirely we surface `available: false` instead of attempting
  // playback we know will fail.
  const effectiveDate = date ?? '';
  const available = !!date;
  // A null source keeps initial mount cheap. Expo owns the native object's
  // lifetime; toggle() installs/removes sources with replace().
  const managedPlayer = useAudioPlayer(null, {
    updateInterval: 500,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(managedPlayer);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const savedDate = useRef<string | null>(null);
  const lockScreenActive = useRef(false);
  const lockScreenDurationKnown = useRef(false);
  const preloadedUrl = useRef<string | null>(null);
  // Suppress listener-driven setPlaying briefly after user taps toggle
  const userToggleAt = useRef(0);
  const backgroundAt = useRef<number>(0);
  // Single timer reused by the status-driven start. Holds the give-up
  // deadline for a play() that hasn't taken yet — when status reports
  // `playing:true` we clear it; if the deadline fires, we tear down.
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a play() has been issued but `status.playing` hasn't reported
  // true yet. The status listener uses this to retry play() once `isLoaded`
  // flips to true (covers cold AVPlayer that silently no-ops the first call
  // while it's still buffering).
  const wantsToPlayRef = useRef(false);
  const closedRef = useRef(false);
  // One-shot guard consumed by the next toggle(): suppresses position restore
  // after the user dismisses the player with X. Synchronous so it beats the
  // async POSITION_KEY write that close() fires off.
  const skipRestoreRef = useRef(false);
  const devMockActive = useRef(false);

  // On app resume, save the last-known position and re-sync UI to the
  // player's actual state. We don't pre-emptively tear down stale players —
  // if iOS reclaimed native audio resources during the suspension, the
  // status-driven start in toggle() will detect it (no isLoaded → give-up
  // timeout) and tear down lazily. That removes the 30s wall-clock guess
  // and avoids dropping a perfectly healthy paused player.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state !== 'active') {
        backgroundAt.current = Date.now();
        return;
      }
      if (!playerRef.current) return;

      // Save position for any cold-start that might happen next
      try {
        const pos = playerRef.current.currentTime;
        if (pos > 0 && savedDate.current) {
          await Promise.all([
            Storage.setItem(POSITION_KEY, String(Math.floor(pos))),
            Storage.setItem(DATE_KEY, savedDate.current),
          ]);
        }
      } catch {}

      if (playerRef.current.playing) {
        try {
          await setIsAudioActiveAsync(true);
        } catch {}
      }
      setPlaying(playerRef.current.playing);
    });
    return () => sub.remove();
  }, []);

  // Preload audio for the latest briefing date — only when the feed has
  // surfaced one. Preloading a URL we know doesn't exist would just queue
  // a 404 round-trip on every launch.
  useEffect(() => {
    if (!effectiveDate) return;
    const url = `${API_BASE}/audio/briefing-${effectiveDate}.mp3`;
    if (preloadedUrl.current !== url) {
      try {
        preload(url, { preferredForwardBufferDuration: 30 });
      } catch {}
      preloadedUrl.current = url;
    }
  }, [effectiveDate]);

  const teardownPlayer = useCallback(() => {
    if (giveUpTimer.current) {
      clearTimeout(giveUpTimer.current);
      giveUpTimer.current = null;
    }
    wantsToPlayRef.current = false;
    if (playerRef.current) {
      try {
        playerRef.current.clearLockScreenControls();
        playerRef.current.pause();
        playerRef.current.replace(null);
      } catch {}
    }
    playerRef.current = null;
    lockScreenActive.current = false;
    lockScreenDurationKnown.current = false;
  }, []);

  const savePosition = useCallback(() => {
    if (!playerRef.current || !savedDate.current) return;
    try {
      const pos = playerRef.current.currentTime;
      if (pos > 0) {
        void Storage.setItem(POSITION_KEY, String(Math.floor(pos)));
        void Storage.setItem(DATE_KEY, savedDate.current);
      }
    } catch {}
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup-only effect — runs on unmount, refs capture current values
  useEffect(() => {
    return () => {
      savePosition();
      teardownPlayer();
      setIsAudioActiveAsync(false);
    };
  }, []);

  // First-time activation of the lock-screen card. iOS won't have a duration
  // yet, so the scrubber will be empty — refreshLockScreenMetadata picks
  // that up later via the cheaper updateLockScreenMetadata path.
  const activateLockScreen = useCallback(async (player: AudioPlayer) => {
    try {
      const artworkUrl = await getArtworkUrl();
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

  // Refresh the metadata on an already-active lock-screen card — used once
  // duration is known so the scrubber populates, and again if the system's
  // media services reset (the card may have been dropped during the crash).
  // updateLockScreenMetadata is a no-op on inactive players, so it's safe.
  const refreshLockScreenMetadata = useCallback(async (player: AudioPlayer) => {
    try {
      const artworkUrl = await getArtworkUrl();
      player.updateLockScreenMetadata({
        title: 'Daily Briefing',
        artist: 'zuhd.news',
        albumTitle: savedDate.current ?? undefined,
        ...(artworkUrl ? { artworkUrl } : {}),
      });
    } catch {}
  }, []);

  // Arms (or re-arms) the give-up timer that detects a play() request that
  // never took — fired once `isLoaded` never becomes true within the budget.
  const armGiveUp = useCallback(() => {
    if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
    giveUpTimer.current = setTimeout(() => {
      giveUpTimer.current = null;
      if (!wantsToPlayRef.current) return;
      // Player never started — assume native resources are dead. Teardown
      // so the next toggle creates a fresh player.
      teardownPlayer();
      setPlaying(false);
    }, PLAY_GIVE_UP_MS);
  }, [teardownPlayer]);

  // Expo owns the playback-status subscription. Keep only the app-specific
  // policy here: recovery, lock-screen metadata, cold-load retry, and UI state.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || player !== managedPlayer || closedRef.current) return;

    if (status.mediaServicesDidReset && lockScreenActive.current) {
      void refreshLockScreenMetadata(player);
    }
    if (!lockScreenDurationKnown.current && status.duration > 0) {
      lockScreenDurationKnown.current = true;
      void refreshLockScreenMetadata(player);
    }
    if (wantsToPlayRef.current && status.isLoaded && !status.playing) {
      try {
        player.play();
      } catch {}
    }
    if (wantsToPlayRef.current && status.playing) {
      wantsToPlayRef.current = false;
      if (giveUpTimer.current) {
        clearTimeout(giveUpTimer.current);
        giveUpTimer.current = null;
      }
    }

    const sinceToggle = Date.now() - userToggleAt.current;
    if (sinceToggle >= 500 || status.didJustFinish) setPlaying(status.playing);
    if (status.currentTime > 0) setElapsed(Math.floor(status.currentTime));

    if (status.didJustFinish) {
      wantsToPlayRef.current = false;
      if (giveUpTimer.current) {
        clearTimeout(giveUpTimer.current);
        giveUpTimer.current = null;
      }
      setPlaying(false);
      setElapsed(0);
      void Storage.setItem(POSITION_KEY, '0');
      player.seekTo(0).catch(() => {});
      try {
        player.clearLockScreenControls();
      } catch {}
      lockScreenActive.current = false;
      lockScreenDurationKnown.current = false;
    }
  }, [managedPlayer, refreshLockScreenMetadata, status]);

  const toggle = useCallback(async () => {
    hapticImpact();
    userToggleAt.current = Date.now();
    closedRef.current = false;

    // No briefing available — refuse to attempt playback rather than fall
    // through to a 404. Consumers should also gate on `available` to show
    // a toast; this is the defensive layer.
    if (!effectiveDate && !playerRef.current && !devMockActive.current) {
      return;
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
          if (giveUpTimer.current) {
            clearTimeout(giveUpTimer.current);
            giveUpTimer.current = null;
          }
          wantsToPlayRef.current = false;
          savePosition();
          playerRef.current.pause();
          setPlaying(false);
        } else {
          try {
            await setIsAudioActiveAsync(true);
          } catch {}
          wantsToPlayRef.current = true;
          playerRef.current.play();
          setPlaying(true);
          armGiveUp();
        }
        return;
      }

      // First play — configure the managed player and install its source.
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
        });
        await setIsAudioActiveAsync(true);
      } catch {} // May fail in Expo Go

      const player = managedPlayer;
      savedDate.current = effectiveDate;
      playerRef.current = player;
      try {
        player.replace(`${API_BASE}/audio/briefing-${effectiveDate}.mp3`);
      } catch {
        playerRef.current = null;
        if (__DEV__) {
          devMockActive.current = true;
          setPlaying(true);
          setElapsed(272);
        }
        return;
      }

      // Restore position if same date — unless the user just closed with X,
      // in which case the one-shot guard forces a fresh 0:00 start.
      if (skipRestoreRef.current) {
        skipRestoreRef.current = false;
      } else {
        try {
          let [savedPos, savedDateStr] = await Promise.all([
            Storage.getItem(POSITION_KEY),
            Storage.getItem(DATE_KEY),
          ]);
          if (savedPos === null && savedDateStr === null) {
            [savedPos, savedDateStr] = await Promise.all([
              getItemAsync(POSITION_KEY),
              getItemAsync(DATE_KEY),
            ]);
            await Promise.all([
              savedPos === null ? Promise.resolve() : Storage.setItem(POSITION_KEY, savedPos),
              savedDateStr === null ? Promise.resolve() : Storage.setItem(DATE_KEY, savedDateStr),
            ]);
          }
          if (savedDateStr === effectiveDate && savedPos) {
            const pos = parseInt(savedPos, 10);
            if (pos > 0) {
              player.seekTo(pos).catch(() => {});
              setElapsed(pos);
            }
          }
        } catch {}
      }

      // Kick off playback immediately so the first tap is responsive. play()
      // safely no-ops if AVPlayer is still buffering — the cold-start retry
      // in the status listener re-issues it once isLoaded flips true.
      wantsToPlayRef.current = true;
      player.play();
      setPlaying(true);
      armGiveUp();

      // Defer lock-screen activation until AVPlayer reports a real duration.
      // The first MPNowPlayingInfo write must carry it — if duration is 0 at
      // setActiveForLockScreen time, iOS pins the empty/wrong-duration
      // scrubber state for the lifetime of the card and later
      // updateLockScreenMetadata calls don't reliably reset it. play() above
      // is safe to call before activation: AudioPlayer.play() only writes
      // NowPlayingInfo when already active, so no duration=0 leaks through.
      // 5s timeout falls back to activating with whatever duration AVPlayer
      // has on a slow network, rather than withholding controls indefinitely.
      await waitForLoaded(player, 5000);

      // Bail if the user closed the player or swapped dates during the wait.
      if (closedRef.current || playerRef.current !== player) return;

      activateLockScreen(player);
      lockScreenDurationKnown.current = player.duration > 0;
    } catch {
      // Clean up partially-created player on failure
      teardownPlayer();
    }
  }, [effectiveDate, managedPlayer, savePosition, activateLockScreen, armGiveUp, teardownPlayer]);

  const lastHapticSecRef = useRef(-1);
  const seek = useCallback((seconds: number) => {
    if (!playerRef.current) return;
    const clamped = Math.max(0, Math.min(seconds, playerRef.current.duration || Infinity));
    playerRef.current.seekTo(clamped).catch(() => {});
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
    // We can't rely on the async storage writes below landing before
    // the user taps LISTEN again — this ref closes the race.
    skipRestoreRef.current = true;
    // Close = stop & forget. Clear both persisted keys so even after the
    // in-memory guard resets, a cold start won't resurrect an old position.
    void Promise.all([
      Storage.removeItem(POSITION_KEY),
      Storage.removeItem(DATE_KEY),
      // Clear legacy copies too so a rollback cannot resurrect the position.
      deleteItemAsync(POSITION_KEY).catch(() => {}),
      deleteItemAsync(DATE_KEY).catch(() => {}),
    ]);
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch {}
    }
    teardownPlayer();
    setPlaying(false);
    setElapsed(0);
    hapticImpact();
  }, [teardownPlayer]);

  // In dev without a native player, provide a mock duration so the bar renders properly
  const effectiveDuration =
    feedDuration || (__DEV__ && !playerRef.current && elapsed > 0 ? 720 : 0);

  return {
    playing,
    elapsed,
    duration: effectiveDuration,
    date: effectiveDate,
    available,
    toggle,
    seek,
    close,
  };
}
