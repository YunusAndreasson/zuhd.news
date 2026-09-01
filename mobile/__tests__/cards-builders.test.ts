import type { Chokepoint, Indicator, TrendsSnapshot } from '@shared/types';
import {
  type AnalysisById,
  buildInstrumentCards,
  type InstrumentCardInputs,
  type InstrumentColumns,
} from '../lib/cards/markets';
import { buildSwipeSections } from '../lib/cards/sections';
import type { Card } from '../lib/cards/types';

/** `analysis` defaults to empty, which is the state a build older than
 *  `/api/analysis.json` produces and the one most of these assertions want:
 *  every card falls back to its standing definition. Tests about the day's
 *  movement analysis pass their own map. */
const build = (
  input: Omit<InstrumentCardInputs, 'analysis'> & { analysis?: AnalysisById },
): InstrumentColumns => buildInstrumentCards({ analysis: new Map(), ...input });

/** One instrument's `recent`, in the shape `/api/analysis.json` delivers. */
const analysisOf = (entries: Record<string, string>): AnalysisById =>
  new Map(Object.entries(entries).map(([id, recent]) => [id, { recent }]));

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
    const columns = build({ trends: null, chokepoints: [], articles: [] });
    expect(allOf(columns)).toEqual([]);
    // Every key still present, so a section renders its empty state rather
    // than crashing on an undefined column.
    expect(Object.keys(columns).sort()).toEqual(['markets', 'predictions', 'scheduled', 'straits']);
  });

  it('files each card in the column a reader would go looking for it in', () => {
    const columns = build({
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
    const columns = build({
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
    const kerch = strait('kerch', 'Kerch Strait', 0.9, 8.8, -0.902);
    kerch.asOf = '2026-08-29';
    const columns = build({
      trends: snapshot([
        indicator({ id: 'paxg', label: 'Gold', unit: '$/oz', values: [4110, 4352.19] }),
        indicator({ id: 'xag', label: 'Silver', unit: '$/oz', values: [57.8, 52.56] }),
      ]),
      chokepoints: [kerch],
      articles: [],
      now: new Date('2026-09-01T12:00:00Z'),
    });
    // The strait is here because it went quiet this week; the nisab is here
    // every day. Until the mark existed both arrived in identical weight.
    expect(find(columns.straits, 'strait-kerch')?.lead).toBe(true);
    expect(find(columns.markets, 'nisab')?.lead).toBeUndefined();
    expect(find(columns.markets, 'metals')?.lead).toBeUndefined();
  });

  it('names every observation and does not call an old disruption current', () => {
    const oldKerch = strait('kerch', 'Kerch Strait', 0.9, 8.8, -0.902);
    oldKerch.asOf = '2026-08-23';
    const trends = snapshot([
      indicator({
        id: 'brent',
        label: 'Brent crude',
        unit: '$/bbl',
        asOf: '2026-08-25',
      }),
    ]);
    const columns = build({
      trends,
      chokepoints: [oldKerch],
      articles: [],
      now: new Date('2026-09-01T12:00:00Z'),
    });
    expect(find(columns.markets, 'brent')?.asOf).toBe('2026-08-25');
    expect(find(columns.straits, 'strait-kerch')).toMatchObject({
      asOf: '2026-08-23',
      lead: false,
    });
  });

  it('drops a card whose data is absent instead of rendering a placeholder', () => {
    const cards = allOf(
      build({
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
      build({
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

  it('renders the desk\u2019s prose verbatim — the app does not rewrite it', () => {
    const standing = 'It moves on supply, and fuel, freight and fertiliser move after it.';
    const recent = 'Brent fell 15.6% in a week as OPEC+ unwound its cuts.';
    const trends = snapshot([indicator({ id: 'brent', label: 'Brent crude', standing })]);
    expect(find(allOf(build({ trends, chokepoints: [], articles: [] })), 'brent')?.why).toBe(
      standing,
    );
    expect(
      find(
        allOf(
          build({ trends, chokepoints: [], articles: [], analysis: analysisOf({ brent: recent }) }),
        ),
        'brent',
      )?.why,
    ).toBe(recent);
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
      build({
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
      build({
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
      build({
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
  });

  it('gives the nisab card the binding metal\u2019s analysis, so it reaches a deck at all', () => {
    const trends = snapshot([
      indicator({ id: 'paxg', label: 'Gold', unit: '$/oz', values: [4110, 4352.19] }),
      indicator({
        id: 'xag',
        label: 'Silver',
        unit: '$/oz',
        values: [57.8, 52.56],
        standing: 'The cheaper of the two metals that can set the threshold.',
      }),
    ]);
    // Silver binds, and silver is what the card charts \u2014 so silver is what it
    // explains. Gold's paragraph would describe a line this card does not draw.
    const card = find(
      allOf(
        build({
          trends,
          chokepoints: [],
          articles: [],
          analysis: analysisOf({
            paxg: 'Gold rose on central-bank buying.',
            xag: 'Silver fell as industrial demand cooled.',
          }),
        }),
      ),
      'nisab',
    );
    expect(card?.why).toBe('Silver fell as industrial demand cooled.');

    // With no analysis at all it falls back to the same metal's definition,
    // which is still enough to clear the deck gate.
    const bare = build({ trends, chokepoints: [], articles: [] });
    expect(find(allOf(bare), 'nisab')?.why).toBe(
      'The cheaper of the two metals that can set the threshold.',
    );
    // The gate is the point: carrying no `why` at all, this card was built and
    // then dropped here, so the column documented as opening with it never did.
    expect(buildSwipeSections(bare, []).markets.map((c) => c.id)).toContain('nisab');
  });

  it('graphs the gold-to-silver ratio that the metals card headlines', () => {
    const cards = allOf(
      build({
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
      build({
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

  it('keeps a slot for the majors, so the euro can reach a screen at all', () => {
    // Measured over twelve consecutive live snapshots the euro never once made
    // the deck: ranked by size it sits behind the pound and the ruble every
    // day, and dropping the bar to 1.2% did not change that because the two
    // slots were already taken. It was structurally unreachable.
    const fx = (id: string, from: number, to: number) =>
      indicator({
        id,
        label: id,
        unit: `${id.slice(3).toUpperCase()} / USD`,
        source: 'oer',
        values: [from, to],
        periods: ['Jul 11', 'Aug 9'],
      });

    const cards = allOf(
      build({
        trends: snapshot([
          fx('fx-egp', 48.0, 50.0), // +4.2% — the basket's largest
          fx('fx-brl', 5.0, 5.16), // +3.2% — second largest, and not a major
          fx('fx-eur', 0.92, 0.9086), // -1.2% — small, but a real month for the euro
        ]),
        chokepoints: [],
        articles: [],
      }),
    );

    // The largest move anywhere, and the largest among the majors. Not first
    // and second place — the brazilian real outranks the euro on size and
    // still does not take the second slot, because that slot is a different
    // question.
    expect(cards.map((c) => c.id)).toEqual(['fx-egp-mover', 'fx-eur-mover']);
    expect(find(cards, 'fx-egp-mover')?.changed).toContain('in this 15-currency set');
    expect(find(cards, 'fx-eur-mover')?.changed).toContain('among the euro, yen and yuan');

    // A major that did not move is not a slot that fills anyway.
    const quiet = allOf(
      build({
        trends: snapshot([fx('fx-egp', 48.0, 50.0), fx('fx-eur', 0.92, 0.9187)]),
        chokepoints: [],
        articles: [],
      }),
    );
    expect(quiet.map((c) => c.id)).toEqual(['fx-egp-mover']);
  });

  it('leaves nothing on screen in the colour of the label text beside it', () => {
    // The goal, as an invariant rather than as a screenshot: every move the
    // app shows is in the colour channel, and the ones it will not editorialise
    // over say so in slate. Before this, brent/us-10y/vix carried sage and rose
    // and everything else — crypto, both ratios, nisab, every prediction, a
    // strait at its normal — sat in near-white,
    // so the reader's first question was whether a chip was coloured at all.
    const columns = build({
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
      build({
        trends: snapshot([indicator({ id: 'brent' })]),
        chokepoints: [
          strait('dover', 'Dover Strait', 157, 162.2, -0.032),
          strait('kerch', 'Kerch Strait', 0.9, 8.8, -0.902),
          strait('hormuz', 'Strait of Hormuz', 1, 3.9, -0.741),
        ],
        articles: [],
        now: new Date('2026-08-04T12:00:00Z'),
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
    const columns = build({
      trends: snapshot([indicator({ id: 'brent' })]),
      chokepoints: [
        strait('dover', 'Dover Strait', 157, 162.2, -0.032),
        strait('kerch', 'Kerch Strait', 0.9, 8.8, -0.902),
        strait('hormuz', 'Strait of Hormuz', 1, 3.9, -0.741),
      ],
      articles: [],
      now: new Date('2026-08-04T12:00:00Z'),
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
      build({
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
    const columns = build({
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
      build({
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

  it('puts the market\u2019s odds on the strait it is about', () => {
    // Two decks were holding half a story: `shipping` charts what traffic has
    // done, `outlook` prices whether the strait is closed by December. Nothing
    // told a reader of either that the other existed.
    const cards = allOf(
      build({
        trends: snapshot([
          indicator({
            id: 'poly-bab',
            label: 'Bab el-Mandeb Strait effectively closed by Dec 31?',
            source: 'polymarket',
            unit: '%',
            values: [12, 18],
          }),
        ]),
        chokepoints: [
          {
            id: 'bab-el-mandeb',
            name: 'Bab el-Mandeb',
            blurb: 'The Red Sea gate.',
            recent: 'Transits stayed low through August.',
            lat: 0,
            lng: 0,
            topicTags: [],
            primaryField: 'n_total',
            last7Avg: { n_total: 20 },
            baseline90Avg: { n_total: 30 },
            delta7vs90: { n_total: -0.33 },
            series: { periods: ['a', 'b'], total: [30, 20] },
            asOf: '2026-08-29',
          },
          // A strait with no market keeps the card it always had.
          {
            id: 'dover',
            name: 'Strait of Dover',
            blurb: 'The Channel narrows.',
            recent: 'Traffic held steady.',
            lat: 0,
            lng: 0,
            topicTags: [],
            primaryField: 'n_total',
            last7Avg: { n_total: 40 },
            baseline90Avg: { n_total: 41 },
            delta7vs90: { n_total: -0.02 },
            series: { periods: ['a', 'b'], total: [41, 40] },
            asOf: '2026-08-29',
          },
        ],
        articles: [],
      }),
    );

    const bab = find(cards, 'strait-bab-el-mandeb');
    expect(bab?.kind === 'reading' ? bab.figures : undefined).toEqual([
      { label: 'Bab el-Mandeb Strait effectively closed by Dec 31?', value: '18%' },
    ]);
    expect(bab?.sourceLabel).toBe('IMF PortWatch \u00b7 Polymarket');

    const dover = find(cards, 'strait-dover');
    expect(dover?.kind === 'reading' ? dover.figures : undefined).toBeUndefined();
    expect(dover?.sourceLabel).toBe('IMF PortWatch');
  });

  it('falls back to the blurb when a strait has no analysis, so it still reaches the deck', () => {
    // Suez, on a live dispatch: `recent` came back empty and `standing` is the
    // catalog blurb, because the narration stage always prefers the
    // hand-written sentence. With nothing under the chart the card is built and
    // then silently dropped by the deck gate \u2014 and the blurb, which appears
    // nowhere else on a card, is real text a reader has not seen.
    const blurb = 'The 120-mile canal carrying about 12% of world trade.';
    const cards = allOf(
      build({
        trends: snapshot([indicator({ id: 'brent' })]),
        chokepoints: [
          {
            id: 'suez',
            name: 'Suez Canal',
            blurb,
            standing: blurb,
            recent: '',
            lat: 0,
            lng: 0,
            topicTags: [],
            primaryField: 'n_total',
            last7Avg: { n_total: 30 },
            baseline90Avg: { n_total: 32 },
            delta7vs90: { n_total: -0.06 },
            series: { periods: ['a', 'b'], total: [32, 30] },
            asOf: '2026-08-02',
          },
        ],
        articles: [],
      }),
    );
    expect(find(cards, 'strait-suez')?.why).toBe(blurb);
  });
});

describe('scheduled events', () => {
  const NOW = new Date('2026-08-29T12:00:00Z');
  const events = (...evs: object[]) =>
    snapshot([indicator({ id: 'brent' })], { events: evs } as never);

  it('carries the dates the outlook column had no way to show', () => {
    // These have had `standing` and `recent` since the events dispatch existed
    // and the website's rail has rendered them all along. The app showed none,
    // because the deck gate asks every card for a graph and a scheduled date
    // has no history — it has a distance.
    const columns = build({
      trends: events(
        {
          id: 'fomc-2026-09',
          title: 'Fed decision',
          institution: 'Federal Reserve',
          kind: 'central-bank',
          date: '2026-09-16',
          standing: 'The committee that sets the US policy rate.',
          recent: 'The meeting follows Warsh\u2019s Jackson Hole debut.',
        },
        {
          id: 'opec-2026-08',
          title: 'OPEC+ meeting',
          institution: 'OPEC+',
          kind: 'opec',
          date: '2026-08-31',
          standing: 'The producers who set the supply quota.',
        },
      ),
      chokepoints: [],
      articles: [],
      now: NOW,
    });

    const sections = buildSwipeSections(columns, []);
    const ids = sections.outlook.map((c) => c.id);
    expect(ids).toContain('event-fomc-2026-09');
    expect(ids).toContain('event-opec-2026-08');

    const fomc = find(columns.scheduled, 'event-fomc-2026-09');
    // The distance is the reading, and the date is the note under it.
    expect(fomc?.reading).toBe('in 3 weeks');
    // The device decides the order, as everywhere else in the app that prints a
    // date, so assert the parts rather than one locale's arrangement of them.
    expect(fomc?.readingNote).toContain('September');
    expect(fomc?.readingNote).toContain('16');
    expect(fomc?.kicker).toBe('Federal Reserve');
    // Same rule as every other card: the day's account first.
    expect(fomc?.why).toContain('Jackson Hole');
    // Two days out is the news, and the card says so.
    expect(find(columns.scheduled, 'event-opec-2026-08')?.lead).toBe(true);
    expect(fomc?.lead).toBe(false);
    // No graph, and no pretence of one.
    expect(fomc?.kind === 'scheduled' ? 'scheduled' : 'other').toBe('scheduled');
  });

  it('graphs the rate the meeting decides, where there is an honest series', () => {
    // A countdown says when; the staircase says from where. 90 days of a policy
    // rate is a flat line — measured on the live series, literally zero changes
    // — so these come in on a two-year window, sampled end-of-period.
    const trends = snapshot(
      [
        indicator({
          id: 'fed-funds',
          label: 'Fed target rate',
          unit: '%',
          cadence: 'monthly',
          values: [5.5, 5.5, 5.0, 4.5, 4.0, 3.75],
          periods: ['Sep 2024', 'Dec 2024', 'Mar 2025', 'Jul 2025', 'Feb 2026', 'Aug 2026'],
        }),
      ],
      {
        events: [
          {
            id: 'fomc-2026-09',
            title: 'Fed decision',
            institution: 'Federal Reserve',
            kind: 'central-bank',
            date: '2026-09-16',
            standing: 'The committee that sets the US policy rate.',
          },
          {
            id: 'boe-2026-09',
            title: 'Bank of England rate decision',
            institution: 'Bank of England',
            kind: 'central-bank',
            date: '2026-09-17',
            standing: 'The committee that sets Bank Rate.',
          },
        ],
      } as never,
    );

    const columns = build({ trends, chokepoints: [], articles: [], now: NOW });
    const fomc = find(columns.scheduled, 'event-fomc-2026-09');
    expect(fomc?.kind === 'scheduled' ? fomc.series?.values : undefined).toEqual([
      5.5, 5.5, 5.0, 4.5, 4.0, 3.75,
    ]);

    // The Bank of England has no current published rate on FRED and the nearest
    // substitute is SONIA, an overnight market rate that is not Bank Rate.
    // Drawing that under this headline would be the graph disagreeing with the
    // title, so the card keeps its countdown and nothing else.
    const boe = find(columns.scheduled, 'event-boe-2026-09');
    expect(boe?.kind === 'scheduled' ? boe.series : undefined).toBeUndefined();
    // Still a full card — the gate asks for analysis, never for a graph.
    expect(buildSwipeSections(columns, []).outlook.map((c) => c.id)).toContain('event-boe-2026-09');
  });

  it('does not admit a date the desk has written nothing about', () => {
    const columns = build({
      trends: events({
        id: 'bare-2026-09',
        title: 'Something happens',
        institution: 'Nobody',
        kind: 'summit-election',
        date: '2026-09-02',
      }),
      chokepoints: [],
      articles: [],
      now: NOW,
    });
    // Built, then refused at the gate — `why` is still mandatory. What the
    // scheduled kind relaxes is the graph, not the analysis.
    expect(columns.scheduled.map((c) => c.id)).toEqual(['event-bare-2026-09']);
    expect(buildSwipeSections(columns, []).outlook.map((c) => c.id)).toEqual([]);
  });

  it('looks ahead a season, not a year, and keeps the nearest few', () => {
    const far = Array.from({ length: 8 }, (_, i) => ({
      id: `ev-${i}`,
      title: `Event ${i}`,
      institution: 'Desk',
      kind: 'econ-release' as const,
      // 2, 4, 6 ... 16 days out, then one past the horizon.
      date: i < 7 ? `2026-09-${String(2 + i * 2).padStart(2, '0')}` : '2026-12-01',
      standing: `What event ${i} settles.`,
    }));
    const columns = build({
      trends: events(...far),
      chokepoints: [],
      articles: [],
      now: NOW,
    });
    expect(columns.scheduled).toHaveLength(4);
    expect(columns.scheduled.map((c) => c.id)).toEqual(
      ['ev-0', 'ev-1', 'ev-2', 'ev-3'].map((x) => `event-${x}`),
    );
  });
});

describe('graph-card context', () => {
  const btcTrends = (standing?: string) =>
    snapshot([indicator({ id: 'btc', label: 'Bitcoin', unit: '$', standing })]);

  it("leads with the day's movement analysis, not the definition", () => {
    const columns = build({
      trends: btcTrends('Its price sets the tone for the rest of the digital-asset market.'),
      chokepoints: [],
      articles: [],
      analysis: analysisOf({ btc: 'The rise to $78,420 tracked the SEC\u2019s crypto rulebook.' }),
    });
    // The reader is looking at a chart that just moved. The definition is a
    // true sentence answering a question nobody asked at that moment.
    expect(columns.markets[0]?.why).toContain('crypto rulebook');
    expect(columns.markets[0]?.why).not.toContain('sets the tone');
  });

  it('falls back to the definition when the desk wrote no analysis today', () => {
    const columns = build({
      trends: btcTrends('Its price sets the tone for the rest of the digital-asset market.'),
      chokepoints: [],
      articles: [],
    });
    expect(columns.markets[0]?.why).toContain('sets the tone');
  });

  it('treats a blank analysis as absent rather than as a value', () => {
    const columns = build({
      trends: btcTrends('Its price sets the tone for the rest of the digital-asset market.'),
      chokepoints: [],
      articles: [],
      analysis: analysisOf({ btc: '   ' }),
    });
    expect(columns.markets[0]?.why).toContain('sets the tone');
  });

  it('leaves analysis absent when the pipeline provided neither', () => {
    const columns = build({ trends: btcTrends(), chokepoints: [], articles: [] });
    expect(columns.markets[0]?.why).toBeUndefined();
  });

  it('explains a prediction market, which only ever had a definition before', () => {
    const columns = build({
      trends: snapshot([
        indicator({
          id: 'poly-iran',
          label: 'US invade Iran before 2027?',
          source: 'polymarket',
          unit: '%',
          values: [16, 17],
          standing: 'A market on whether US forces enter Iran.',
        }),
      ]),
      chokepoints: [],
      articles: [],
      analysis: analysisOf({ 'poly-iran': 'The price rose after the carrier group moved.' }),
    });
    expect(columns.predictions[0]?.why).toBe('The price rose after the carrier group moved.');
  });
});

describe('belief titles', () => {
  it('keeps the question mark — it is what says this is an outcome, not a reading', () => {
    const columns = build({
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
    const columns = build({
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
