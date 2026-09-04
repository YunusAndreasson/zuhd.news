import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { getPreferences } from './storage';

// ---------------------------------------------------------------------------
// First-run onboarding state: the one-at-a-time hint pills (contextual
// teaching on real articles) and the notification primer. One file-backed
// store (same pattern as bookmark-store: sync load at import, module-level
// actions callable from hot paths, useSyncExternalStore interface, debounced
// persist).
// ---------------------------------------------------------------------------

export type HintId = 'swipe' | 'sources' | 'bookmark' | 'globe';
/** `expired` = shown in MAX_HINT_SHOWS sessions without being acted on — the
 *  reader has voted; silence over nagging. */
type HintStatus = 'pending' | 'done' | 'dismissed' | 'expired';
/** `legacy` = the pre-onboarding build already fired the once-ever OS dialog.
 *  `never` = OS reports denied with canAskAgain=false — a primer whose Enable
 *  button can't produce the OS dialog would be a lie. */
export type PrimerStatus = 'pending' | 'accepted' | 'declined' | 'legacy' | 'never';

interface HintEntry {
  status: HintStatus;
  showCount: number;
}

export interface OnboardingState {
  version: 1;
  seededAt: number;
  hints: Record<HintId, HintEntry>;
  /** Capped reading depth used only to sequence contextual hints. */
  snapCount: number;
  primer: { status: PrimerStatus; decidedAt: number };
}

export const HINT_IDS: readonly HintId[] = ['swipe', 'sources', 'bookmark', 'globe'];
/** A hint shown in this many separate sessions without being acted on expires. */
export const MAX_HINT_SHOWS = 3;
/** No onboarding rule distinguishes reading depth beyond the fourth article. */
export const ONBOARDING_SNAP_CAP = 3;

// Written by the pre-onboarding cold prompt in _layout.tsx; read at seed as
// the "this device already spent the OS dialog" signal, and re-written when
// the primer fires the dialog so an OTA rollback to the old code never
// cold-prompts. Never deleted.
const NOTIF_ASKED_KEY = 'zuhd_notif_asked';

const ONBOARDING_FILE = new File(Paths.document, 'zuhd-onboarding.json');
const ONBOARDING_KEY = 'zuhd_onboarding';

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

function seedHints(status: HintStatus): Record<HintId, HintEntry> {
  return {
    swipe: { status, showCount: 0 },
    sources: { status, showCount: 0 },
    bookmark: { status, showCount: 0 },
    globe: { status, showCount: 0 },
  };
}

function seed(existingUser: boolean): OnboardingState {
  return {
    version: 1,
    seededAt: Date.now(),
    hints: seedHints(existingUser ? 'dismissed' : 'pending'),
    snapCount: 0,
    primer: { status: 'pending', decidedAt: 0 },
  };
}

/** An existing install updating via OTA must see no onboarding. `zuhd-last-seen`
 *  is written on every background transition, so any prior real use leaves it;
 *  bookmarks are a second, independent trace. */
function isExistingUser(): boolean {
  try {
    return (
      new File(Paths.document, 'zuhd-last-seen').exists ||
      new File(Paths.document, 'zuhd-bookmarks.json').exists ||
      Storage.getItemSync('zuhd_last_seen') !== null ||
      Storage.getItemSync('zuhd_bookmarks') !== null
    );
  } catch {
    return false;
  }
}

const HINT_STATUSES: readonly string[] = ['pending', 'done', 'dismissed', 'expired'];
const PRIMER_STATUSES: readonly string[] = ['pending', 'accepted', 'declined', 'legacy', 'never'];

function isOnboardingState(v: unknown): v is OnboardingState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  if (s.version !== 1) return false;
  if (typeof s.snapCount !== 'number') return false;
  const primer = s.primer as Record<string, unknown> | undefined;
  if (!primer || !PRIMER_STATUSES.includes(primer.status as string)) return false;
  const hints = s.hints as Record<string, unknown> | undefined;
  if (!hints) return false;
  return HINT_IDS.every((id) => {
    const h = hints[id] as Record<string, unknown> | undefined;
    return !!h && HINT_STATUSES.includes(h.status as string) && typeof h.showCount === 'number';
  });
}

let state: OnboardingState;
let justSeeded = false;

// Sync load at import so first render decides welcome visibility with no
// flash. Corrupt/missing file → reseed via the existing-user check
// (fail-quiet: worst case an existing user sees zero hints).
try {
  const stored = Storage.getItemSync(ONBOARDING_KEY);
  const text = stored ?? (ONBOARDING_FILE.exists ? ONBOARDING_FILE.textSync() : null);
  if (text) {
    const parsed: unknown = JSON.parse(text);
    if (isOnboardingState(parsed)) {
      state = parsed;
      if (stored === null) Storage.setItemSync(ONBOARDING_KEY, text);
    } else {
      state = seed(isExistingUser());
      justSeeded = true;
    }
  } else {
    state = seed(isExistingUser());
    justSeeded = true;
  }
} catch {
  state = seed(isExistingUser());
  justSeeded = true;
}

