import type { InstrumentColumns } from '../lib/cards/markets';
import { buildRankedInstruments, buildSwipeSections } from '../lib/cards/sections';
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
    scheduled: [],
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

describe('buildRankedInstruments', () => {
  it('ranks across kinds rather than within each desk', () => {
    const quiet = graph('brent');
    const closed = { ...graph('strait-hormuz'), lead: true };
    const ranked = buildRankedInstruments(columns({ markets: [quiet], straits: [closed] }), [], []);
    // A strait gated on its own freshness outranks an instrument that merely
    // exists, even though the strait's desk used to sort after markets.
    expect(ranked.map((c) => c.id)).toEqual(['strait-hormuz', 'brent']);
  });

  it('admits market signals to the pool instead of prepending them unranked', () => {
    const signal = { ...graph('market-signal:mkt:bist'), lead: true };
    const closed = { ...graph('strait-hormuz'), lead: true };
    const ranked = buildRankedInstruments(columns({ straits: [closed] }), [signal], []);
    expect(ranked.map((c) => c.id).sort()).toEqual(['market-signal:mkt:bist', 'strait-hormuz']);
  });

  it('applies the same gate — no graph and no analysis, no row', () => {
    const ranked = buildRankedInstruments(
      columns({ markets: [graph('brent'), graph('silent', '')] }),
      [],
      [],
    );
    expect(ranked.map((c) => c.id)).toEqual(['brent']);
  });
});
