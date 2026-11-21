import Storage from 'expo-sqlite/kv-store';
import { ANALYTICS_EVENTS, type InstallKind } from '../constants/analytics';
import { analytics } from './analytics';

/**
 * The events marketer counts once per install, and the one record that
 * remembers each: `First Open` with `install_kind`, `Install Attribution`
 * (`install-attribution.ts`) and `Activated`. The names are a contract
 * (`install-id.ts`).
 *
 * NEW OR EXISTING. Decided once, at the first launch of a build with this
 * code (`openInstallRecord`, from `app/_layout.tsx`): new when the onboarding
 * store was seeded on this launch with no trace of earlier use (its
 * `firstRun`), existing otherwise. An existing install has Install
 * Attribution and Activated spent without either being sent: there is no
 * install to attribute and no first briefing left to count. `First Open`
 * goes out for both, once, with `install_kind` saying which.
 *
 * A flag is written before its event is sent, so a crash between the two
 * loses one event and never sends one twice. A record that cannot be read is
 * no record: nothing is claimed, and the next launch tries again.
 *
 * Kept through an erase of local data, which replaces only `install_id`: an
 * erased install is not a new one, and must not be counted again.
 */

const KEY = 'zuhd_install_v1';

/**
 * ACTIVATION, A PROPOSAL the owner confirms before release: the first finished
 * briefing or the third story read since install, whichever comes first. A
 * step reaching its count activates; set a count to `Infinity` to drop that
 * step, or add one to `ActivationStep` and call `noteActivation` where it
 * happens.
 */
export const ACTIVATION = {
  /** A briefing played to its end (`useBriefingPlayer`). */
  briefing_completed: 1,
  /** A story newly read (`read-store.ts`), counted across visits. */
  story_read: 3,
} as const satisfies Record<string, number>;

export type ActivationStep = keyof typeof ACTIVATION;
type Progress = Record<ActivationStep, number>;

interface InstallRecord {
  version: 1;
  kind: InstallKind;
  firstOpenSent: boolean;
  /** Sent, or settled with nothing to send: an empty referrer, the reads used
   *  up, an existing install, iOS. */
  attributionSettled: boolean;
  /** Referrer reads that failed or timed out (`install-attribution.ts`). */
  referrerFailures: number;
  activatedSent: boolean;
  /** Each step's count toward `ACTIVATION`, until it is sent. */
  progress: Progress;
}

/** `undefined` until read this launch; `null` when there is none, or it could not be read. */
let record: InstallRecord | null | undefined;

function emptyProgress(): Progress {
  return { briefing_completed: 0, story_read: 0 };
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function decode(raw: string): InstallRecord | null {
  try {
    const s = JSON.parse(raw) as Record<string, unknown>;
    if (s.version !== 1 || (s.kind !== 'new' && s.kind !== 'existing')) return null;
    const progress = emptyProgress();
    const stored = (s.progress ?? {}) as Record<string, unknown>;
    for (const step of Object.keys(progress) as ActivationStep[]) {
      if (isCount(stored[step])) progress[step] = stored[step];
    }
    return {
      version: 1,
      kind: s.kind,
      firstOpenSent: s.firstOpenSent !== false,
      // A flag that cannot be read is spent: never a second send.
      attributionSettled: s.attributionSettled !== false,
      referrerFailures: isCount(s.referrerFailures) ? s.referrerFailures : 0,
      activatedSent: s.activatedSent !== false,
      progress,
    };
  } catch {
    return null;
  }
}

function load(): InstallRecord | null {
  if (record !== undefined) return record;
  try {
    const raw = Storage.getItemSync(KEY);
    record = raw === null ? null : decode(raw);
  } catch {
    // Unknown, not absent: left unread, so a later call this launch tries again.
    return null;
  }
  return record;
}

function save(next: InstallRecord): void {
  record = next;
  try {
    Storage.setItemSync(KEY, JSON.stringify(next));
  } catch {
    // Held in memory for this launch. The next may repeat what was lost.
  }
}

/**
 * Make this install's record if it has none, as `kind`. Called once a launch,
 * before anything is claimed; a later launch keeps the record it finds.
 */
export function openInstallRecord(kind: InstallKind): void {
  if (load() !== null) return;
  try {
    // Absent, not unreadable: don't overwrite one the store failed to read.
    if (Storage.getItemSync(KEY) !== null) return;
  } catch {
    return;
  }
  const existing = kind === 'existing';
  save({
    version: 1,
    kind,
    firstOpenSent: false,
    attributionSettled: existing,
    referrerFailures: 0,
    activatedSent: existing,
    progress: emptyProgress(),
  });
}

/** `First Open`, the one time it is due. */
export function trackFirstOpen(): void {
  const current = load();
  if (!current || current.firstOpenSent) return;
  save({ ...current, firstOpenSent: true });
  void analytics.track(ANALYTICS_EVENTS.FIRST_OPEN, { install_kind: current.kind });
}

/** Whether these counts reach the activation moment. */
export function reachesActivation(progress: Readonly<Progress>): boolean {
  return (Object.keys(ACTIVATION) as ActivationStep[]).some(
    (step) => progress[step] >= ACTIVATION[step],
  );
}

/** One step toward activation happened; sends `Activated` the time it arrives. */
export function noteActivation(step: ActivationStep): void {
  const current = load();
  if (!current || current.activatedSent) return;
  const progress = { ...current.progress, [step]: current.progress[step] + 1 };
  const activated = reachesActivation(progress);
  save({ ...current, progress, activatedSent: activated });
  if (activated) void analytics.track(ANALYTICS_EVENTS.ACTIVATED);
}

/** What `install-attribution.ts` needs to know before it reads the referrer. */
export function attributionDue(): boolean {
  const current = load();
  return current !== null && current.kind === 'new' && !current.attributionSettled;
}

/** The attribution is settled: sent now, or nothing to send. False when it was already. */
export function settleAttribution(): boolean {
  const current = load();
  if (!current || current.attributionSettled) return false;
  save({ ...current, attributionSettled: true });
  return true;
}

/** A referrer read failed. Settles once `maxFailures` have; returns the count. */
export function noteReferrerFailure(maxFailures: number): number {
  const current = load();
  if (!current || current.attributionSettled) return 0;
  const referrerFailures = current.referrerFailures + 1;
  save({ ...current, referrerFailures, attributionSettled: referrerFailures >= maxFailures });
  return referrerFailures;
}
