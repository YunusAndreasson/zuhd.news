import type { InstrumentColumns } from '../lib/cards/markets';
import { buildSwipeSections } from '../lib/cards/sections';
import type { ReadingCard } from '../lib/cards/types';

function card(id: string): ReadingCard {
  return {
    id,
    kind: 'reading',
    kicker: id,
    title: id,
    reading: '1',
    whatItIs: `${id} explained`,
    series: { values: [1, 2], periods: ['a', 'b'], label: id },
  };
}

describe('buildSwipeSections', () => {
  it('turns narrow subject pools into two complete decks without losing a card', () => {
    const columns: InstrumentColumns = {
      markets: [card('brent'), card('vix')],
      currencies: [card('currencies')],
      straits: [card('strait-hormuz')],
      predictions: [card('prediction')],
      calendar: [card('calendar')],
      attention: [card('attention')],
    };

    const sections = buildSwipeSections(columns, [card('disasters')], []);

    expect(Object.keys(sections).sort()).toEqual(['next', 'now']);
    expect(sections.now.map((item) => item.id).sort()).toEqual(
      ['attention', 'brent', 'currencies', 'disasters', 'strait-hormuz'].sort(),
    );
    expect(sections.next.map((item) => item.id).sort()).toEqual(
      ['calendar', 'prediction', 'vix'].sort(),
    );
    expect([...sections.now, ...sections.next]).toHaveLength(8);
  });

  it('keeps a missing payload family inside its deck instead of exposing an empty tab', () => {
    const columns: InstrumentColumns = {
      markets: [card('brent')],
      currencies: [],
      straits: [],
      predictions: [card('prediction')],
      calendar: [],
      attention: [],
    };

    const sections = buildSwipeSections(columns, [], []);

    expect(sections.now.map((item) => item.id)).toEqual(['brent']);
    expect(sections.next.map((item) => item.id)).toEqual(['prediction']);
  });
});
