import type { Chokepoint, Indicator, TrendsSnapshot } from '@shared/types';
import { buildInstrumentCards, type InstrumentColumns } from '../lib/cards/markets';
import type { Card } from '../lib/cards/types';

const find = (cards: Card[], id: string) => cards.find((c) => c.id === id);

/** Flatten every instrument column — most assertions here are about whether a
 *  card exists and what it says, not about which column it landed in. */
const allOf = (columns: InstrumentColumns): Card[] => Object.values(columns).flat();

function indicator(over: Partial<Indicator> & Pick<Indicator, 'id'>): Indicator {
  const values = over.values ?? [100, 110];
  return {
    label: over.id,
    source: 'fred',
    sourceLabel: 'FRED',
    values,
    periods: over.periods ?? values.map((_, i) => `p${i}`),
    ...over,
  } as Indicator;
}

function snapshot(indicators: Indicator[], extra: Partial<TrendsSnapshot> = {}): TrendsSnapshot {
  return { fetchedAt: '2026-08-09', asOf: '2026-08-09', indicators, ...extra };
}

/** A strait, measured on `n_total`. `delta` is the fraction it sits away from
 *  its own 90-day normal — the quantity `CHOKEPOINT_DISRUPTED` gates on. */
function strait(id: string, name: string, last7: number, base: number, delta: number): Chokepoint {
  return {
    id,
    name,
    blurb: `${name} blurb`,
    lat: 0,
    lng: 0,
    topicTags: [],
    primaryField: 'n_total',
    last7Avg: { n_total: last7 },
    baseline90Avg: { n_total: base },
    delta7vs90: { n_total: delta },
    series: { periods: ['a', 'b'], total: [base, last7] },
    asOf: '2026-08-02',
  };
}

// ---------------------------------------------------------------------------
// markets
// ---------------------------------------------------------------------------

