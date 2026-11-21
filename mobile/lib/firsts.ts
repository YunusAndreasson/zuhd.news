import Storage from 'expo-sqlite/kv-store';

/**
 * Whether this install has done a thing before: the `first_time` of
 * Briefing Started and Stories Read (`constants/analytics.ts`).
 *
 * The record starts at a new install's first open (`startFirsts`). An install
 * that predates it has none, and nothing it does is a first: its reader has
 * long since read a story and, likely, played a briefing. An erase removes it
 * with the rest (`wipe.ts`), and then nothing is a first either, as nothing is
 * a First Open.
 */

type First = 'briefing' | 'read';

const KEY = 'zuhd_firsts_v1';

/** `undefined` until read; `null` when this install keeps no record. */
let firsts: Set<First> | null | undefined;

function isFirst(v: unknown): v is First {
  return v === 'briefing' || v === 'read';
}

function load(): Set<First> | null {
  if (firsts !== undefined) return firsts;
  try {
    const raw = Storage.getItemSync(KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    firsts = Array.isArray(parsed) ? new Set(parsed.filter(isFirst)) : null;
  } catch {
    firsts = null;
  }
  return firsts;
}

function save(set: Set<First>): void {
  try {
    Storage.setItemSync(KEY, JSON.stringify([...set]));
  } catch {
    // A lost write only means a later event says first again.
  }
}

/** A new install's first open: from now on, its firsts count. */
export function startFirsts(): void {
  firsts = new Set();
  save(firsts);
}

/** True the first time `what` happens on an install with a record; records it. */
export function claimFirst(what: First): boolean {
  const set = load();
  if (!set || set.has(what)) return false;
  set.add(what);
  save(set);
  return true;
}

/** For an erase, which removes the key itself (`wipe.ts`). */
export function clearFirsts(): void {
  firsts = null;
}
