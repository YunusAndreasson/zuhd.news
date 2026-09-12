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
  swipe: 8_000,
  sources: 2_000,
  bookmark: 2_000,
  globe: 3_000,
};

// Reading-depth gates (lifetime snap counts): one tip per article read, in
// sequence — sources on the 2nd article, bookmark on the 3rd. Sparser gates
// (3rd/5th/7th) were tried and read as "no tips at all"; a lesson the reader
// performs on their own still retires its hint before it ever arms.
const SOURCES_MIN_SNAPS = 1;
const BOOKMARK_MIN_SNAPS = 2;

/**
 * Where the reader is, because a lesson only makes sense where its gesture
 * does something.
 *
 * The globe lesson used to be the fourth tip, after three articles and three
 * other hints, because the globe was a backdrop behind the reader and there
 * was no reason to point at it before the reader had learned to read. It is
 * the home screen now — and the whole case for the redesign is that nobody
 * discovered it was tappable. Gating that lesson behind three articles would
 * mean a reader who stays on the map, which is the default, is never told.
 * So it is taught on the map, first, and nowhere else; and the reading
 * lessons are taught in the reader, where "swipe up for next" is true.
 */
export type HintSurface = 'map' | 'reader';

interface HintContext {
  screenReader: boolean;
  surface: HintSurface;
}

/** Which surface a lesson belongs to. A pill whose surface the reader has
 *  just left is hidden rather than left pointing at a gesture that no longer
 *  applies. */
export function hintSurface(id: HintId): HintSurface {
  return id === 'globe' ? 'map' : 'reader';
}

function showable(state: OnboardingState, id: HintId): boolean {
  const h = state.hints[id];
  return h.status === 'pending' && h.showCount < MAX_HINT_SHOWS;
}

function resolved(state: OnboardingState, id: HintId): boolean {
  return state.hints[id].status !== 'pending';
}

/** Pure eligibility: the single hint that may arm right now, or null.
 *  One hint on screen at a time, ever — first match in ORDER wins.
 *  The globe hint is withheld from screen-reader users: its target (the
 *  globe's gesture layer) is deliberately hidden from the a11y tree, so the
 *  hint would instruct an action they cannot perform — their path is the
 *  strip, the NOW block and the instruments sheet, which need no hint. */
export function eligibleHint(state: OnboardingState, ctx: HintContext): HintId | null {
  if (ctx.surface === 'map') {
    return showable(state, 'globe') && !ctx.screenReader ? 'globe' : null;
  }
  if (showable(state, 'swipe') && state.snapCount === 0) return 'swipe';
  if (
    showable(state, 'sources') &&
    resolved(state, 'swipe') &&
    state.snapCount >= SOURCES_MIN_SNAPS
  )
    return 'sources';
  if (
    showable(state, 'bookmark') &&
    resolved(state, 'sources') &&
    state.snapCount >= BOOKMARK_MIN_SNAPS
  )
    return 'bookmark';
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

  const eligible =
    ready && !suppressed && !activeHint ? eligibleHint(state, { screenReader, surface }) : null;
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
  const dismissActiveHint = useCallback(() => {
    setPausedAtSnapCount(snapCountRef.current);
    const id = activeHintRef.current;
    if (!id) return;
    dismissHint(id);
    setActiveHint(null);
  }, []);

  return { activeHint, dismissActiveHint };
}
