import { axisDecimals, formatBlockNumber } from '../components/blocks/shared';

/**
 * The number grammar every chart axis is written in.
 *
 * Two bugs came out of this one function inside a single sweep of the app, and
 * both were the kind that reads as plausible rather than broken — which is why
 * they survived: an Ethereum axis printed `2515.0$` on a card whose own
 * reading, a hundred points above it, said `$2,418`, and a gold axis printed
 * `78317.8` directly above `62,802` on the same pair of labels.
 */
/** U+2060 WORD JOINER — zero-width, and what keeps a unit from breaking. */
const WJ = '\u2060';

/** The label as a reader hears it, with the invisible joiners taken out. */
const plain = (s: string) => s.replace(/\u2060/g, '');

describe('formatBlockNumber', () => {
  it('puts a currency symbol in front of the number, not behind it', () => {
    // The old rule was "a one-character unit hugs the number", which is right
    // for per cent and wrong for every currency on earth.
    expect(formatBlockNumber(2515.04, '$')).toBe('$2,515');
    expect(formatBlockNumber(78317.8, '$')).toBe('$78,317.8');
    expect(formatBlockNumber(1200, '€')).toBe('€1,200');
  });

  it('still hugs per cent, which is the unit that does belong behind', () => {
    expect(formatBlockNumber(75, '%')).toBe('75%');
    expect(formatBlockNumber(4.8, '%')).toBe('4.8%');
  });

  it('spaces a compound unit rather than jamming it against the digits', () => {
    expect(plain(formatBlockNumber(4599.4, '$/oz'))).toBe('4,599.4 $/oz');
    expect(plain(formatBlockNumber(22.2, 'index'))).toBe('22.2 index');
    expect(plain(formatBlockNumber(95, 'km/h'))).toBe('95 km/h');
  });

  it('lets the label break between number and unit, and nowhere else', () => {
    // A chart axis is 56pt wide, so "4,599.4 $/oz" wraps. Left alone the
    // layout broke it at the slash — "4,599.4 $/" over "oz" — which reads as
    // a number whose unit is "dollars per". The joiners make the unit one
    // atom so the space is the only break opportunity left.
    const out = formatBlockNumber(4599.4, '$/oz');
    expect(out.split(' ')).toHaveLength(2);
    expect(out).toContain(`$${WJ}/${WJ}oz`);
    // Zero-width, so nothing that reads the string aloud or measures it as
    // prose sees a difference.
    expect(plain(out)).toBe('4,599.4 $/oz');
  });

  it('groups thousands whether or not the value has a fraction', () => {
    // `toFixed(1)` was used for fractions and drops the separators, so one
    // axis could show a grouped number above an ungrouped one.
    expect(formatBlockNumber(78317.8)).toBe('78,317.8');
    expect(formatBlockNumber(62802)).toBe('62,802');
  });

  it('never prints more than one decimal — an axis label is not a reading', () => {
    expect(formatBlockNumber(4599.44444)).toBe('4,599.4');
    expect(formatBlockNumber(0.126)).toBe('0.1');
  });

  it('leaves a bare number alone when there is no unit to place', () => {
    expect(formatBlockNumber(1234)).toBe('1,234');
  });
});

describe('axisDecimals', () => {
  /**
   * Read off four live cards on 2026-08-23. Each pair is what the two axis
   * labels actually printed before one precision was chosen for the chart.
   */
  it('writes both ends of an axis the same way', () => {
    // Ethereum: `$2,515` sat directly above `$1,844.6`. Both obeyed the
    // one-decimal cap; the pair still disagreed about how a price is written.
    expect(axisDecimals(1844.6, 2515.04)).toBe(0);
    // The ruble, same shape one order of magnitude down: `85` above `77.7`.
    expect(axisDecimals(77.7, 85)).toBe(1);
  });

  it('refuses a tenth of a dollar on a five-figure price', () => {
    // Bitcoin's axis said `$78,317.8` two centimetres under a card whose own
    // reading said `$77,074`. `formatReading` had already ruled on this: the
    // fourth significant digit is noise the reader will never repeat.
    expect(axisDecimals(62802.6, 78317.8)).toBe(0);
  });

  it('leaves whole endpoints whole', () => {
    // A prediction contract priced 39 to 75 gains nothing from `39.0`.
    expect(axisDecimals(39, 75)).toBe(0);
    expect(axisDecimals(8, 13)).toBe(0);
  });

  it('spends decimals where the span is the whole story', () => {
    // The rand moved 16.04 → 16.80 in a month. At zero decimals the axis
    // reads `16` and `17`, which is the one thing the card is about, rounded
    // away.
    expect(axisDecimals(16.04, 16.8)).toBe(2);
    // The ten-year, likewise — and two decimals is also what the card's own
    // reading uses for a rate ("4.69%").
    expect(axisDecimals(4.4, 4.8)).toBe(2);
    // Brent's 68.5–105.3 is a 37-point span; tenths there are weather.
    expect(axisDecimals(68.5, 105.3)).toBe(0);
  });

  it('survives a series it cannot measure', () => {
    expect(axisDecimals(Number.NaN, 10)).toBe(0);
    expect(axisDecimals(5, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('formatBlockNumber with a fixed precision', () => {
  it('pads as well as caps, so a pair cannot disagree', () => {
    expect(formatBlockNumber(2515.04, '$', 0)).toBe('$2,515');
    expect(formatBlockNumber(1844.6, '$', 0)).toBe('$1,845');
    expect(formatBlockNumber(85, undefined, 1)).toBe('85.0');
    expect(formatBlockNumber(77.7, undefined, 1)).toBe('77.7');
    expect(formatBlockNumber(4.8, '%', 2)).toBe('4.80%');
  });

  it('still groups thousands when a precision is given', () => {
    expect(formatBlockNumber(78317.8, '$', 0)).toBe('$78,318');
  });
});
