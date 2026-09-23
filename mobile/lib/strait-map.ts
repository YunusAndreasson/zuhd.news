import type { CardDelta } from './cards/types';

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

/**
 * A strait's seven-day move as the strip prints it (`gaugeMove`), for the
 * globe's label: the same magnitude and the same colour rule, so the strait
 * reads one number on the screen. No basis: the strip prints none either.
 * `alarm` is the strip's red — a fall big enough to be the disruption.
 */
export function straitWeekChange(delta: CardDelta) {
  const direction = delta.direction;
  const value =
    direction === 'flat' ? '−0%' : `${direction === 'up' ? '↑' : '↓'}${delta.magnitude}`;
  return {
    direction,
    value,
    basis: undefined,
    alarm: delta.valence === 'unfavorable',
    label: `${value} over 7 days`,
  } as const;
}
