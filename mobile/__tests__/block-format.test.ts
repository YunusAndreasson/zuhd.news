import { formatBlockNumber } from '../components/blocks/shared';

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
