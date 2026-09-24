import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  dismissHint,
  getSnapshot,
  type HintId,
  MAX_HINT_SHOWS,
  type OnboardingState,
  recordHintShown,
  subscribe,
} from '../lib/onboarding-store';

// Dwell before a hint appears — the reader must have settled; a hint that
// chases a moving screen is noise. The swipe dwell is the longest: give the
// first article time to be read before the app says anything at all.
const DWELL_MS: Record<HintId, number> = {
  swipe: 4_000,
  sources: 2_000,
  bookmark: 2_000,
  globe: 3_000,
  masthead: 3_000,
};

/**
 * **A hint leaves on its own** (2026-09-24). It used to stay until its gesture
 * was performed, it was tapped, or a card was swiped — so a reader who
 * scrubbed the track or only read had `tap a light on the globe` over the
 * lower globe for minutes, covering the place names there. After this long
 * on screen it goes for the rest of the session, without counting as
 * dismissed: a later launch can still teach it, up to `MAX_HINT_SHOWS`.
 */
const HINT_VISIBLE_MS = 8_000;

/**
 * Where the reader is, because a lesson only makes sense where its gesture
 * does something.
 *
 * There is one surface now. Stories are read on the map, in the sheet's card,
 * so both lessons are taught there: the sideways swipe first, because it is
 * how the news is browsed, and then the globe, because nobody discovers that
 * the lights are tappable. `sources` and `bookmark` are never taught any more
 * — the grown card prints them as words, and a visible control does not need
 * a hint pill explaining it. Their ids stay in the store so old state loads.
 */
export type HintSurface = 'map';

interface HintContext {
  screenReader: boolean;
  surface: HintSurface;
}

/** Which surface a lesson belongs to. A pill whose surface the reader has
 *  just left is hidden rather than left pointing at a gesture that no longer
 *  applies. */
export function hintSurface(_id: HintId): HintSurface {
  return 'map';
}

function showable(state: OnboardingState, id: HintId): boolean {
  const h = state.hints[id];
  return h.status === 'pending' && h.showCount < MAX_HINT_SHOWS;
}

/** Pure eligibility: the single hint that may arm right now, or null.
 *  One hint on screen at a time, ever — first match in order wins.
 *  Both lessons are withheld from screen-reader users: the globe's gesture
 *  layer is hidden from the a11y tree, and the card's swipe has named
 *  accessibility actions (`next story`, `previous story`) that a screen reader
 *  already announces — a pill describing a finger gesture would be noise. */
export function eligibleHint(
  state: OnboardingState,
  ctx: HintContext,
  /** Lessons that already timed out this session (`HINT_VISIBLE_MS`). */
  rested: ReadonlySet<HintId> = new Set(),
): HintId | null {
  if (ctx.screenReader) return null;
  const ok = (id: HintId) => showable(state, id) && !rested.has(id);
  if (ok('swipe') && state.snapCount === 0) return 'swipe';
  if (ok('globe')) return 'globe';
  // The briefing's ▶ is an icon with no words, because a word would take the
  // gauges' room on a small phone. It is taught once, after the gestures
  // nobody can see.
  if (ok('masthead')) return 'masthead';
  return null;
}

/** Decides which single onboarding hint pill is visible. `ready` gates until
 *  the feed + globe have painted; `suppressed` hides hints while any sheet or
 *  the briefing player owns the pill's airspace; `surface` says whether the
 *  reader is looking at the map or reading. */
export function useOnboardingHints(opts: {
  ready: boolean;
  suppressed: boolean;
  surface: HintSurface;
}): {
  activeHint: HintId | null;
  dismissActiveHint: () => void;
} {
  const { ready, suppressed, surface } = opts;
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const [screenReader, setScreenReader] = useState(false);
  const [activeHint, setActiveHint] = useState<HintId | null>(null);
  // Remember a notification launch even after the routing hook clears the
  // response; it is not a first-encounter moment for the swipe lesson.
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  const launchedViaPushRef = useRef(false);
  if (lastNotificationResponse) launchedViaPushRef.current = true;

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled()
      .then(setScreenReader)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => sub.remove();
  }, []);

  // Hide the pill the moment its lesson is performed elsewhere (the store
  // flips it to done) or something covers its airspace. 'expired' does NOT
  // hide — that status lands on the final permitted showing and only blocks
  // future sessions.
  const activeStatus = activeHint ? state.hints[activeHint].status : null;
  const offSurface = activeHint !== null && hintSurface(activeHint) !== surface;
  useEffect(() => {
    if (
      activeHint &&
      (suppressed || offSurface || activeStatus === 'done' || activeStatus === 'dismissed')
    ) {
      setActiveHint(null);
    }
  }, [activeHint, activeStatus, offSurface, suppressed]);

  // Lessons that timed out on screen this session; never persisted.
  const [rested, setRested] = useState<ReadonlySet<HintId>>(() => new Set());

  const eligible =
    ready && !suppressed && !activeHint
      ? eligibleHint(state, { screenReader, surface }, rested)
      : null;
  const armId = eligible === 'swipe' && launchedViaPushRef.current ? null : eligible;

  // Arm after the dwell. `snapCount` in the deps restarts the countdown on
  // every snap so the pill lands after the reader settles, never mid-rhythm;
  // suppression flips `armId` to null and the cleanup cancels the timer.
  const snapCount = state.snapCount;
  // Dismissing (or beginning to scroll beneath) one lesson must not let the
  // next lesson replace it two seconds later on the same page. A real page
  // turn increments snapCount and naturally re-enables the teaching cadence.
  const [pausedAtSnapCount, setPausedAtSnapCount] = useState<number | null>(null);
  const hintsPaused = pausedAtSnapCount === snapCount;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `snapCount` is the intentional dwell-restart signal — each snap re-arms the countdown
  useEffect(() => {
    if (!armId || hintsPaused) return;
    const timer = setTimeout(() => {
      recordHintShown(armId);
      setActiveHint(armId);
    }, DWELL_MS[armId]);
    return () => clearTimeout(timer);
  }, [armId, hintsPaused, snapCount]);

  const activeHintRef = useRef(activeHint);
  activeHintRef.current = activeHint;
  const snapCountRef = useRef(snapCount);
  snapCountRef.current = snapCount;
  const armIdRef = useRef(armId);
  armIdRef.current = armId;

  // Timed out: gone for the session, and the next lesson waits for a swipe,
  // as it does after a dismissal, rather than taking the pill's place 3 s on.
  useEffect(() => {
    if (!activeHint) return;
    const timer = setTimeout(() => {
      setRested((prev) => new Set(prev).add(activeHint));
      setPausedAtSnapCount(snapCountRef.current);
      setActiveHint(null);
    }, HINT_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [activeHint]);
  const dismissActiveHint = useCallback(() => {
    const id = activeHintRef.current;
    // Pause only when there is a lesson to pause: one on screen or one
    // counting down. This runs at the start of every swipe, and the snap
    // count moves on every landing, so an unconditional pause was a new
    // state value — a whole-screen re-render (~47 ms in a dev build) — on
    // every swipe of a reader who finished the lessons long ago.
    if (!id && !armIdRef.current) return;
    setPausedAtSnapCount(snapCountRef.current);
    if (!id) return;
    dismissHint(id);
    setActiveHint(null);
  }, []);

  return { activeHint, dismissActiveHint };
}
