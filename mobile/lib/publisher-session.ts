import Storage from 'expo-sqlite/kv-store';
import {
  ANALYTICS_EVENTS,
  type PublisherObservation,
  type RegistrationReason,
} from '../constants/analytics';
import { STALE_THRESHOLD } from '../constants/theme';
import { analytics } from './analytics';
import { readStoredJson } from './stored-json';

interface Session {
  started: number;
  lastActive: number;
  away: number | null;
  last: PublisherObservation;
  closed: boolean;
}
const KEY = 'zuhd_publisher_session_v1';
const stored = readStoredJson(
  KEY,
  (s): s is Session | 'erased' =>
    s === 'erased' || (!!s && typeof s === 'object' && 'started' in s && 'last' in s && !!s.last),
);
let erased = stored === 'erased';
let session = stored === 'erased' ? null : stored;
export function erasePublisherSession(): boolean {
  session = null;
  erased = true;
  tracked = false;
  try {
    Storage.setItemSync(KEY, JSON.stringify('erased'));
    return true;
  } catch {
    return false;
  }
}
// A killed foreground process may never have delivered a background callback.
if (session && !session.closed && session.away === null) session.away = session.lastActive;
let observation: PublisherObservation = {
  consent: false,
  briefing: false,
  breaking: false,
  registration: 'removed',
  effective: false,
  observed_at: Date.now(),
};
let tracked = false;
function save() {
  try {
    Storage.setItemSync(KEY, JSON.stringify(session));
  } catch {
    /* Available in memory. */
  }
}

export function closeDue(away: number | null, now: number) {
  return away !== null && now - away >= STALE_THRESHOLD;
}

export function checkpoint(active: boolean, genuine = false, now = Date.now()) {
  if (erased) return;
  if (!session && active && genuine)
    session = { started: now, lastActive: now, away: null, last: observation, closed: false };
  if (!session || session.closed) return;
  if (closeDue(session.away, now)) {
    session.closed = true;
    save();
    void analytics.track(ANALYTICS_EVENTS.FIRST_SESSION_CLOSED, {
      ...session.last,
      closed_at: (session.away ?? now) + STALE_THRESHOLD,
    });
    return;
  } else if (active) {
    session.lastActive = now;
    session.away = null;
  } else if (session.away === null) {
    session.away = now;
    if (tracked) session.last = observation;
  }
  save();
  void analytics.track(ANALYTICS_EVENTS.PUBLISHER_SESSION_CHECKPOINT, {
    ...session.last,
    active,
    away_since: session.away,
    observed_at: now,
  });
}

/** Keep a local foreground checkpoint for an abrupt process death. */
export function noteActive(now = Date.now()) {
  if (!session || session.closed || session.away !== null) return;
  session.lastActive = now;
  save();
}

export function observePublisher(next: PublisherObservation, reason: RegistrationReason) {
  const changed =
    !tracked ||
    next.consent !== observation.consent ||
    next.registration !== observation.registration ||
    next.briefing !== observation.briefing ||
    next.breaking !== observation.breaking ||
    next.effective !== observation.effective;
  if (!changed) return;
  if (!tracked || next.registration !== observation.registration) {
    void analytics.track(ANALYTICS_EVENTS.PUBLISHER_REGISTRATION_VERIFIED, {
      status: next.registration,
      reason,
      observed_at: next.observed_at,
    });
  }
  tracked = true;
  observation = next;
  void analytics.track(ANALYTICS_EVENTS.PUBLISHER_OPT_IN_OBSERVED, next);
  if (session && !session.closed && !closeDue(session.away, next.observed_at)) {
    if (session.away === null) session.lastActive = next.observed_at;
    session.last = next;
    save();
  }
}
