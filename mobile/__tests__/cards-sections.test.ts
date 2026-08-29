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
    straits: [],
    predictions: [],
    ...overrides,
  };
}

describe('buildSwipeSections', () => {
  it('keeps three specific graph desks and routes each payload family truthfully', () => {
    const sections = buildSwipeSections(
      columns({
        markets: [graph('brent'), graph('vix'), graph('rand')],
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
        .every((item) => item.kind === 'reading' || item.kind === 'belief'),
    ).toBe(true);
  });

  it('rejects static copy, non-graphs and malformed histories from every deck', () => {
    const noAnalysis = graph('no-analysis', '');
    const malformed = graph('malformed');
    malformed.series = { values: [1], periods: ['a'], label: 'bad' };
    const noSeries: Card = {
      id: 'no-series',
      kind: 'reading',
      kicker: 'market',
      title: 'No history',
      reading: '1',
      why: 'Pipeline prose cannot turn a reading into a time series.',
    };

    const sections = buildSwipeSections(
      columns({
        markets: [graph('brent'), noAnalysis, malformed, noSeries],
      }),
      [],
    );

    expect(sections.markets.map((item) => item.id)).toEqual(['brent']);
    expect(sections.shipping).toEqual([]);
    expect(sections.outlook).toEqual([]);
  });
});
