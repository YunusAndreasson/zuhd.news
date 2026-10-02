import { CHOKEPOINT_DISRUPTED } from '@shared/chokepoint-thresholds';
import { markMove } from './cards/format';
import type { CardDelta } from './cards/types';
import { straitSqueezed } from './valence';

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
 * globe's label: the same magnitude, so the strait reads one number on the
 * screen. No basis: the strip prints none either.
 */
export function straitWeekChange(delta: CardDelta) {
  const value = markMove(delta);
  return {
    direction: delta.direction,
    value,
    basis: undefined,
    label: `${value} over 7 days`,
  } as const;
}

/**
 * The number a strait prints: the strip's seven-day move where the strip has
 * one (`week`, from `straitMoves`), else the gap from its 90-day normal.
 * The globe's label and the chooser's row both ask here, so the row under a
 * finger reads what the mark under it does.
 */
export function straitChange(week: CardDelta | undefined, normal: number | undefined) {
  return week ? straitWeekChange(week) : straitMapChange(normal);
}

/** What a strait's glyph says about its traffic against the 90-day normal. */
export type StraitState = 'rest' | 'pinch' | 'surge';

/**
 * A strait's state from its seven-day traffic against its 90-day normal, as
 * the globe draws it: pinched when the fall is the disruption
 * (`straitSqueezed`), bowed open past the same bar the other way. One rule
 * for the globe's mark, the map key and the chooser's row, so the row under a
 * finger is the shape the finger was on.
 */
export function straitStateFor(deltaVs90: number): StraitState {
  if (straitSqueezed(deltaVs90)) return 'pinch';
  return deltaVs90 > CHOKEPOINT_DISRUPTED ? 'surge' : 'rest';
}

/** The glyph box the globe's pictograms are authored in (`disaster-glyphs.ts`). */
const GLYPH_BOX = 22;
/** The web authors its alphabet on a 16-unit box (`public/islands/_map/glyphs.ts`). */
const WEB_BOX = 16;

/**
 * How far each coastline of a strait's glyph bows out past its ends, in glyph
 * units: the web's `strait(bulge)` — 4.0 at rest, 1.4 pinched, 6.4 surging —
 * scaled from its 16-unit box. The bulge is the data. A pinch pulls the two
 * coastlines in until the channel is two near-straight shores, a surge bows
 * them open, so which way traffic moved survives greyscale and a colour-blind
 * reader; the app drew the rest shape in all three states until 2026-09-25 and
 * said it in gold against teal alone.
 */
export const STRAIT_BULGE: Readonly<Record<StraitState, number>> = {
  rest: (4.0 * GLYPH_BOX) / WEB_BOX,
  pinch: (1.4 * GLYPH_BOX) / WEB_BOX,
  surge: (6.4 * GLYPH_BOX) / WEB_BOX,
};

/** Each coastline's ends sit this far either side of the glyph's centre. */
export const STRAIT_END_DX = 3;

/**
 * How far right of its centre a strait's glyph reaches, stroke included. A
 * cubic whose two control points share an x reaches three quarters of the way
 * to them.
 */
export function straitReach(state: StraitState, stroke: number): number {
  return STRAIT_END_DX + 0.75 * STRAIT_BULGE[state] + stroke / 2;
}

/** The traffic sign beside a strait: a backed disc this wide in radius. */
export const STRAIT_SIGN_R = 6;
const STRAIT_SIGN_GAP = 1.5;

/**
 * Where the traffic sign's centre sits right of the strait's. It was a fixed
 * 12, and its backing disc covered the right-hand coastline — at rest the arc
 * reaches 7.6 and the disc began at 6, so the glyph read as `(·` with a sign
 * stamped over its other shore. It follows the shape now, which a surge
 * widens.
 */
export function straitSignDx(state: StraitState, stroke: number): number {
  return straitReach(state, stroke) + STRAIT_SIGN_GAP + STRAIT_SIGN_R;
}
