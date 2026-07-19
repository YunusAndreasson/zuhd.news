import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as Notifications from 'expo-notifications';
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
// sequence — sources on the 2nd article, bookmark on the 3rd, globe on the
// 4th. Sparser gates (3rd/5th/7th) were tried and read as "no tips at all";
// a lesson the reader performs on their own still retires its hint before it
// ever arms.
const SOURCES_MIN_SNAPS = 1;
const BOOKMARK_MIN_SNAPS = 2;
const GLOBE_MIN_SNAPS = 3;

export interface HintContext {
  screenReader: boolean;
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
 *  The globe hint is withheld from screen-reader users: its target
 *  (GlobeTapZone) is deliberately hidden from the a11y tree, so the hint
 *  would instruct an action they cannot perform — their path is the inline
 *  country links, which need no hint. */
export function eligibleHint(state: OnboardingState, ctx: HintContext): HintId | null {
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
  if (
    showable(state, 'globe') &&
    resolved(state, 'bookmark') &&
    state.snapCount >= GLOBE_MIN_SNAPS &&
    !ctx.screenReader
  )
    return 'globe';
  return null;
}

/** Decides which single onboarding hint pill is visible. `ready` gates until
 *  the feed + globe have painted; `suppressed` hides hints while any sheet or
 *  the briefing player owns the pill's airspace. */
export function useOnboardingHints(opts: { ready: boolean; suppressed: boolean }): {
  activeHint: HintId | null;
  dismissActiveHint: () => void;
} {
  const { ready, suppressed } = opts;
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
  useEffect(() => {
    if (activeHint && (suppressed || activeStatus === 'done' || activeStatus === 'dismissed')) {
      setActiveHint(null);
    }
  }, [activeHint, activeStatus, suppressed]);

  const eligible =
    ready && !suppressed && !activeHint ? eligibleHint(state, { screenReader }) : null;
  const armId = eligible === 'swipe' && launchedViaPushRef.current ? null : eligible;

  // Arm after the dwell. `snapCount` in the deps restarts the countdown on
  // every snap so the pill lands after the reader settles, never mid-rhythm;
  // suppression flips `armId` to null and the cleanup cancels the timer.
  const snapCount = state.snapCount;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `snapCount` is the intentional dwell-restart signal — each snap re-arms the countdown
  useEffect(() => {
    if (!armId) return;
    const timer = setTimeout(() => {
      recordHintShown(armId);
      setActiveHint(armId);
    }, DWELL_MS[armId]);
    return () => clearTimeout(timer);
  }, [armId, snapCount]);

  const activeHintRef = useRef(activeHint);
  activeHintRef.current = activeHint;
  const dismissActiveHint = useCallback(() => {
    const id = activeHintRef.current;
    if (!id) return;
    dismissHint(id);
    setActiveHint(null);
  }, []);

  return { activeHint, dismissActiveHint };
}
