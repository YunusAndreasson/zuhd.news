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
import { getItemAsync } from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { API_BASE } from '../constants/theme';
import { resolveAudioDuration } from '../lib/audio-duration';
import { resolveDownloadedAudioSource } from '../lib/audio-source';
import { hapticImpact } from '../lib/haptics';

const POSITION_KEY = 'zuhd_briefing_pos';
const DATE_KEY = 'zuhd_briefing_date';
const PLAYBACK_STATUS_UPDATE = 'playbackStatusUpdate';
// The CDN currently answers byte-range requests with the complete MP3, which
// lets AVPlayer play while duration remains unknown. Give a local cache write
// a short head start; fall back to streaming on a genuinely slow connection.
const SOURCE_DOWNLOAD_WAIT_MS = 8_000;
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

function resolveBriefingSource(url: string): Promise<string> {
  try {
    const asset = Asset.fromURI(url);
    return resolveDownloadedAudioSource(url, asset.downloadAsync(), SOURCE_DOWNLOAD_WAIT_MS);
  } catch {
    return Promise.resolve(url);
  }
}

interface BriefingPlayer {
  state: 'idle' | 'preparing' | 'playing' | 'paused';
  elapsed: number;
  duration: number;
  date: string;
  resumable: boolean;
  /** Monotonic signal: increments once for each terminal playback failure. */
  failureCount: number;
  /** False when the feed didn't surface a briefing date — typically because
   *  the latest mp3 has aged out of the 7-day server retention window or
   *  generation has been broken longer than that. Consumers should toast
   *  rather than calling toggle, since toggle() is a no-op in this state. */
  available: boolean;
  toggle: () => void;
  seek: (seconds: number) => void;
  dismiss: () => void;
}

