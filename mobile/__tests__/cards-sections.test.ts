import type { InstrumentColumns } from '../lib/cards/markets';
import { buildSwipeSections } from '../lib/cards/sections';
import type { Card, ReadingCard } from '../lib/cards/types';

function graph(id: string, why = `${id} live analysis`): ReadingCard {
  return {
    id,
    kind: 'reading',
    kicker: id,
    title: id,
    reading: '1',
    why,
    series: { values: [1, 2], periods: ['a', 'b'], label: id },
  };
}

function columns(overrides: Partial<InstrumentColumns> = {}): InstrumentColumns {
  return {
    markets: [],
    currencies: [],
    straits: [],
    predictions: [],
    calendar: [],
    attention: [],
    ...overrides,
  };
}

describe('buildSwipeSections', () => {
  it('keeps three specific graph desks and routes each payload family truthfully', () => {
    const sections = buildSwipeSections(
      columns({
        markets: [graph('brent'), graph('vix')],
        currencies: [graph('rand')],
        straits: [graph('strait-hormuz')],
        predictions: [graph('prediction')],
      }),
      [],
    );

    expect(Object.keys(sections).sort()).toEqual(['markets', 'outlook', 'shipping']);
    expect(sections.markets.map((item) => item.id).sort()).toEqual(['brent', 'rand', 'vix']);
    expect(sections.shipping.map((item) => item.id)).toEqual(['strait-hormuz']);
    expect(sections.outlook.map((item) => item.id)).toEqual(['prediction']);
    expect(
      Object.values(sections)
        .flat()
        .every((item) => item.visualization.kind === 'trend'),
    ).toBe(true);
  });

  it('rejects static copy, non-graphs and malformed histories from every deck', () => {
    const staticGraph = graph('static', '');
    staticGraph.whatItIs = 'Hard-coded definition';
    const malformed = graph('malformed');
    malformed.series = { values: [1], periods: ['a'], label: 'bad' };
    const comparison: Card = {
      id: 'wikipedia',
      kind: 'comparison',
      kicker: 'attention',
      title: 'Wikipedia attention',
      reading: '1',
      why: 'Pipeline prose cannot turn rows into a time series.',
      rows: [{ label: 'one', value: '1' }],
    };

    const sections = buildSwipeSections(
      columns({
        markets: [graph('brent'), staticGraph, malformed],
        attention: [comparison],
        calendar: [graph('calendar')],
      }),
      [],
    );

    expect(sections.markets.map((item) => item.id)).toEqual(['brent']);
    expect(sections.shipping).toEqual([]);
    expect(sections.outlook).toEqual([]);
  });
});
