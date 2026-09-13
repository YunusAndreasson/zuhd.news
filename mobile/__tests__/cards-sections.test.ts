import type { InstrumentColumns } from '../lib/cards/markets';
import { buildRankedInstruments } from '../lib/cards/sections';
import type { ReadingCard } from '../lib/cards/types';

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
