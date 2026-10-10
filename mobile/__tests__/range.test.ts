import { type Range, rangeMarks, rangeScale } from '../lib/cards/range';

// The labs on 2026-10-10: two at the top whose ranges are nearly one, a group
// in the middle that overlaps, and one apart.
const ANTHROPIC: Range = { low: 164.1, high: 171.7, at: 167.3 };
const OPENAI: Range = { low: 163.3, high: 171.5, at: 166.5 };
const MOONSHOT: Range = { low: 155.2, high: 160, at: 157.5 };
const MISTRAL: Range = { low: 138.6, high: 143.2, at: 141.4 };
const LABS = [ANTHROPIC, OPENAI, MOONSHOT, MISTRAL];

describe('a list’s ranges on one scale', () => {
  it('runs from the lowest low to the highest high', () => {
    expect(rangeScale(LABS)).toEqual({ lo: 138.6, hi: 171.7 });
  });

  it('places each range and its reading as shares of that width', () => {
    const scale = rangeScale(LABS);
    if (!scale) throw new Error('no scale');
    const width = 171.7 - 138.6;
    const top = rangeMarks(ANTHROPIC, scale);
    expect(top?.from).toBeCloseTo((164.1 - 138.6) / width);
    expect((top?.from ?? 0) + (top?.length ?? 0)).toBeCloseTo(1);
    expect(top?.at).toBeCloseTo((167.3 - 138.6) / width);
    expect(rangeMarks(MISTRAL, scale)).toMatchObject({ from: 0 });
  });

  it('shows what the numbers alone do not: which ranges overlap', () => {
    const scale = rangeScale(LABS);
    if (!scale) throw new Error('no scale');
    const spans = LABS.map((lab) => {
      const marks = rangeMarks(lab, scale);
      return [marks?.from ?? 0, (marks?.from ?? 0) + (marks?.length ?? 0)] as const;
    });
    const overlap = (a: readonly [number, number], b: readonly [number, number]) =>
      a[0] < b[1] && b[0] < a[1];
    const [anthropic, openai, moonshot, mistral] = spans as [
      (typeof spans)[0],
      (typeof spans)[0],
      (typeof spans)[0],
      (typeof spans)[0],
    ];
    // First and second by score are one range, near enough.
    expect(overlap(anthropic, openai)).toBe(true);
    expect(overlap(anthropic, moonshot)).toBe(false);
    expect(overlap(moonshot, mistral)).toBe(false);
  });

  it('has no scale for fewer than two ranges, or ranges with no width between them', () => {
    expect(rangeScale([])).toBeNull();
    expect(rangeScale([ANTHROPIC])).toBeNull();
    expect(
      rangeScale([
        { low: 5, high: 5, at: 5 },
        { low: 5, high: 5, at: 5 },
      ]),
    ).toBeNull();
    // A range the wrong way round, or with no number in it, is not one.
    const broken = { low: 9, high: 3, at: 5 };
    expect(rangeScale([ANTHROPIC, broken])).toBeNull();
    expect(rangeMarks(broken, { lo: 0, hi: 10 })).toBeNull();
    expect(rangeMarks({ low: Number.NaN, high: 3, at: 2 }, { lo: 0, hi: 10 })).toBeNull();
  });

  it('keeps a reading outside its own range, or off the scale, on the mark', () => {
    // The scale reaches a reading that sits past its range.
    expect(
      rangeScale([
        { low: 4, high: 6, at: 7 },
        { low: 1, high: 2, at: 1.5 },
      ]),
    ).toEqual({
      lo: 1,
      hi: 7,
    });
    expect(rangeMarks({ low: -5, high: 20, at: 30 }, { lo: 0, hi: 10 })).toEqual({
      from: 0,
      length: 1,
      at: 1,
    });
  });
});
