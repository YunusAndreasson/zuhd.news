import { CHOKEPOINT_DISRUPTED, moveTone, straitSqueezed } from '../lib/valence';

/**
 * The colour of a move, pinned.
 *
 * Four surfaces used to colour a move separately, and three of them disagreed —
 * a card chip, an entity sheet tinting on magnitude in the globe's gold, and a
 * chokepoint sheet whose disruption threshold was five points off the card's.
 * They read one module now, so the tests that used to belong to each of them
 * belong here.
 */

describe('moveTone', () => {
  it('colours a move by its direction: green up, red down, slate unmoved', () => {
    // Coloured by what a move meant, one ▲ was green, red or slate for a
    // reason the screen never gave (2026-09-25).
    expect(moveTone({ direction: 'up' })).toBe('rise');
    expect(moveTone({ direction: 'down' })).toBe('fall');
    expect(moveTone({ direction: 'flat' })).toBe('neutral');
  });

  it("never colours a contract's points", () => {
    // Green on a likelier war would be the app taking a side.
    expect(moveTone({ direction: 'up', unit: 'points' })).toBe('neutral');
    expect(moveTone({ direction: 'down', unit: 'points' })).toBe('neutral');
  });
});

describe('straitSqueezed', () => {
  it('names the squeeze and not the detour', () => {
    // A strait above its own normal is usually traffic rerouted *to* here,
    // which is the same disruption seen from the other end.
    expect(straitSqueezed(-0.9)).toBe(true);
    expect(straitSqueezed(0.9)).toBe(false);
  });

  it("has one threshold, the web map's, because it used to have three", () => {
    // 10% on the card, 15% in the sheet that card opened, and 15% on the web
    // map, where a strait 12% down was quiet while the app drew it as a pinch.
    expect(CHOKEPOINT_DISRUPTED).toBe(0.15);
    expect(straitSqueezed(-CHOKEPOINT_DISRUPTED)).toBe(true);
    expect(straitSqueezed(-0.2)).toBe(true);
    expect(straitSqueezed(-0.12)).toBe(false);
    expect(straitSqueezed(-0.05)).toBe(false);
  });
});
