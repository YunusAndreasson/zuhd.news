// Dependency-free time math. No React Native, native modules, or d3 — safe to
// import from anywhere (including the perf-sensitive globe import graph) and to
// test in jsdom. Single home for the day-in-ms literal that was previously
// spelled five different ways across the data layer.

/** Milliseconds in one day. */
export const DAY_MS = 86_400_000;

/**
 * Whole-and-fractional days elapsed since a parseable ISO timestamp. Returns 0
 * for unparseable input or future dates so borderline data still renders at
 * full opacity. Shared by GDACS alert and UCDP conflict age-fade math.
 */
export function ageDaysFromIso(iso: string, now: number = Date.now()): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (now - t) / DAY_MS);
}