// ---------------------------------------------------------------------------
// Persistence + subscription plumbing
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  try {
    Storage.setItemSync(ONBOARDING_KEY, JSON.stringify(state));
  } catch {}
}

function persistDebounced() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 100);
}

/** Flush any pending write — call from app-background transitions. */
export function flushOnboarding(): void {
  if (persistTimer) persistNow();
}

function commit(next: OnboardingState) {
  state = next;
  emit();
  persistDebounced();
}

// ---------------------------------------------------------------------------
// Legacy primer migration — runs once, only when the store was just seeded.
// Resolves the primer for devices that answered the pre-onboarding cold
// prompt, already granted permission, or can never be prompted again.
// ---------------------------------------------------------------------------

async function resolveLegacyPrimer(): Promise<void> {
  try {
    const [asked, prefs, perms] = await Promise.all([
      SecureStore.getItemAsync(NOTIF_ASKED_KEY).catch(() => null),
      getPreferences(),
      Notifications.getPermissionsAsync().catch(() => null),
    ]);
    if (state.primer.status !== 'pending') return;
    let resolved: PrimerStatus | null = null;
    if (prefs.notifications || perms?.granted) resolved = 'accepted';
    else if (perms && perms.canAskAgain === false) resolved = 'never';
    else if (asked) resolved = 'legacy';
    if (resolved) {
      commit({ ...state, primer: { status: resolved, decidedAt: Date.now() } });
    }
  } catch {}
}

if (justSeeded) {
  persistDebounced();
  resolveLegacyPrimer();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

// Increment-once-per-session guard so a hint re-shown after sheet suppression
// doesn't burn a second lifetime showing.
const shownThisSession = new Set<HintId>();

function setHint(id: HintId, status: HintStatus) {
  if (state.hints[id].status === status) return;
  commit({
    ...state,
    hints: { ...state.hints, [id]: { ...state.hints[id], status } },
  });
}

/** Call on every settled vertical article snap. The first-ever snap is the
 *  swipe lesson performed. */
export function recordArticleSnap(): void {
  // Once every depth-gated lesson is eligible, further article navigation is
  // not onboarding state. Avoid rerendering subscribers and scheduling a
  // persistence write on every snap for the rest of the app's lifetime.
  if (state.snapCount >= ONBOARDING_SNAP_CAP) return;
  const first = state.snapCount === 0;
  let next: OnboardingState = {
    ...state,
    snapCount: Math.min(ONBOARDING_SNAP_CAP, state.snapCount + 1),
  };
  if (first) {
    next = {
      ...next,
      hints: { ...next.hints, swipe: { ...next.hints.swipe, status: 'done' } },
    };
  }
  commit(next);
}

/** The taught action was performed — retire the hint forever. */
export function markHintDone(id: HintId): void {
  setHint(id, 'done');
}

/** The reader tapped the pill away — never show it again. */
export function dismissHint(id: HintId): void {
  setHint(id, 'dismissed');
}

/** Count a lifetime showing (once per session); the MAX_HINT_SHOWS-th showing
 *  expires the hint so it never returns in a later session. */
export function recordHintShown(id: HintId): void {
  if (shownThisSession.has(id)) return;
  shownThisSession.add(id);
  const entry = state.hints[id];
  const showCount = entry.showCount + 1;
  commit({
    ...state,
    hints: {
      ...state.hints,
      [id]: { showCount, status: showCount >= MAX_HINT_SHOWS ? 'expired' : entry.status },
    },
  });
}

export function setPrimerStatus(status: PrimerStatus): void {
  commit({ ...state, primer: { status, decidedAt: Date.now() } });
}

/** Record that the once-ever OS dialog is being spent — insurance so an OTA
 *  rollback to the old cold-prompt code never fires a second ask. */
export async function markOsPromptSpent(): Promise<void> {
  await SecureStore.setItemAsync(NOTIF_ASKED_KEY, '1').catch(() => {});
}

// ---------------------------------------------------------------------------
// useSyncExternalStore interface
// ---------------------------------------------------------------------------

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getSnapshot(): OnboardingState {
  return state;
}

// ---------------------------------------------------------------------------
// Reset — settings action ("show tips again") and onboarding QA.
// ---------------------------------------------------------------------------

/** Replay the onboarding tips from scratch: hints re-arm, reading depth
 *  restarts. The primer/notification state is deliberately untouched — the
 *  notifications toggle in settings is the durable control, and re-arming
 *  the primer would be a second ask the reader never requested. */
export function resetOnboarding(): void {
  shownThisSession.clear();
  commit({
    ...state,
    hints: seedHints('pending'),
    snapCount: 0,
  });
  persistNow();
}
