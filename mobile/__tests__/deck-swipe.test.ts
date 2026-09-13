import { deckTarget, projectedTravel, rubberBand } from '../lib/deck-swipe';

describe('projectedTravel', () => {
  it('is nothing at rest and about a third of a second of travel in motion', () => {
    expect(projectedTravel(0)).toBe(0);
    expect(projectedTravel(1)).toBeCloseTo(0.332, 3);
    expect(projectedTravel(-1)).toBeCloseTo(-0.332, 3);
  });
});

describe('deckTarget', () => {
  it('springs back from a short, slow drag', () => {
    expect(deckTarget(3, 3.3, 0, 10)).toBe(3);
  });

  it('turns the card on a slow drag past halfway, with no flick needed', () => {
    expect(deckTarget(3, 3.55, 0, 10)).toBe(4);
  });

  it('turns the card on a short flick', () => {
    // 0.1 of a card at 1.5 cards/s projects to ~0.6.
    expect(deckTarget(3, 3.1, 1.5, 10)).toBe(4);
  });

  it('lets a flick against the drag bring the card back', () => {
    expect(deckTarget(3, 3.45, -1, 10)).toBe(3);
  });

  it('never skips a story, however hard the flick', () => {
    expect(deckTarget(3, 3.4, 40, 10)).toBe(4);
    expect(deckTarget(3, 2.6, -40, 10)).toBe(2);
  });

  it('stops at either end', () => {
    expect(deckTarget(0, -0.3, -5, 10)).toBe(0);
    expect(deckTarget(10, 10.4, 5, 10)).toBe(10);
  });
});

describe('rubberBand', () => {
  it('follows the finger inside the deck', () => {
    expect(rubberBand(0, 10)).toBe(0);
    expect(rubberBand(4.7, 10)).toBe(4.7);
    expect(rubberBand(10, 10)).toBe(10);
  });

  it('gives less the further it is pulled past an end', () => {
    const near = -rubberBand(-0.1, 10);
    const far = -rubberBand(-1, 10);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeLessThan(1);
    // Resistance grows: the second tenth of a card moves it less than the first.
    expect(-rubberBand(-0.2, 10) - near).toBeLessThan(near);
    expect(rubberBand(11, 10) - 10).toBeCloseTo(far);
  });
});