describe('buildInstrumentCards', () => {
  it('returns empty columns rather than an empty shell when the snapshot is missing', () => {
    const columns = buildInstrumentCards({ trends: null, chokepoints: [], articles: [] });
    expect(allOf(columns)).toEqual([]);
    // Every key still present, so a section renders its empty state rather
    // than crashing on an undefined column.
    expect(Object.keys(columns).sort()).toEqual(['markets', 'predictions', 'straits']);
  });

  it('files each card in the column a reader would go looking for it in', () => {
    const columns = buildInstrumentCards({
      trends: snapshot([
        indicator({ id: 'brent', label: 'Brent crude', unit: '$/bbl' }),
        indicator({ id: 'btc', label: 'Bitcoin', unit: '$' }),
        indicator({ id: 'paxg', label: 'Gold', unit: '$/oz', values: [4110, 4352.19] }),
        indicator({ id: 'xag', label: 'Silver', unit: '$/oz', values: [57.8, 52.56] }),
        indicator({ id: 'fx-rub', label: 'Russian ruble', source: 'oer', countryTags: ['RU'] }),
        indicator({ id: 'fx-jpy', label: 'Japanese yen', source: 'oer', countryTags: ['JP'] }),
        indicator({ id: 'fx-egp', label: 'Egyptian pound', source: 'oer', countryTags: ['EG'] }),
        indicator({ id: 'poly-x', label: 'Something?', source: 'polymarket', unit: '%' }),
      ]),
      chokepoints: [],
      articles: [],
    });
    expect(columns.markets.map((c) => c.id)).toEqual([
      'nisab',
      'brent',
      'metals',
      'btc',
      'fx-rub-mover',
      'fx-jpy-mover',
    ]);
    expect(columns.predictions.map((c) => c.id)).toEqual(['poly-x']);
    expect(columns.markets.map((c) => c.id)).not.toContain('poly-x');
    expect(columns.predictions.map((c) => c.id)).not.toContain('nisab');
  });

  it('separates measured markets from forward-looking signals', () => {
    const columns = buildInstrumentCards({
      trends: snapshot([
        indicator({ id: 'vix', label: 'VIX', unit: 'index' }),
        indicator({ id: 'us-10y', label: 'US 10y Treasury', unit: '%' }),
      ]),
      chokepoints: [],
      articles: [],
    });
    expect(columns.predictions).toEqual([]);
    expect(columns.markets.map((c) => c.id)).toEqual(['us-10y', 'vix']);
    // The kicker carries the argument, so a reader meets it without reading
    // this file.
    expect(find(columns.markets, 'vix')?.kicker).toBe('volatility');
  });

  it('marks a gated card and leaves a standing one unmarked', () => {
    const columns = buildInstrumentCards({
      trends: snapshot([
        indicator({ id: 'paxg', label: 'Gold', unit: '$/oz', values: [4110, 4352.19] }),
        indicator({ id: 'xag', label: 'Silver', unit: '$/oz', values: [57.8, 52.56] }),
      ]),
      chokepoints: [strait('kerch', 'Kerch Strait', 0.9, 8.8, -0.902)],
      articles: [],
    });
    // The strait is here because it went quiet this week; the nisab is here
    // every day. Until the mark existed both arrived in identical weight.
    expect(find(columns.straits, 'strait-kerch')?.lead).toBe(true);
    expect(find(columns.markets, 'nisab')?.lead).toBeUndefined();
    expect(find(columns.markets, 'metals')?.lead).toBeUndefined();
  });

  it('drops a card whose data is absent instead of rendering a placeholder', () => {
    const cards = allOf(
      buildInstrumentCards({
        trends: snapshot([indicator({ id: 'brent', label: 'Brent crude', unit: '$/bbl' })]),
        chokepoints: [],
        articles: [],
      }),
    );
    expect(find(cards, 'brent')).toBeDefined();
    // No wheat, no metals, no contracts, no straits — and so no cards for them.
    expect(find(cards, 'staples')).toBeUndefined();
    expect(find(cards, 'nisab')).toBeUndefined();
    expect(find(cards, 'straits')).toBeUndefined();
  });

  it('puts the currency mark in front of the number and the denominator in English', () => {
    const cards = allOf(
      buildInstrumentCards({
        trends: snapshot([
          indicator({ id: 'brent', label: 'Brent crude', unit: '$/bbl', values: [80, 88.9] }),
        ]),
        chokepoints: [],
        articles: [],
      }),
    );
    const brent = find(cards, 'brent');
    expect(brent?.reading).toBe('$89');
    expect(brent?.readingNote).toBe('a barrel');
  });

  it('renders `standing` verbatim as the why — the app does not rewrite the desk', () => {
    const standing = 'It moves on supply, and fuel, freight and fertiliser move after it.';
    const cards = allOf(
      buildInstrumentCards({
        trends: snapshot([indicator({ id: 'brent', label: 'Brent crude', standing })]),
        chokepoints: [],
        articles: [],
      }),
    );
    expect(find(cards, 'brent')?.why).toBe(standing);
  });

  it('draws wheat and rice as two lines on one axis, and only when they align', () => {
    const wheat = indicator({
      id: 'wheat',
      label: 'Wheat',
      unit: '$/mt',
      cadence: 'monthly',
      values: [175, 220, 199.65],
      periods: ['Aug 2024', 'May 2026', 'Jun 2026'],
    });
    const rice = indicator({
      id: 'rice',
      label: 'Rice',
      unit: '$/mt',
      cadence: 'monthly',
      values: [563, 396, 400],
      periods: ['Aug 2024', 'May 2026', 'Jun 2026'],
    });
    const paired = allOf(
      buildInstrumentCards({
        trends: snapshot([wheat, rice]),
        chokepoints: [],
        articles: [],
      }),
    );
    const staples = find(paired, 'staples');
    expect(staples?.kind).toBe('reading');
    expect(staples?.kind === 'reading' ? staples.series?.multi?.length : 0).toBe(2);
    expect(staples?.changed).toContain('wheat +14%');
    expect(staples?.changed).toContain('rice −29%');

    // Misaligned periods would put two different time axes on one chart.
    const misaligned = allOf(
      buildInstrumentCards({
        trends: snapshot([
          wheat,
          { ...rice, values: [396, 400], periods: ['May 2026', 'Jun 2026'] },
        ]),
        chokepoints: [],
        articles: [],
      }),
    );
    expect(find(misaligned, 'staples')).toBeUndefined();
  });

  it('names the binding metal and says which way the threshold moved', () => {
    const cards = allOf(
      buildInstrumentCards({
        trends: snapshot([
          indicator({ id: 'paxg', label: 'Gold', unit: '$/oz', values: [4110, 4352.19] }),
          // Silver down, so the threshold falls and MORE wealth is zakatable —
          // the counter-intuitive half of the card.
          indicator({ id: 'xag', label: 'Silver', unit: '$/oz', values: [57.8, 52.56] }),
        ]),
        chokepoints: [],
        articles: [],
      }),
    );
    const card = find(cards, 'nisab');
    expect(card?.reading).toBe('$1,005');
    expect(card?.readingNote).toBe('set by silver');
    expect(card?.changed).toContain('fell');
    expect(card?.changed).toContain('more wealth is zakatable');
    expect(card?.why).toBeUndefined();
  });

  it('graphs the gold-to-silver ratio that the metals card headlines', () => {
    const cards = allOf(
      buildInstrumentCards({
        trends: snapshot([
          indicator({ id: 'paxg', label: 'Gold', unit: '$/oz', values: [4000, 4500] }),
          indicator({ id: 'xag', label: 'Silver', unit: '$/oz', values: [50, 60] }),
        ]),
        chokepoints: [],
        articles: [],
      }),
    );
    const metals = find(cards, 'metals');
    expect(metals?.kind).toBe('reading');
    expect(metals?.kind === 'reading' ? metals.series?.values : []).toEqual([80, 75]);
    expect(metals?.kind === 'reading' ? metals.series?.multi : undefined).toBeUndefined();
    expect(metals?.kind === 'reading' ? metals.series?.label : '').toContain('ounces of silver');
  });

  it('reports a currency move as a relative percentage and a contract as points', () => {
    const cards = allOf(
      buildInstrumentCards({
        trends: snapshot([
          indicator({
            id: 'fx-rub',
            label: 'Russian ruble',
            source: 'oer',
            unit: 'RUB / USD',
            values: [77.02483, 82.265959],
            periods: ['Jul 11', 'Aug 9'],
            countryTags: ['RU'],
          }),
          indicator({
            id: 'fx-jpy',
            label: 'Japanese yen',
            source: 'oer',
            values: [161.67, 157.8],
            periods: ['Jul 11', 'Aug 9'],
            countryTags: ['JP'],
          }),
          indicator({
            id: 'fx-egp',
            label: 'Egyptian pound',
            source: 'oer',
            values: [49.626, 49.79],
            periods: ['Jul 11', 'Aug 9'],
            countryTags: ['EG'],
          }),
          indicator({
            id: 'poly-ceasefire',
            label: 'Will the ceasefire hold?',
            source: 'polymarket',
            unit: '%',
            values: [26, 86],
            periods: ['Jul 17', 'Aug 9'],
          }),
        ]),
        chokepoints: [],
        articles: [],
      }),
    );
    const mover = find(cards, 'fx-rub-mover');
    expect(mover?.delta).toMatchObject({
      direction: 'down',
      magnitude: '6.4%',
      valence: 'unfavorable',
    });
    expect(mover?.delta?.window).toContain('weaker');

    const belief = find(cards, 'poly-ceasefire');
    // The move is the chip now, and it is still in points: 26 → 86 is 60
    // points, and "+231%" is the arithmetic-pretending-to-be-journalism this
    // has always guarded against.
    expect(belief?.delta).toMatchObject({ direction: 'up', magnitude: '60 points' });
    expect(JSON.stringify(belief)).not.toContain('231');
    // A belief takes no position — a ceasefire holding and a candidate
    // winning move the same way on screen — and says so in slate rather than
    // by leaving the chip the colour of the label text beside it.
    expect(belief?.delta?.valence).toBe('neutral');
    // What is left for the sentence is the range, which is the part that says
    // how settled the belief is.
    expect(belief?.changed).toContain('Low 26% on Jul 17');
    expect(belief?.changed).toContain('high 86% on Aug 9');
  });

  it('leaves nothing on screen in the colour of the label text beside it', () => {
    // The goal, as an invariant rather than as a screenshot: every move the
    // app shows is in the colour channel, and the ones it will not editorialise
    // over say so in slate. Before this, brent/us-10y/vix carried sage and rose
    // and everything else — crypto, both ratios, nisab, every prediction, a
    // strait at its normal — sat in near-white,
    // so the reader's first question was whether a chip was coloured at all.
    const columns = buildInstrumentCards({
      trends: snapshot([
        indicator({ id: 'brent', label: 'Brent crude', unit: '$/bbl' }),
        indicator({ id: 'btc', label: 'Bitcoin', unit: '$' }),
        indicator({ id: 'eth', label: 'Ether', unit: '$' }),
        indicator({ id: 'paxg', label: 'Gold', unit: '$/oz', values: [4110, 4352.19] }),
        indicator({ id: 'xag', label: 'Silver', unit: '$/oz', values: [57.8, 52.56] }),
        indicator({ id: 'wheat', label: 'Wheat', values: [220, 231] }),
        indicator({ id: 'rice', label: 'Rice', values: [500, 486] }),
        indicator({ id: 'fx-rub', label: 'Russian ruble', source: 'oer', countryTags: ['RU'] }),
        indicator({ id: 'fx-jpy', label: 'Japanese yen', source: 'oer', countryTags: ['JP'] }),
        indicator({ id: 'poly-x', label: 'Something?', source: 'polymarket', unit: '%' }),
      ]),
      chokepoints: [],
      articles: [],
    });
    const cards = allOf(columns);
    expect(cards.length).toBeGreaterThan(5);

    for (const card of cards) {
      if (card.delta) {
        expect(card.delta.valence).toBeDefined();
      }
    }

    // And the colour still means something: the three the app speaks for are
    // not slate, and the ones it does not are.
    const valenceOfCard = (id: string) => cards.find((c) => c.id === id)?.delta?.valence;
    expect(valenceOfCard('brent')).toBe('unfavorable');
    expect(valenceOfCard('btc')).toBe('neutral');
    expect(valenceOfCard('eth')).toBe('neutral');
    expect(valenceOfCard('staples')).toBe('neutral');
    expect(valenceOfCard('metals')).toBe('neutral');
  });

  it('keeps every disrupted strait so deck ranking can use current-news relevance', () => {
    const cards = allOf(
      buildInstrumentCards({
        trends: snapshot([indicator({ id: 'brent' })]),
        chokepoints: [
          strait('dover', 'Dover Strait', 157, 162.2, -0.032),
          strait('kerch', 'Kerch Strait', 0.9, 8.8, -0.902),
          strait('hormuz', 'Strait of Hormuz', 1, 3.9, -0.741),
        ],
        articles: [],
      }),
    );
    const moved = find(cards, 'strait-kerch');
    expect(moved).toBeDefined();
    expect(moved?.reading).toBe('0.9');
    expect(moved?.kind === 'reading' ? moved.series?.values.at(-1) : undefined).toBe(0.9);
    // The distance from its own normal is the chip; the baseline it is
    // measured against stays in the sentence, because a percentage with
    // nothing to divide by is not a fact.
    expect(moved?.delta).toMatchObject({
      direction: 'down',
      magnitude: '90%',
      window: 'vs its 90-day normal',
      // Freight not moving reaches an ordinary life as the price of
      // everything that had to sail.
      valence: 'unfavorable',
    });
    expect(moved?.changed).toContain('8.8');
    // It is on screen because it moved, and it says so.
    expect(moved?.lead).toBe(true);
    // Both disrupted candidates survive; the later smart ranking stage can
    // now prefer a strait tied to the lead story instead of being forced to
    // accept the largest percentage move selected here.
    const columns = buildInstrumentCards({
      trends: snapshot([indicator({ id: 'brent' })]),
      chokepoints: [
        strait('dover', 'Dover Strait', 157, 162.2, -0.032),
        strait('kerch', 'Kerch Strait', 0.9, 8.8, -0.902),
        strait('hormuz', 'Strait of Hormuz', 1, 3.9, -0.741),
      ],
      articles: [],
    });
    expect(columns.straits.map((c) => c.id)).toEqual([
      'strait-kerch',
      'strait-hormuz',
      'strait-dover',
    ]);
    // The eleven-strait comparison table is gone. The globe on `news` draws
    // all eleven as tappable rings and `ChokepointSheet` says more about any
    // of them than a flat sorted list of the same names could.
    expect(find(cards, 'straits')).toBeUndefined();
  });

  it('uses the same seven-day total-traffic measure in a chokepoint headline and graph', () => {
    const hormuz = strait('hormuz', 'Strait of Hormuz', 5, 10, -0.5);
    hormuz.series.periods = ['1', '2', '3', '4', '5', '6', '7', '8'];
    hormuz.series.total = [10, 10, 10, 10, 10, 10, 10, 3];
    hormuz.primaryField = 'n_tanker';
    hormuz.last7Avg.n_tanker = 2.4;
    hormuz.baseline90Avg.n_tanker = 4.3;
    hormuz.delta7vs90.n_tanker = -0.431;
    const cards = allOf(
      buildInstrumentCards({
        trends: snapshot([indicator({ id: 'brent' })]),
        chokepoints: [hormuz],
        articles: [],
      }),
    );
    const card = find(cards, 'strait-hormuz');
    expect(card?.reading).toBe('5');
    expect(card?.readingNote).toBe('ships a day');
    expect(card?.delta?.magnitude).toBe('50%');
    expect(card?.kind === 'reading' ? card.series?.values : []).toEqual([10, 5]);
    expect(card?.kind === 'reading' ? card.series?.periods : []).toEqual(['7', '8']);
    expect(card?.kind === 'reading' ? card.series?.label : '').toBe('seven-day average, all ships');
  });

  it('keeps ordinary straits available without marking them current', () => {
    const columns = buildInstrumentCards({
      trends: snapshot([indicator({ id: 'brent' })]),
      chokepoints: [
        strait('dover', 'Dover Strait', 157, 162.2, -0.032),
        strait('panama', 'Panama Canal', 26.7, 30.7, -0.13),
        strait('suez', 'Suez Canal', 51, 50.5, 0.009),
        // Busy, not quiet — and well past the threshold. The gate is
        // one-sided on purpose: traffic rerouted *to* a strait is the same
        // disruption seen from the other end, and the app names the squeeze
        // rather than the detour.
        strait('taiwan', 'Taiwan Strait', 90, 80.5, 0.118),
      ],
      articles: [],
    });
    expect(columns.straits).toHaveLength(4);
    expect(columns.straits.every((card) => card.lead !== true)).toBe(true);
  });

  it('does not print the chokepoint blurb twice when standing repeats it', () => {
    const blurb = 'Between Crimea and Russia — the only access to the Sea of Azov.';
    const cards = allOf(
      buildInstrumentCards({
        trends: snapshot([indicator({ id: 'brent' })]),
        chokepoints: [
          {
            id: 'kerch',
            name: 'Kerch Strait',
            blurb,
            standing: blurb,
            recent: 'Traffic has fallen to zero.',
            lat: 0,
            lng: 0,
            topicTags: [],
            primaryField: 'n_total',
            last7Avg: { n_total: 0.9 },
            baseline90Avg: { n_total: 8.8 },
            delta7vs90: { n_total: -0.902 },
            series: { periods: ['a', 'b'], total: [8.8, 0.9] },
            asOf: '2026-08-02',
          },
        ],
        articles: [],
      }),
    );
    const card = find(cards, 'strait-kerch');
    expect(card?.why).toBe('Traffic has fallen to zero.');
  });
});

