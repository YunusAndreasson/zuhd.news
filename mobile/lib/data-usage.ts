import { createListeners } from './store-plumbing';

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
 * The briefing's audio is counted too, as its download finishes
 * (`useBriefingPlayer`): it is the one genuinely large download in the app,
 * fetched only on an explicit press, and a figure that left it out would
 * flatter itself by the largest amount there is.
 *
 * Session-scoped by design. A lifetime total would be a usage statistic about
 * the reader, kept on their device, for no purpose either of us needs.
 */

let bytes = 0;
const listeners = createListeners();

/** Every UTF-16 unit past ASCII. */
const PAST_ASCII = /[\u0080-\uffff]/g;

/**
 * Exact UTF-8 length. `String.length` counts UTF-16 units and would undercount
 * every non-Latin headline in the feed.
 *
 * Every unit is at least a byte, so only the ones past ASCII are visited: a
 * payload is almost all ASCII, and a loop over each of its characters cost
 * more than parsing it did.
 */
export function utf8ByteLength(s: string): number {
  let n = s.length;
  const wide = s.match(PAST_ASCII);
  if (!wide) return n;
  for (const unit of wide) {
    const c = unit.charCodeAt(0);
    // Two bytes under U+0800, and each half of a surrogate pair is two of its
    // code point's four; anything else is three.
    n += c < 0x800 || (c >= 0xd800 && c <= 0xdfff) ? 1 : 2;
  }
  return n;
}

export function recordBytes(n: number): void {
  if (!Number.isFinite(n) || n <= 0) return;
  bytes += n;
  listeners.emit();
}

export const subscribe = listeners.subscribe;

export function getSnapshot(): number {
  return bytes;
}

/** Test seam. */
export function resetDataUsage(): void {
  bytes = 0;
  listeners.emit();
}

/** Human-readable, in the app's register: whole numbers, no false precision.
 *  A reader wants to know "is this small?", not the fourth significant digit. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
