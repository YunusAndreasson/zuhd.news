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
  // Shorter than the article hints. Those wait for a reader to settle into
  // prose; a column index is taken in at a glance and either acted on or
  // swiped past, so a long dwell mostly means the pill arrives after the
  // reader has already gone.
  card: 2_000,
};

// Reading-depth gates (lifetime snap counts): one tip per article read, in
// sequence — sources on the 2nd article, bookmark on the 3rd, globe on the
// 4th. Sparser gates (3rd/5th/7th) were tried and read as "no tips at all";
// a lesson the reader performs on their own still retires its hint before it
// ever arms.
const SOURCES_MIN_SNAPS = 1;
const BOOKMARK_MIN_SNAPS = 2;
const GLOBE_MIN_SNAPS = 3;

/**
 * Which of the app's four surfaces the reader is standing on.
 *
 * It was a boolean — `onCardColumn` — and a boolean could only ever name two
 * of them, so it named the two that mattered least and folded the other two in
 * with whichever was nearer. Its own comment recorded the damage: "an open
 * card is not an index, so the lesson about opening one has nothing to point
 * at — and the four article hints have nothing to point at anywhere in this
 * half of the app." Both halves of that were true and neither was enforced. An
 * open card reported `false`, which is the river's value, so a reader looking
 * at a currency table could be told to swipe up for the next story.
 *
 * `news` opening as an index of headlines added the fourth, and it is the one
 * with nothing to teach at all: tapping a headline is the most over-learned
 * gesture in the medium.
 *
 *   articleRiver   the article pager — swipe, sources, bookmark, globe
 *   cardIndex      an instrument column's index — the one lesson, `card`
 *   newsIndex      the headline list — nothing; a headline explains itself
 *   card           an open card — nothing; every target is one screen back
 */
export type HintSurface = 'articleRiver' | 'cardIndex' | 'newsIndex' | 'card';

export interface HintContext {
  screenReader: boolean;
  surface: HintSurface;
}

/** The lesson each surface owns, or `null` where it has none. One table, so
 *  that adding a surface is a row here rather than a condition in two
 *  functions that then have to be kept agreeing. */
const SURFACE_LESSON: Record<HintSurface, HintId | null> = {
  articleRiver: null, // four of them — see `eligibleHint`
  cardIndex: 'card',
  newsIndex: null,
  card: null,
};

function showable(state: OnboardingState, id: HintId): boolean {
  const h = state.hints[id];
  return h.status === 'pending' && h.showCount < MAX_HINT_SHOWS;
}

/**
 * Whether a hint's target is on the surface the reader is standing on.
 *
 * `card` teaches a row on an instrument column's index; the other four teach
 * the article river — swiping it, opening a story's sources, saving one,
 * tapping the globe under it. Nothing belongs on the news index or on an open
 * card, which is why this returns false for every id on both rather than
 * picking a least-wrong surface for them to borrow.
 *
 * It is a named rule rather than a condition inside `eligibleHint` because two
 * places have to agree about it and only one of them was asking. `eligibleHint`
 * decides what may *arm*; a pill that is already on screen when the reader
 * crosses the axis is not re-armed, it just stays — so gating only the arming
 * left both halves of the bug live. The `swipe` pill would follow a reader onto
 * a currency table and tell them to swipe up for the next story, and the `card`
 * pill would follow them back to the river and point at a line that is not
 * there. A row tap now crosses surfaces too, without touching the axis at all.
 */
export function hintBelongsOn(id: HintId, surface: HintSurface): boolean {
  if (surface === 'articleRiver') return id !== 'card';
  return SURFACE_LESSON[surface] === id;
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
  // An index answers to itself, and it answers first.
  //
  // The four hints below all teach the article river — swiping it, opening a
  // story's sources, saving one, tapping the globe under it — and none of
  // those targets exists on an index of any kind. Gated only on reading depth
  // they were free to fire there, so a reader standing on a table of
  // currencies could be told to swipe up for the next story.
  //
  // So the branch is exclusive in both directions: on an index the only
  // eligible lesson is the one about that index, and off one it is never
  // offered. That also keeps the "one hint on screen at a time, ever" promise
  // intact — `card` is a fifth member of that set, not a parallel channel.
  //
  // The news index and an open card are the two cases with nothing to say —
  // an app does not have to teach a reader that a headline can be tapped, and
  // a card has already been opened by the time it is on screen.
  if (ctx.surface !== 'articleRiver') {
    const lesson = SURFACE_LESSON[ctx.surface];
    return lesson && showable(state, lesson) ? lesson : null;
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
  // flips it to done), something covers its airspace, or the reader walks off
  // the surface it is talking about. 'expired' does NOT hide — that status
  // lands on the final permitted showing and only blocks future sessions.
  //
  // The last of those three is the one that is easy to miss: eligibility is
  // computed only while nothing is showing, so once a pill is up it survives
  // any change that would have stopped it arming. Crossing the section axis is
  // exactly such a change, and it is one horizontal swipe away at all times.
  const activeStatus = activeHint ? state.hints[activeHint].status : null;
  const stranded = activeHint !== null && !hintBelongsOn(activeHint, surface);
  useEffect(() => {
    if (
      activeHint &&
      (suppressed || stranded || activeStatus === 'done' || activeStatus === 'dismissed')
    ) {
      setActiveHint(null);
    }
  }, [activeHint, activeStatus, suppressed, stranded]);

  const eligible =
    ready && !suppressed && !activeHint ? eligibleHint(state, { screenReader, surface }) : null;
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