describe('graph-card context', () => {
  it('carries live pipeline analysis', () => {
    const columns = buildInstrumentCards({
      trends: snapshot([
        indicator({
          id: 'btc',
          label: 'Bitcoin',
          unit: '$',
          standing: 'Its price sets the tone for the rest of the digital-asset market.',
        }),
      ]),
      chokepoints: [],
      articles: [],
    });
    const btc = columns.markets[0];
    expect(btc?.why).toContain('sets the tone');
  });

  it('leaves analysis absent when the pipeline did not provide it', () => {
    const columns = buildInstrumentCards({
      trends: snapshot([indicator({ id: 'btc', label: 'Bitcoin', unit: '$' })]),
      chokepoints: [],
      articles: [],
    });
    expect(columns.markets[0]?.why).toBeUndefined();
  });
});

describe('belief titles', () => {
  it('keeps the question mark — it is what says this is an outcome, not a reading', () => {
    const columns = buildInstrumentCards({
      trends: snapshot([
        indicator({
          id: 'poly-iran',
          label: 'US invade Iran before 2027?',
          source: 'polymarket',
          unit: '%',
          values: [16, 17],
        }),
      ]),
      chokepoints: [],
      articles: [],
    });
    expect(columns.predictions[0]?.title).toBe('US invade Iran before 2027?');
  });

  it('restores words omitted by a compact pipeline label', () => {
    const columns = buildInstrumentCards({
      trends: snapshot([
        indicator({
          id: 'poly-fed',
          label: 'Will there be no change in Fed interest rates…',
          seriesId:
            'will-there-be-no-change-in-fed-interest-rates-after-the-september-2026-meeting-615',
          source: 'polymarket',
          unit: '%',
        }),
        indicator({
          id: 'poly-lula',
          label: 'Will Luiz Inácio Lula da Silva win the 2026…',
          seriesId: 'will-luiz-incio-lula-da-silva-win-the-2026-brazilian-presidential-election',
          source: 'polymarket',
          unit: '%',
        }),
      ]),
      chokepoints: [],
      articles: [],
    });
    expect(columns.predictions[0]?.title).toBe(
      'Will there be no change in Fed interest rates after the September 2026 meeting?',
    );
    expect(columns.predictions[1]?.title).toBe(
      'Will Luiz Inácio Lula da Silva win the 2026 Brazilian presidential election?',
    );
  });
});
