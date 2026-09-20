/** Seven-day mean traffic compared with the strait's 90-day baseline. */
export function straitMapChange(delta: number | undefined) {
  if (delta === undefined || !Number.isFinite(delta)) return null;
  const pct = Math.round(delta * 100);
  const direction = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return {
    direction,
    label: `${direction === 'up' ? '↑' : direction === 'down' ? '↓' : '−'}${Math.abs(pct)}% vs 90d`,
  } as const;
}
