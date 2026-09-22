/**
 * Seven-day mean traffic compared with the strait's 90-day baseline.
 *
 * `value` and `basis` are the globe's second line, set in two sizes — the
 * move large, the comparison it is against small — under the strait's name.
 * `label` is the same words on one line, for a list row.
 */
export function straitMapChange(delta: number | undefined) {
  if (delta === undefined || !Number.isFinite(delta)) return null;
  const pct = Math.round(delta * 100);
  const direction = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const value = `${direction === 'up' ? '↑' : direction === 'down' ? '↓' : '−'}${Math.abs(pct)}%`;
  const basis = 'vs 90d';
  return { direction, value, basis, label: `${value} ${basis}` } as const;
}