// Resolve true once AVPlayer has a real duration, or false at the deadline.
// The caller uses the result to prefer a complete timeline without allowing a
// slow/indefinite native duration read to remove lock-screen controls entirely.
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
  const [preparing, setPreparing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [resumable, setResumable] = useState(false);
  const [hasPlayer, setHasPlayer] = useState(false);
  const [failureCount, setFailureCount] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);
  const savedDate = useRef<string | null>(null);
  const lockScreenActive = useRef(false);
  const lockScreenDurationKnown = useRef(false);
  const lockScreenActivationPending = useRef(false);
  const lockScreenActivationToken = useRef(0);
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
  // User intent is tracked independently from native status. Native playback
  // updates lag taps, so deriving the next action from player.playing makes a
  // rapid even-numbered tap burst collapse into the wrong final state.
  const playingIntentRef = useRef(false);
  // Invalidates async toggle continuations. Audio-session setup and persisted
  // position reads may finish after a later tap or dismissal; only the newest
  // intent is allowed to publish state or call play().
  const toggleTokenRef = useRef(0);
  const sourcePreparingRef = useRef(false);
  const sourceLoadToken = useRef(0);
  const closedRef = useRef(false);

  // Surface persisted progress before playback begins so the idle affordance
  // can say RESUME after a relaunch. Playback restoration remains lazy.
  useEffect(() => {
    let cancelled = false;
    if (!effectiveDate) {
      setResumable(false);
      return;
    }
    Promise.all([Storage.getItem(POSITION_KEY), Storage.getItem(DATE_KEY)])
      .then(async ([storedPos, storedDate]) => {
        if (cancelled) return;
        let savedPos = storedPos;
        let savedDateStr = storedDate;
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
        if (cancelled) return;
        const pos = savedPos ? Number.parseInt(savedPos, 10) : 0;
        setResumable(savedDateStr === effectiveDate && Number.isFinite(pos) && pos > 0);
      })
      .catch(() => {
        if (!cancelled) setResumable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveDate]);

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
          setResumable(true);
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

  // Audio is fetched when the reader presses listen — never before. Once
  // requested, cache the MP3 before playback when the connection can do so
  // promptly. A local file gives AVPlayer deterministic duration metadata for
  // elapsed time and progress in iOS Now Playing.
  //
  // This used to preload on every launch that had a briefing. Today's 12:25
  // briefing is 5.68 MB at 64 kbps, against ~15 KB for the day's news, so that
  // made audio the overwhelming majority of launch traffic even for readers
  // who never pressed LISTEN. Caching the same file only after the tap adds no
  // bytes to a complete listen, gives AVPlayer a dependable local timeline,
  // and preserves the lazy-data promise for everyone else.
  //
  // Keep it that way: "audio downloads only when you press listen" is a claim
  // the privacy page now makes in those words.

  const teardownPlayer = useCallback(() => {
    if (giveUpTimer.current) {
      clearTimeout(giveUpTimer.current);
      giveUpTimer.current = null;
    }
    wantsToPlayRef.current = false;
    playingIntentRef.current = false;
    toggleTokenRef.current += 1;
    sourcePreparingRef.current = false;
    if (playerRef.current) {
      try {
        playerRef.current.clearLockScreenControls();
        playerRef.current.pause();
        playerRef.current.replace(null);
      } catch {}
    }
    playerRef.current = null;
    setHasPlayer(false);
    sourceLoadToken.current += 1;
    lockScreenActivationToken.current += 1;
    lockScreenActivationPending.current = false;
    lockScreenActive.current = false;
    lockScreenDurationKnown.current = false;
  }, []);

  const failPlayback = useCallback(() => {
    teardownPlayer();
    setPreparing(false);
    setPlaying(false);
    setFailureCount((count) => count + 1);
  }, [teardownPlayer]);

  // A feed refresh can rotate to a new briefing while yesterday's player is
  // still paused in memory. Never label and resume that old source as today's:
  // discard it, reset the visible position, and let the next tap load the new
  // date through the normal first-play path.
  useEffect(() => {
    if (!playerRef.current || !savedDate.current || savedDate.current === effectiveDate) return;
    teardownPlayer();
    savedDate.current = null;
    setPlaying(false);
    setPreparing(false);
    setElapsed(0);
    setResumable(false);
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
      void setIsAudioActiveAsync(false).catch(() => {});
    };
  }, []);

  // First-time activation of the lock-screen card. Prefer duration as a hard
  // gate: artwork and remote commands work without it, but iOS then omits the
  // timeline and may not repair it on a metadata edit. A bounded compatibility
  // fallback below still preserves controls if native metadata never resolves.
  const activateLockScreen = useCallback(
    async (player: AudioPlayer, allowUnknownDuration = false) => {
      const hasDuration = Number.isFinite(player.duration) && player.duration > 0;
      if (
        lockScreenActive.current ||
        lockScreenActivationPending.current ||
        (!allowUnknownDuration && !hasDuration)
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
          (!allowUnknownDuration && (!Number.isFinite(player.duration) || player.duration <= 0))
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
        lockScreenDurationKnown.current = Number.isFinite(player.duration) && player.duration > 0;
      } catch {
        lockScreenDurationKnown.current = false;
      } finally {
        if (activationToken === lockScreenActivationToken.current) {
          lockScreenActivationPending.current = false;
        }
      }
    },
    [],
  );

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
      failPlayback();
    }, PLAY_GIVE_UP_MS);
  }, [failPlayback]);

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
        // The card was created by the timeout fallback. Recreate it now that
        // AVPlayer has a duration; a metadata-only update does not reliably
        // make iOS add a timeline to an already-zero-length Now Playing card.
        try {
          player.clearLockScreenControls();
        } catch {}
        lockScreenActivationToken.current += 1;
        lockScreenActivationPending.current = false;
        lockScreenActive.current = false;
        void activateLockScreen(player);
      } else {
        void activateLockScreen(player);
      }
    }
    if (
      wantsToPlayRef.current &&
      !sourcePreparingRef.current &&
      status.isLoaded &&
      !status.playing
    ) {
      try {
        player.play();
      } catch {}
    }
    if (wantsToPlayRef.current && status.playing) {
      wantsToPlayRef.current = false;
      setPreparing(false);
      setPlaying(true);
      if (giveUpTimer.current) {
        clearTimeout(giveUpTimer.current);
        giveUpTimer.current = null;
      }
    }

    if (!wantsToPlayRef.current && !sourcePreparingRef.current) {
      playingIntentRef.current = status.playing;
      setPlaying(status.playing);
    }
    if (status.currentTime >= 0) {
      setElapsed(Math.floor(status.currentTime));
      if (status.currentTime > 0) setResumable(true);
    }

    if (status.didJustFinish) {
      wantsToPlayRef.current = false;
      playingIntentRef.current = false;
      if (giveUpTimer.current) {
        clearTimeout(giveUpTimer.current);
        giveUpTimer.current = null;
      }
      setPreparing(false);
      setPlaying(false);
      setElapsed(0);
      setResumable(false);
      setHasPlayer(false);
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
    closedRef.current = false;
    const toggleToken = ++toggleTokenRef.current;
    const nextPlaying = !playingIntentRef.current;
    playingIntentRef.current = nextPlaying;

    // No briefing available — refuse to attempt playback rather than fall
    // through to a 404. Consumers should also gate on `available` to show
    // a toast; this is the defensive layer.
    if (!effectiveDate && !playerRef.current) {
      playingIntentRef.current = false;
      return;
    }

    if (nextPlaying) setPreparing(true);

    try {
      // Pause/cancel is synchronous. It must not wait behind audio-session
      // setup from a prior play tap, otherwise a quick second tap cannot undo
      // the first one.
      if (!nextPlaying) {
        if (giveUpTimer.current) {
          clearTimeout(giveUpTimer.current);
          giveUpTimer.current = null;
        }
        wantsToPlayRef.current = false;
        if (playerRef.current) {
          if (!playerRef.current.isLoaded) {
            teardownPlayer();
          } else {
            savePosition();
            playerRef.current.pause();
          }
        }
        setPreparing(false);
        setPlaying(false);
        return;
      }

      // Resume existing player. Re-check intent after the async audio-session
      // hop so a newer pause tap wins.
      if (playerRef.current) {
        const player = playerRef.current;
        wantsToPlayRef.current = true;
        try {
          await setIsAudioActiveAsync(true);
        } catch {}
        if (
          toggleToken !== toggleTokenRef.current ||
          !playingIntentRef.current ||
          playerRef.current !== player
        )
          return;
        player.play();
        armGiveUp();
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
      if (toggleToken !== toggleTokenRef.current || !playingIntentRef.current) return;

      const player = managedPlayer;
      savedDate.current = effectiveDate;
      playerRef.current = player;
      setHasPlayer(true);
      const loadToken = ++sourceLoadToken.current;
      wantsToPlayRef.current = true;
      sourcePreparingRef.current = true;

      const remoteUrl = `${API_BASE}/audio/briefing-${effectiveDate}.mp3`;
      const playbackSource = await resolveBriefingSource(remoteUrl);
      if (
        toggleToken !== toggleTokenRef.current ||
        loadToken !== sourceLoadToken.current ||
        closedRef.current ||
        playerRef.current !== player ||
        !wantsToPlayRef.current ||
        !playingIntentRef.current
      )
        return;
      try {
        player.replace(playbackSource);
      } catch {
        failPlayback();
        return;
      }

      // Restore persisted progress only after the source exists; opening the
      // app remains free of audio I/O.
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
          const pos = Number.parseInt(savedPos, 10);
          if (pos > 0) {
            player.seekTo(pos).catch(() => {});
            setElapsed(pos);
            setResumable(true);
          }
        }
      } catch {}

      if (
        toggleToken !== toggleTokenRef.current ||
        loadToken !== sourceLoadToken.current ||
        closedRef.current ||
        playerRef.current !== player ||
        !playingIntentRef.current
      )
        return;

      // Kick off playback immediately so the first tap is responsive. play()
      // safely no-ops if AVPlayer is still buffering — the cold-start retry
      // in the status listener re-issues it once isLoaded flips true.
      sourcePreparingRef.current = false;
      player.play();
      armGiveUp();

      // Defer lock-screen activation until AVPlayer reports a real duration.
      // The first MPNowPlayingInfo write must carry it — if duration is 0 at
      // setActiveForLockScreen time, iOS pins the empty/wrong-duration
      // scrubber state for the lifetime of the card and later
      // updateLockScreenMetadata calls don't reliably reset it. play() above
      // is safe to call before activation: AudioPlayer.play() only writes
      // NowPlayingInfo when already active, so no duration=0 leaks through.
      // Prefer a complete card, but never trade all lock-screen controls for
      // a duration AVPlayer may not discover promptly on this MP3 response.
      const loadedWithDuration = await waitForLoaded(player, 5000);

      // Bail if the user closed the player or swapped dates during the wait.
      if (closedRef.current || playerRef.current !== player) return;

      // The timeout fallback restores artwork/play/pause/skip immediately.
      // If native duration arrives later, the status effect recreates the card
      // so iOS receives duration on its first metadata write.
      await activateLockScreen(player, !loadedWithDuration);
    } catch {
      // Clean up partially-created player on failure
      failPlayback();
    }
  }, [
    effectiveDate,
    managedPlayer,
    savePosition,
    activateLockScreen,
    armGiveUp,
    failPlayback,
    teardownPlayer,
  ]);

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

  const dismiss = useCallback(() => {
    closedRef.current = true;
    playingIntentRef.current = false;
    toggleTokenRef.current += 1;
    if (giveUpTimer.current) {
      clearTimeout(giveUpTimer.current);
      giveUpTimer.current = null;
    }
    wantsToPlayRef.current = false;
    sourcePreparingRef.current = false;
    if (playerRef.current) {
      if (playerRef.current.isLoaded) {
        savePosition();
        try {
          playerRef.current.pause();
        } catch {}
      } else {
        teardownPlayer();
      }
    }
    setPreparing(false);
    setPlaying(false);
    if (elapsed > 0) setResumable(true);
    hapticImpact();
  }, [elapsed, savePosition, teardownPlayer]);

  // Native duration is authoritative once loaded. Feed duration keeps the
  // in-app timeline visible during startup instead of coupling it to AVPlayer's
  // metadata timing.
  const effectiveDuration = resolveAudioDuration(status.duration, feedDuration);

  const state: BriefingPlayer['state'] = preparing
    ? 'preparing'
    : playing
      ? 'playing'
      : hasPlayer || elapsed > 0 || resumable
        ? 'paused'
        : 'idle';

  return {
    state,
    elapsed,
    duration: effectiveDuration,
    date: effectiveDate,
    resumable,
    failureCount,
    available,
    toggle,
    seek,
    dismiss,
  };
}
