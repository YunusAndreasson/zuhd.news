import { citedAnnotations, citedLabels, MAX_CITED, windowReference } from '../lib/cards/card-chart';
import type { CardDelta, CardSeries } from '../lib/cards/types';

const series = (extra: Partial<CardSeries> = {}): CardSeries => ({
  values: [10, 20, 30, 40],
  periods: ['Jul 23', 'Jul 24', 'Jul 25', 'Jul 26'],
  label: 'brent',
  ...extra,
});
const delta = (window: string): CardDelta => ({
  direction: 'up',
  magnitude: '100%',
  valence: 'neutral',
  window,
});

describe('windowReference', () => {
  it("draws the value the chip's move is measured from, labelled with its day", () => {
    expect(windowReference(series(), delta('since Jul 24'))).toEqual({
      value: 20,
      label: 'since Jul 24',
    });
  });

  it("reads a currency's worded window too", () => {
    expect(windowReference(series(), delta('weaker since Jul 23'))?.value).toBe(10);
  });

  it('keeps a reference the card already draws, such as a strait normal', () => {
    const normal = { value: 5, label: 'normal' };
    expect(windowReference(series({ reference: normal }), delta('since Jul 24'))).toBeUndefined();
  });

  it('draws nothing for a window that names no day, or a day not on the chart', () => {
    expect(windowReference(series(), delta('4 sessions'))).toBeUndefined();
    expect(windowReference(series(), delta('since Jun 1'))).toBeUndefined();
    // The last observation is the reading itself, not a place a move starts.
    expect(windowReference(series(), delta('since Jul 26'))).toBeUndefined();
  });
});

describe('citedAnnotations', () => {
  const story = (slug: string, date: string) => ({ slug, title: slug, date });

  it("numbers each story by its place in the card's list", () => {
    const marks = citedAnnotations(series(), [
      story('a', '2026-07-25T09:00:00Z'),
      story('b', '2026-07-23T23:10:00Z'),
    ]);
    expect(marks).toEqual([
      { atIndex: 2, label: '1' },
      { atIndex: 0, label: '2' },
    ]);
  });

  it('matches a monthly series on the month', () => {
    const monthly = series({ periods: ['Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026'] });
    expect(citedAnnotations(monthly, [story('a', '2026-08-14T00:00:00Z')])).toEqual([
      { atIndex: 2, label: '1' },
    ]);
  });

  it('lists a story off the chart without marking it, and never marks past the list', () => {
    const many = [
      story('old', '2026-05-01T00:00:00Z'),
      story('a', '2026-07-24T00:00:00Z'),
      story('b', '2026-07-25T00:00:00Z'),
      story('c', '2026-07-26T00:00:00Z'),
    ];
    const marks = citedAnnotations(series(), many);
    expect(marks?.map((m) => m.label)).toEqual(['2', '3']);
    expect(marks?.length).toBeLessThanOrEqual(MAX_CITED);
  });

  it('returns nothing when no story falls on the chart', () => {
    expect(citedAnnotations(series(), [story('old', '2026-01-01T00:00:00Z')])).toBeUndefined();
    expect(citedAnnotations(series(), undefined)).toBeUndefined();
  });

  it('marks two stories on one day with one dot that names both', () => {
    const marks = citedAnnotations(series(), [
      story('a', '2026-07-26T08:00:00Z'),
      story('b', '2026-07-26T20:00:00Z'),
      story('c', '2026-07-25T12:00:00Z'),
    ]);
    expect(marks).toEqual([
      { atIndex: 3, label: '1 · 2' },
      { atIndex: 2, label: '3' },
    ]);
  });
});

describe('citedLabels', () => {
  // The Brent card on 2026-09-19: story 3 on Sep 14, stories 1 and 2 on Sep 15,
  // one day apart at the end of a 90-day line. Its labels read "31".
  it('joins labels that would touch, in the order the marks sit on the line', () => {
    expect(
      citedLabels(
        [
          { x: 300, label: '1 · 2' },
          { x: 296, label: '3' },
        ],
        7.5,
        6,
      ),
    ).toEqual([{ x: 298, label: '3 · 1 · 2' }]);
  });

  it('leaves labels with room between them apart', () => {
    expect(
      citedLabels(
        [
          { x: 40, label: '2' },
          { x: 300, label: '1' },
        ],
        7.5,
        6,
      ),
    ).toEqual([
      { x: 40, label: '2' },
      { x: 300, label: '1' },
    ]);
  });
});
