import { Asset } from 'expo-asset';
// The managed player starts with a null source; native media loading remains
// lazy while Expo owns subscription and unmount cleanup.
import {
  type AudioPlayer,
  type AudioStatus,
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
import { resolveAudioDuration } from '../lib/audio-duration';
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

// Resolve true once AVPlayer has a real duration, or false at the deadline.
// A timeout must never activate Now Playing: its first synchronous metadata
// write would carry duration=0, which iOS can pin for the card's lifetime.
function waitForLoaded(player: AudioPlayer, timeoutMs = 5000): Promise<boolean> {
  if (player.isLoaded && player.duration > 0) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (loadedWithDuration: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        sub.remove();
      } catch {}
      resolve(loadedWithDuration);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const sub = player.addListener(PLAYBACK_STATUS_UPDATE, (status: AudioStatus) => {
      if (status.isLoaded && status.duration > 0) finish(true);
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
  const lockScreenActivationPending = useRef(false);
  const lockScreenActivationToken = useRef(0);
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

  // Audio is fetched when the reader presses listen — never before.
  //
  // This used to `preload(url, { preferredForwardBufferDuration: 30 })` on
  // every launch that had a briefing. A briefing mp3 is ~3 MB at 64 kbps, so
  // a 30-second buffer is ~234 KB — against ~15 KB for the entire day's news.
  // That put ~94% of a typical launch's data into audio the reader had not
  // asked for, on a plan they may be paying for by the megabyte, to save a
  // second of buffering for the minority who tap listen. `toggle()` already
  // installs the source via `player.replace(...)`, so removing this costs
  // listeners a brief spin-up and costs everyone else nothing at all.
  //
  // Keep it that way: "audio downloads only when you press listen" is a claim
  // the privacy page now makes in those words.

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
    lockScreenActivationToken.current += 1;
    lockScreenActivationPending.current = false;
    lockScreenActive.current = false;
    lockScreenDurationKnown.current = false;
  }, []);

  // A feed refresh can rotate to a new briefing while yesterday's player is
  // still paused in memory. Never label and resume that old source as today's:
  // discard it, reset the visible position, and let the next tap load the new
  // date through the normal first-play path.
  useEffect(() => {
    if (!playerRef.current || !savedDate.current || savedDate.current === effectiveDate) return;
    teardownPlayer();
    savedDate.current = null;
    setPlaying(false);
    setElapsed(0);
  }, [effectiveDate, teardownPlayer]);

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

  // First-time activation of the lock-screen card. Duration is a hard gate:
  // artwork and remote commands work without it, but iOS then omits elapsed
  // time and the progress scrubber and may not repair them on a metadata edit.
  const activateLockScreen = useCallback(async (player: AudioPlayer) => {
    if (
      lockScreenActive.current ||
      lockScreenActivationPending.current ||
      !Number.isFinite(player.duration) ||
      player.duration <= 0
    )
      return;

    const activationToken = ++lockScreenActivationToken.current;
    lockScreenActivationPending.current = true;
    try {
      const artworkUrl = await getArtworkUrl();
      if (
        activationToken !== lockScreenActivationToken.current ||
        closedRef.current ||
        playerRef.current !== player ||
        !Number.isFinite(player.duration) ||
        player.duration <= 0
      )
        return;
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
      lockScreenDurationKnown.current = true;
    } catch {
      lockScreenDurationKnown.current = false;
    } finally {
      if (activationToken === lockScreenActivationToken.current) {
        lockScreenActivationPending.current = false;
      }
    }
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
      if (lockScreenActive.current) {
        lockScreenDurationKnown.current = true;
        void refreshLockScreenMetadata(player);
      } else {
        void activateLockScreen(player);
      }
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
      lockScreenActivationToken.current += 1;
      lockScreenActivationPending.current = false;
      lockScreenActive.current = false;
      lockScreenDurationKnown.current = false;
    }
  }, [activateLockScreen, managedPlayer, refreshLockScreenMetadata, status]);

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
      // The five-second deadline only stops this call from waiting. It does
      // not publish a zero-length card: the status effect activates later.
      const loadedWithDuration = await waitForLoaded(player, 5000);

      // Bail if the user closed the player or swapped dates during the wait.
      if (closedRef.current || playerRef.current !== player) return;

      // A timeout leaves playback running but withholds the broken zero-length
      // Now Playing card. The status effect above activates it as soon as
      // AVPlayer publishes a real duration.
      if (loadedWithDuration) await activateLockScreen(player);
    } catch {
      // Clean up partially-created player on failure
      teardownPlayer();
    }
  }, [effectiveDate, managedPlayer, savePosition, activateLockScreen, armGiveUp, teardownPlayer]);

  // Pure data operation: clamp, seek, publish. No haptic — the scrub ratchet
  // belongs to the gesture that drives it, not to the audio timeline. This
  // used to tick once per crossed audio-second, which sounds discrete but
  // isn't: the caller drives it per gesture frame, and on a long briefing a
  // single frame of finger travel crosses several seconds, so the "tick"
  // fired at frame rate. `BriefingBar` now ratchets on spatial detents.
  const seek = useCallback((seconds: number) => {
    if (!playerRef.current) return;
    const clamped = Math.max(0, Math.min(seconds, playerRef.current.duration || Infinity));
    playerRef.current.seekTo(clamped).catch(() => {});
    setElapsed(Math.floor(clamped));
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

  // Native duration is authoritative once loaded. Feed duration keeps the
  // in-app timeline visible during startup instead of coupling it to AVPlayer's
  // metadata timing; the mock remains development-only and last-resort.
  const effectiveDuration = resolveAudioDuration(
    status.duration,
    feedDuration,
    __DEV__ && !playerRef.current && elapsed > 0 ? 720 : 0,
  );

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
