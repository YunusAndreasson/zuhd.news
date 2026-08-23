import { indexRow } from '../lib/cards/row';
import type {
  BeliefCard,
  Card,
  CardDelta,
  ComparisonCard,
  ConditionCard,
  ReadingCard,
} from '../lib/cards/types';

const delta = (over: Partial<CardDelta> = {}): CardDelta => ({
  direction: 'up',
  magnitude: '2.6%',
  window: 'on the month',
  valence: 'unfavorable',
  ...over,
});

const reading = (over: Partial<ReadingCard> = {}): ReadingCard => ({
  id: 'brent',
  kind: 'reading',
  kicker: 'energy',
  title: 'Brent crude',
  reading: '$95',
  readingNote: 'a barrel',
  delta: delta(),
  series: { values: [90, 92, 95], periods: ['p0', 'p1', 'p2'], label: 'dollars a barrel' },
  ...over,
});

const comparison = (over: Partial<ComparisonCard> = {}): ComparisonCard => ({
  id: 'currencies',
  kind: 'comparison',
  kicker: 'currency',
  title: 'Against the dollar',
  reading: '3 of 15',
  readingNote: 'weakened this month',
  rows: [{ label: 'Russian ruble', value: '−6.0%', tone: 'unfavorable' }],
  ...over,
});

describe('indexRow', () => {
  it('copies the card’s own strings rather than formatting its own', () => {
    // The whole reason this is a projection and not a renderer. A row that
    // spelled a number a second way would let the index and the card it opens
    // disagree one tap apart — the bug `EntitySheet.formatLatest` and
    // `ChokepointSheet.formatCount` each shipped before they were retired.
    const card = reading({ reading: '4.69%', delta: delta({ magnitude: '15 points' }) });
    const row = indexRow(card);
    expect(row.reading).toBe(card.reading);
    expect(row.delta?.magnitude).toBe('15 points');
    expect(row.delta).toBe(card.delta);
  });

  it('puts the unit on line two, and the kicker only when there is none', () => {
    // "3 of 15" is not a fact until "weakened this month" is under it, and the
    // kicker cannot supply that. Where a card has no unit the kicker is better
    // than an empty line.
    expect(indexRow(comparison()).note).toBe('weakened this month');
    expect(indexRow(reading({ readingNote: undefined })).note).toBe('energy');
  });

  it('takes the chip’s valence so the line and the chip cannot disagree', () => {
    expect(indexRow(reading({ delta: delta({ valence: 'favorable' }) })).tone).toBe('favorable');
  });

  it('is slate where the card makes no claim, never uncoloured', () => {
    // `neutral` is a colour. The row has no way to fall back to "no tint"
    // because the absence of one is what made two thirds of the app's chips
    // unreadable before `lib/valence.ts` said so out loud.
    const row = indexRow(reading({ delta: undefined }));
    expect(row.tone).toBe('neutral');
    expect(row.delta).toBeUndefined();
  });

  it('marks a gated card and nothing else', () => {
    expect(indexRow(reading({ lead: true })).lead).toBe(true);
    expect(indexRow(reading()).lead).toBe(false);
  });

  it('draws a series only when one line is the right picture', () => {
    // A multi-line series belongs to a reading built from both lines — wheat
    // and rice read as the ratio between them — so drawing the first alone
    // would put the wrong series under the number above it.
    expect(indexRow(reading()).spark).toEqual([90, 92, 95]);
    expect(indexRow(reading({ series: undefined })).spark).toBeUndefined();
    expect(
      indexRow(
        reading({
          series: {
            values: [1, 2],
            periods: ['p0', 'p1'],
            label: 'two',
            multi: [
              { values: [1, 2], label: 'wheat' },
              { values: [3, 4], label: 'rice' },
            ],
          },
        }),
      ).spark,
    ).toBeUndefined();
  });

  it('draws no series for the kinds that have none', () => {
    expect(indexRow(comparison()).spark).toBeUndefined();
    const condition: ConditionCard = {
      id: 'disasters',
      kind: 'condition',
      kicker: 'hazards',
      title: 'Hazard alerts',
      reading: '100',
      readingNote: 'active now',
      lead: true,
    };
    expect(indexRow(condition).spark).toBeUndefined();
  });

  it('draws a belief card’s series, which is not optional on that kind', () => {
    const belief: BeliefCard = {
      id: 'poly-x',
      kind: 'belief',
      kicker: 'priced',
      title: 'A ceasefire by March',
      reading: '91%',
      readingNote: 'chance priced',
      series: { values: [80, 85, 91], periods: ['p0', 'p1', 'p2'], label: 'chance priced' },
    };
    expect(indexRow(belief).spark).toEqual([80, 85, 91]);
  });

  it('says the level, the unit and the move in words', () => {
    // The picture is not readable by a screen reader and is not meant to be —
    // the sentence carries everything the row claims.
    expect(indexRow(reading()).a11yLabel).toBe('Brent crude. $95 a barrel. up 2.6%, on the month.');
  });

  it('leads the spoken row with the mark a gated card carries', () => {
    expect(indexRow(reading({ lead: true })).a11yLabel).toBe(
      'Today. Brent crude. $95 a barrel. up 2.6%, on the month.',
    );
  });

  it('does not read a magnitude aloud for a move that has no direction', () => {
    // `formatSignedPct` prints "unchanged" for a move that rounds to nothing,
    // and a caret is not drawn at flat either. "flat 0.0%" would be the row
    // claiming a direction the card explicitly declined to.
    expect(
      indexRow(reading({ delta: delta({ direction: 'flat', window: undefined }) })).a11yLabel,
    ).toBe('Brent crude. $95 a barrel. unchanged.');
  });

  it('says nothing about a move on a card that reports none', () => {
    const card: Card = comparison({ delta: undefined });
    expect(indexRow(card).a11yLabel).toBe('Against the dollar. 3 of 15 weakened this month.');
  });
});
