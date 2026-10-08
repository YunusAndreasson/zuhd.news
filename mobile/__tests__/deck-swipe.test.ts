import {
  deckTarget,
  projectedTravel,
  rubberBand,
  sheetStop,
  swipeBackCommits,
} from '../lib/deck-swipe';

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

describe('sheetStop', () => {
  // 0 is open, 300 is peek: about what a tall phone's sheet travels.
  const travel = 300;

  it('takes the nearer stop when the sheet is let go at rest', () => {
    expect(sheetStop(100, 0, travel)).toBe(0);
    expect(sheetStop(200, 0, travel)).toBe(travel);
  });

  it('opens on a lazy drag that is still rising, short of halfway', () => {
    // 40% up and 400 pt/s: under the old 550 pt/s bar this fell back shut.
    expect(sheetStop(180, -400, travel)).toBe(0);
  });

  it('is thrown open from rest, and thrown shut from open', () => {
    expect(sheetStop(travel, -550, travel)).toBe(0);
    expect(sheetStop(0, 550, travel)).toBe(travel);
  });

  it('stays where it is under a nudge', () => {
    expect(sheetStop(travel, -300, travel)).toBe(travel);
    expect(sheetStop(0, 300, travel)).toBe(0);
  });

  it('lets a flick against the drag put the sheet back', () => {
    expect(sheetStop(60, 400, travel)).toBe(travel);
    expect(sheetStop(240, -400, travel)).toBe(0);
  });
});

describe('swipeBackCommits', () => {
  it('goes back on a deliberate drag, or a flick from a short one', () => {
    expect(swipeBackCommits(90, 0, 80)).toBe(true);
    expect(swipeBackCommits(20, 600, 80)).toBe(true);
  });

  it('stays on a short slow drag, and on any drag let go coming home', () => {
    expect(swipeBackCommits(40, 100, 80)).toBe(false);
    expect(swipeBackCommits(200, -700, 80)).toBe(false);
  });
});
