/**
 * Session data meter.
 *
 * The app's central claim is that it barely uses data. A claim the reader can
 * check is worth more than one they have to accept, so the app counts its own
 * bytes and shows the number in settings.
 *
 * Counted at `fetchJson` — the one place every content download passes
 * through (feed, heatmap, chokepoints, GDACS, conflicts, trends). What it
 * measures is the *decoded* payload; the wire transfer is gzipped and
 * therefore smaller, so this over-reports rather than under-reports. That
 * direction is deliberate: a data claim should never flatter itself.
 *
 * Audio is not counted here — briefing mp3s are fetched by the native player,
 * not by `fetchJson`. They are also the one genuinely large download in the
 * app, which is why they only happen on an explicit press (see
 * `useBriefingPlayer`) and why the privacy page names their size directly
 * rather than folding them into this figure.
 *
 * Session-scoped by design. A lifetime total would be a usage statistic about
 * the reader, kept on their device, for no purpose either of us needs.
 */

let bytes = 0;
const listeners = new Set<() => void>();

/** Exact UTF-8 length. `String.length` counts UTF-16 units and would undercount
 *  every non-Latin headline in the feed. */
export function utf8ByteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      // Surrogate pair — one 4-byte code point; skip the low surrogate.
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

export function recordBytes(n: number): void {
  if (!Number.isFinite(n) || n <= 0) return;
  bytes += n;
  for (const l of listeners) l();
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function getSnapshot(): number {
  return bytes;
}

/** Test seam. */
export function resetDataUsage(): void {
  bytes = 0;
  for (const l of listeners) l();
}

/** Human-readable, in the app's register: whole numbers, no false precision.
 *  A reader wants to know "is this small?", not the fourth significant digit. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
