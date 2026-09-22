/**
 * Past this many, a segment would be no wider than the gap beside it, so the
 * gaps go. A track that colours its segments keeps them, touching: a day runs
 * to ~65 stories, and a plain continuous bar there dropped every story's hue
 * and every read one's hairline on most days.
 */
export const MAX_SEGMENTS = 60;

/**
 * How a track of `count` items is drawn: one bar, or a cell per item, with or
 * without gaps. Cells go continuous past `MAX_SEGMENTS` only when nothing
 * differs between them.
 */
export function segmentLayout(
  count: number | undefined,
  perSegment: boolean,
): { cells: boolean; gapped: boolean } {
  if (!count || count <= 1) return { cells: false, gapped: false };
  if (count <= MAX_SEGMENTS) return { cells: true, gapped: true };
  return { cells: perSegment, gapped: false };
}
