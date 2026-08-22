import {
  CHOKEPOINT_DISRUPTED,
  chokepointValence,
  riseMeansFor,
  valenceOf,
  valenceOfChange,
} from '../lib/valence';

/**
 * The colour rule, pinned.
 *
 * Four surfaces used to answer "which way did this move and what does that do
 * to you" separately, and three of them disagreed — a card chip, an entity
 * sheet tinting on magnitude in the globe's gold, and a chokepoint sheet whose
 * disruption threshold was five points off the card's. They read one function
 * now, so the tests that used to belong to each of them belong here.
 */
describe('valenceOf', () => {
  it('applies the valence to the direction, not to the number', () => {
    // The one that already bit: for something whose rise hurts, a *fall* is
    // the favorable direction.
    expect(valenceOf('up', 'unfavorable')).toBe('unfavorable');
    expect(valenceOf('down', 'unfavorable')).toBe('favorable');
    expect(valenceOf('up', 'favorable')).toBe('favorable');
    expect(valenceOf('down', 'favorable')).toBe('unfavorable');
  });

  it('colours "no claim" rather than withholding colour', () => {
    // Slate is a statement. An absent valence was a gap, and a gap in a
    // channel that is present everywhere else reads as a fourth state.
    expect(valenceOf('up', null)).toBe('neutral');
    expect(valenceOf('down', null)).toBe('neutral');
  });

  it('gives a flat move a colour even though it has no direction', () => {
    expect(valenceOf('flat', 'unfavorable')).toBe('neutral');
    expect(valenceOf('flat', null)).toBe('neutral');
  });
});

describe('valenceOfChange', () => {
  it('reads the sign as the direction', () => {
    expect(valenceOfChange(4.2, 'unfavorable')).toBe('unfavorable');
    expect(valenceOfChange(-4.2, 'unfavorable')).toBe('favorable');
  });

  it('treats zero and a non-number as nothing to claim', () => {
    expect(valenceOfChange(0, 'unfavorable')).toBe('neutral');
    expect(valenceOfChange(Number.NaN, 'unfavorable')).toBe('neutral');
  });
});

describe('riseMeansFor', () => {
  it('answers for the published series, so a card and its sheet agree', () => {
    // The three the app will speak for. Each reaches an ordinary life in one
    // sentence, which is the test for being in the table at all.
    expect(riseMeansFor({ id: 'brent' })).toBe('unfavorable');
    expect(riseMeansFor({ id: 'us-10y' })).toBe('unfavorable');
    expect(riseMeansFor({ id: 'vix' })).toBe('unfavorable');
  });

  it('reads an exchange rate as the currency weakening', () => {
    // `oer` publishes rates — local currency per dollar — so the series rising
    // is the currency falling. A card that quotes the currency instead has
    // inverted the quantity and inverts this with it.
    expect(riseMeansFor({ id: 'fx-rub', source: 'oer' })).toBe('unfavorable');
  });

  it('declines to speak for anything else', () => {
    // Absence is the common case and it is the point: two of these are ratios,
    // where neither direction is anyone's good news, and the rest are things
    // the app has no business tinting.
    for (const id of ['btc', 'eth', 'staples', 'metals', 'nisab', 'attention']) {
      expect(riseMeansFor({ id })).toBeNull();
    }
  });
});

describe('chokepointValence', () => {
  it('colours the squeeze and not the detour', () => {
    // A strait above its own normal is usually traffic rerouted *to* here,
    // which is the same disruption seen from the other end.
    expect(chokepointValence(-0.9)).toBe('unfavorable');
    expect(chokepointValence(0.9)).toBe('neutral');
  });

  it('has one threshold, because it used to have two', () => {
    // 10% on the card, 15% in the sheet that card opened, and nothing in
    // either file said the other existed.
    expect(CHOKEPOINT_DISRUPTED).toBe(0.1);
    expect(chokepointValence(-CHOKEPOINT_DISRUPTED)).toBe('unfavorable');
    expect(chokepointValence(-0.12)).toBe('unfavorable');
    expect(chokepointValence(-0.05)).toBe('neutral');
  });
});
