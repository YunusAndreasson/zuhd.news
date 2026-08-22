import type {
  Chokepoint,
  ConflictSnapshot,
  GdacsSnapshot,
  Indicator,
  IpcSnapshot,
  TrendsSnapshot,
} from '@shared/types';
import { buildConditionCards } from '../lib/cards/conditions';
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

/** Every card built from a calendar of `events`, against a fixed clock. The
 *  horizon gate is ten days, so 22 August sees 26 August and not 16 September. */
function calendarCards(events: { id: string; title: string; date: string }[]): Card[] {
  return allOf(
    buildInstrumentCards({
      trends: snapshot([indicator({ id: 'brent' })], {
        events: events.map((e) => ({
          ...e,
          institution: 'Fed',
          kind: 'central-bank' as const,
        })),
      }),
      chokepoints: [],
      articles: [],
      now: new Date('2026-08-22T00:00:00Z'),
    }),
  );
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
    expect(Object.keys(columns).sort()).toEqual(['commodities', 'money', 'outlook']);
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
    // What things cost: the threshold first, then what is eaten and burned,
    // then the ratio that is a curiosity rather than a Tuesday reading.
    expect(columns.commodities.map((c) => c.id)).toEqual(['nisab', 'brent', 'metals']);
    // What money is worth: the table, then the currencies whose rows were the
    // news, then borrowing, then the two coins. All three currencies move 10%
    // on the fixture, so all three clear the mover threshold and the limit is
    // what picks two.
    expect(columns.money.map((c) => c.id)).toEqual([
      'currencies',
      'fx-rub-mover',
      'fx-jpy-mover',
      'btc',
    ]);
    // What is not yet a fact.
    expect(columns.outlook.map((c) => c.id)).toEqual(['poly-x']);
    // A price is not an expectation and a coin is not a price. These three crossings
    // are the ones the old asset-class split got wrong in both directions.
    expect(columns.commodities.map((c) => c.id)).not.toContain('btc');
    expect(columns.money.map((c) => c.id)).not.toContain('brent');
    expect(columns.outlook.map((c) => c.id)).not.toContain('nisab');
  });

  it('files the two implied numbers under outlook, not beside the measured ones', () => {
    const wiki = (id: string, values: number[]) =>
      indicator({
        id: `wiki-${id}`,
        label: `${id} — Wikipedia views`,
        source: 'wikipedia',
        values,
      });
    const columns = buildInstrumentCards({
      trends: snapshot([
        indicator({ id: 'vix', label: 'VIX', unit: 'index' }),
        indicator({ id: 'us-10y', label: 'US 10y Treasury', unit: '%' }),
        wiki('iran', [100, 100, 100, 170]),
        wiki('russia', [100, 100, 100, 90]),
        wiki('china', [100, 100, 100, 105]),
      ]),
      chokepoints: [],
      articles: [],
    });
    // VIX is what traders are paying to insure against a fall and attention is
    // what people looked up. Neither is a measurement of anything that
    // happened, which is the whole line `outlook` is drawn along — and it is
    // the line the app already used to cut the S&P and the NASDAQ.
    expect(columns.outlook.map((c) => c.id)).toEqual(['attention', 'vix']);
    expect(columns.money.map((c) => c.id)).toEqual(['us-10y']);
    // The kicker carries the argument, so a reader meets it without reading
    // this file.
    expect(find(columns.outlook, 'vix')?.kicker).toBe('what traders fear');
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
    expect(find(columns.commodities, 'strait-kerch')?.lead).toBe(true);
    expect(find(columns.commodities, 'nisab')?.lead).toBeUndefined();
    expect(find(columns.commodities, 'metals')?.lead).toBeUndefined();
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
    expect(card?.why).toContain('85');
    expect(card?.why).toContain('595');
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
          // The comparison card needs at least three rows to be a comparison.
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
    const fx = find(cards, 'currencies');
    // The row quotes the *currency*, not its rate. The ruble's rate rose 6.8%,
    // which is the ruble itself falling 6.4% — the exact reciprocal, not the
    // negated percentage. Quoting the rate printed "+6.8%" in rose, a plus
    // sign coloured as bad news, which is a card arguing with itself.
    expect(fx?.kind === 'comparison' ? fx.rows[0]?.value : '').toBe('−6.4%');
    // Sign and colour now agree: a minus is rose, a plus is sage.
    expect(fx?.kind === 'comparison' ? fx.rows[0]?.tone : '').toBe('unfavorable');
    expect(fx?.kind === 'comparison' ? fx.rows.at(-1)?.value?.startsWith('+') : false).toBe(true);
    expect(fx?.kind === 'comparison' ? fx.rows.at(-1)?.tone : '').toBe('favorable');
    expect(fx?.reading).toBe('2 of 3');

    // The card that follows says the same thing about the same currency, and
    // says the word — a caret pointing down beside a reading of 82 rubles to
    // the dollar needs something on the line naming what fell.
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
    expect(belief?.changed).toContain('As low as 26%');
    expect(belief?.changed).toContain('as high as 86%');
  });

  it('leaves nothing on screen in the colour of the label text beside it', () => {
    // The goal, as an invariant rather than as a screenshot: every move the
    // app shows is in the colour channel, and the ones it will not editorialise
    // over say so in slate. Before this, brent/us-10y/vix and the FX table
    // carried sage and rose and everything else — crypto, both ratios, nisab,
    // attention, every prediction, a strait at its normal — sat in near-white,
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
        // Below the noise floor: a tenth of a per cent in a month is the rate
        // ticking, not the currency moving.
        indicator({
          id: 'fx-gbp',
          label: 'Pound sterling',
          source: 'oer',
          values: [0.78, 0.7802],
          countryTags: ['GB'],
        }),
        indicator({ id: 'poly-x', label: 'Something?', source: 'polymarket', unit: '%' }),
        indicator({
          id: 'wiki-a',
          label: 'A — Wikipedia views',
          source: 'wikipedia',
          values: [10, 10, 10, 14],
        }),
        indicator({
          id: 'wiki-b',
          label: 'B — Wikipedia views',
          source: 'wikipedia',
          values: [10, 10, 10, 7],
        }),
        indicator({
          id: 'wiki-c',
          label: 'C — Wikipedia views',
          source: 'wikipedia',
          values: [10, 10, 10, 10],
        }),
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
      // A comparison row prints a move too, and an untinted pill is the same
      // gap in the same channel.
      if (card.kind === 'comparison') {
        for (const row of card.rows) {
          expect(row.tone).toBeDefined();
        }
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

    // The pound moved a fifth of a per cent, which is nothing — slate rather
    // than the sage that would claim a reader gained something.
    const fx = cards.find((c) => c.id === 'currencies');
    const gbp = fx?.kind === 'comparison' ? fx.rows.find((r) => r.cc === 'GB') : undefined;
    expect(gbp?.tone).toBe('neutral');
  });

  it('picks the strait that moved furthest from its own baseline, not the busiest', () => {
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
    // It leads `commodities` — freight that has stopped moving is a price story
    // before it is anything else.
    const columns = buildInstrumentCards({
      trends: snapshot([indicator({ id: 'brent' })]),
      chokepoints: [
        strait('dover', 'Dover Strait', 157, 162.2, -0.032),
        strait('kerch', 'Kerch Strait', 0.9, 8.8, -0.902),
        strait('hormuz', 'Strait of Hormuz', 1, 3.9, -0.741),
      ],
      articles: [],
    });
    expect(columns.commodities[0]?.id).toBe('strait-kerch');
    // The eleven-strait comparison table is gone. The globe on `news` draws
    // all eleven as tappable rings and `ChokepointSheet` says more about any
    // of them than a flat sorted list of the same names could.
    expect(find(cards, 'straits')).toBeUndefined();
  });

  it('ships no strait at all on a week when none of them went quiet', () => {
    // Every one of these is inside its own normal — day-to-day variation in
    // busy waterways, which is weather. Ranked without a gate one of them
    // still wins and ships daily, which is how a card becomes furniture.
    const cards = allOf(
      buildInstrumentCards({
        trends: snapshot([indicator({ id: 'brent' })]),
        chokepoints: [
          strait('dover', 'Dover Strait', 157, 162.2, -0.032),
          strait('suez', 'Suez Canal', 51, 50.5, 0.009),
          // Busy, not quiet — and well past the threshold. The gate is
          // one-sided on purpose: traffic rerouted *to* a strait is the same
          // disruption seen from the other end, and the app names the squeeze
          // rather than the detour.
          strait('taiwan', 'Taiwan Strait', 90, 80.5, 0.118),
        ],
        articles: [],
      }),
    );
    expect(cards.filter((c) => c.id.startsWith('strait-'))).toEqual([]);
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
    expect(card?.whatItIs).toBe(blurb);
    expect(card?.why).toBe('Traffic has fallen to zero.');
  });

  it('shows only events still ahead of today', () => {
    const cards = calendarCards([
      { id: 'past', title: 'US CPI', date: '2026-08-12' },
      { id: 'next', title: 'FOMC', date: '2026-08-26' },
    ]);
    const calendar = find(cards, 'calendar');
    const labels = calendar?.kind === 'condition' ? calendar.figures?.map((f) => f.value) : [];
    expect(labels).toEqual(['FOMC']);
    expect(calendar?.kind === 'condition' ? calendar.figures?.[0]?.label : '').toBe('26 Aug');
  });

  it('says nothing at all when the next release is still weeks away', () => {
    // The live file has a 34-day gap between the 5 November Bank of England
    // decision and the 9 December FOMC. Ungated the card printed the same four
    // lines every morning across it, which is the furniture failure the
    // freshness gates in `conditions.ts` exist to prevent, reached from the
    // other direction: not too old to be news, too far ahead to be.
    expect(
      find(calendarCards([{ id: 'far', title: 'FOMC', date: '2026-09-16' }]), 'calendar'),
    ).toBeUndefined();
  });

  it('never falls back to printing events that have already happened', () => {
    // The old fallback showed the first four entries whatever their dates
    // whenever nothing was upcoming — so on a quiet day the card about the
    // future was a list of the past.
    expect(
      find(calendarCards([{ id: 'past', title: 'US CPI', date: '2026-08-12' }]), 'calendar'),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// conditions
// ---------------------------------------------------------------------------

const ipcArea = (iso2: string, p3plus: number, p4 = 0, p5 = 0, ageDays = 30) => ({
  id: `${iso2}:area`,
  area: 'area',
  level1: '',
  iso3: `${iso2}X`,
  iso2,
  phase: 4 as const,
  phaseName: 'Emergency',
  lat: 0,
  lng: 0,
  vintage: 'Jun 2026',
  ageMonths: ageDays / 30,
  from: daysAgo(ageDays),
  to: daysAgo(0),
  pop: { total: p3plus * 2, p3plus, p4, p5 },
});

const ipcSnapshot = (areas: ReturnType<typeof ipcArea>[]): IpcSnapshot => ({
  generated: '2026-08-22',
  source: 'IPC via HDX',
  license: 'CC0-1.0',
  ageLimitMonths: 12,
  countries: [...new Set(areas.map((a) => a.iso3))],
  areas,
});

// A fixed "today" for the freshness gates. Every conditions fixture below
// dates itself relative to this rather than to the wall clock.
const TODAY = new Date('2026-08-22T00:00:00Z');
const daysAgo = (n: number) =>
  new Date(TODAY.getTime() - n * 86_400_000).toISOString().slice(0, 10);

const emptyInputs = {
  ipc: null,
  conflict: null,
  gdacsAlerts: [],
  determinations: [],
  now: TODAY,
};

describe('buildConditionCards', () => {
  it('builds nothing from nothing', () => {
    expect(buildConditionCards(emptyInputs)).toEqual([]);
  });

  it('sums p3plus without double-counting the phase 4 and 5 tails inside it', () => {
    // 4M at phase 4 and 134k at phase 5 are already part of the 10M figure.
    // Adding them would invent four million hungry people.
    const cards = buildConditionCards({
      ...emptyInputs,
      ipc: ipcSnapshot([
        ipcArea('SD', 6_168_596, 2_426_675, 134_808),
        ipcArea('SO', 2_695_810, 1_098_504),
      ]),
    });
    const famine = find(cards, 'famine');
    expect(famine?.reading).toBe('8,864,406');
    // The phase-3 total is the reading, so the rows are only the tails inside
    // it — printing it twice would be the same fact on the same screen.
    const figures = famine?.kind === 'condition' ? famine.figures : [];
    expect(figures?.map((f) => f.value)).toEqual(['3,525,179', '134,808']);
  });

  it('names the country in the phase 5 line rather than printing a code', () => {
    const cards = buildConditionCards({
      ...emptyInputs,
      ipc: ipcSnapshot([ipcArea('SD', 6_168_596, 0, 134_808), ipcArea('SO', 100)]),
    });
    const famine = find(cards, 'famine');
    expect(famine?.changed).toContain('Sudan');
    expect(famine?.changed).not.toContain('SD');
    const figures = famine?.kind === 'condition' ? famine.figures : [];
    expect(figures?.at(-1)?.note).toBe('all in Sudan');
  });

  it('teaches the phase scale, because the number is meaningless without it', () => {
    const cards = buildConditionCards({ ...emptyInputs, ipc: ipcSnapshot([ipcArea('SD', 10)]) });
    expect(find(cards, 'famine')?.why).toContain('4 · Emergency');
  });

  it('says out loud that the conflict window is not live', () => {
    const conflict: ConflictSnapshot = {
      generated: '2026-08-22',
      windowStart: daysAgo(21),
      windowEnd: daysAgo(15),
      events: [
        {
          id: '1',
          eventDate: '2026-03-26',
          family: 'kinetic',
          subEvent: 'armed_clash',
          actor1: 'A',
          country: 'Ukraine',
          iso3: 'UKR',
          location: 'x',
          lat: 0,
          lng: 0,
          fatalities: 900,
          notes: '',
          source: 'UCDP',
        },
        {
          id: '2',
          eventDate: '2026-03-27',
          family: 'kinetic',
          subEvent: 'armed_clash',
          actor1: 'B',
          country: 'Lebanon',
          iso3: 'LBN',
          location: 'y',
          lat: 0,
          lng: 0,
          fatalities: 19,
          notes: '',
          source: 'UCDP',
        },
      ],
    };
    const card = find(buildConditionCards({ ...emptyInputs, conflict }), 'conflict');
    expect(card?.reading).toBe('919');
    expect(card?.changed).toContain('August 2026');
    expect(card?.changed).toContain('Nothing here is live');
    // The lag is stated as a measured number, so it cannot contradict the
    // window it sits next to.
    expect(card?.changed).toContain('15 days after it closed');
  });

  it('leads the hazard card with the ratio, which is the whole point of it', () => {
    const alert = (eventid: string, alertlevel: 'Green' | 'Orange' | 'Red', modAgo = 1) =>
      ({
        eventid,
        eventtype: 'EQ',
        alertlevel,
        name: 'quake',
        country: 'X',
        iso3: 'XXX',
        affectedCountries: [],
        lat: 0,
        lng: 0,
        fromDate: daysAgo(3),
        toDate: null,
        modifiedDate: daysAgo(modAgo),
        severityText: '',
        severityValue: null,
        severityUnit: '',
        description: '',
        source: '',
        reportUrl: null,
      }) as GdacsSnapshot['alerts'][number];
    const gdacsAlerts = [alert('a', 'Green'), alert('b', 'Green'), alert('c', 'Orange')];
    const card = find(buildConditionCards({ ...emptyInputs, gdacsAlerts }), 'disasters');
    expect(card?.reading).toBe('3');
    expect(card?.changed).toContain('1 of 3 is above Green');
  });

  it('carries the body and the document, because the citation is the claim', () => {
    const cards = buildConditionCards({
      ...emptyInputs,
      determinations: [
        {
          id: 'gaza',
          name: 'Gaza',
          iso2: 'PS',
          profile: 'Palestine',
          lat: 31.42,
          lng: 34.36,
          finding: 'determination',
          body: 'UN Independent International Commission of Inquiry',
          document: 'Report to the Human Rights Council, A/HRC/60/CRP.3',
          date: daysAgo(10),
          summary: 'The Commission concluded that genocide is being committed in Gaza.',
          url: 'https://example.org',
          since: '2023-10',
        },
      ],
    });
    const card = find(cards, 'determinations');
    expect(card?.title).toBe('Gaza');
    expect(card?.kind === 'condition' ? card.attribution?.document : '').toContain(
      'A/HRC/60/CRP.3',
    );
    expect(card?.kind === 'condition' ? card.emphasis : '').toBe('determination');
    // The body goes in `changed`; the date and symbol are the figure rows, so
    // neither appears twice on one screen.
    expect(card?.changed).toContain('UN Independent International Commission of Inquiry');
    expect(card?.changed).not.toContain('12 August 2026');
    const rows = card?.kind === 'condition' ? card.figures : [];
    expect(rows?.[0]?.value).toBe('12 August 2026');
  });

  it('omits the determination card entirely when nothing was fetched', () => {
    // The network-only hook returns [] on a launch that never reached the
    // server. No card is the correct outcome; a cached one is not.
    expect(find(buildConditionCards(emptyInputs), 'determinations')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Freshness gates — the reason `conditions` is no longer a section
// ---------------------------------------------------------------------------

describe('buildConditionCards freshness gates', () => {
  it('marks every card it does ship, because every one of them is gated', () => {
    // The gate and the mark are the same claim. A card here is on screen
    // because its data is new, and `lead` is how the reader is told that
    // without having to already know which cards the app gates.
    const cards = buildConditionCards({ ...emptyInputs, determinations: [determination(20)] });
    expect(cards).toHaveLength(1);
    expect(cards.every((c) => c.lead === true)).toBe(true);
  });

  const determination = (ageDays: number) => ({
    id: 'gaza',
    name: 'Gaza',
    iso2: 'PS',
    profile: 'Palestine',
    lat: 31.42,
    lng: 34.36,
    finding: 'determination' as const,
    body: 'UN Independent International Commission of Inquiry',
    document: 'A/HRC/60/CRP.3',
    date: daysAgo(ageDays),
    summary: 'The Commission concluded that genocide is being committed in Gaza.',
    url: 'https://example.org',
    since: '2023-10',
  });

  it('drops a determination that is no longer new — the finding stands, the screen does not', () => {
    // Rakhine's finding was 2,902 days old on the day this gate was written.
    expect(
      find(
        buildConditionCards({ ...emptyInputs, determinations: [determination(2902)] }),
        'determinations',
      ),
    ).toBeUndefined();
    expect(
      find(
        buildConditionCards({ ...emptyInputs, determinations: [determination(341)] }),
        'determinations',
      ),
    ).toBeUndefined();
  });

  it('leads with a determination published this season', () => {
    const cards = buildConditionCards({ ...emptyInputs, determinations: [determination(20)] });
    expect(cards[0]?.id).toBe('determinations');
  });

  it('drops a famine analysis measured in months', () => {
    // The median analysed area was 7.3 months old when this gate was written.
    expect(
      find(
        buildConditionCards({ ...emptyInputs, ipc: ipcSnapshot([ipcArea('SD', 10, 0, 0, 220)]) }),
        'famine',
      ),
    ).toBeUndefined();
    expect(
      find(
        buildConditionCards({ ...emptyInputs, ipc: ipcSnapshot([ipcArea('SD', 10, 0, 0, 30)]) }),
        'famine',
      ),
    ).toBeDefined();
  });

  it('gates on the newest analysis in the file, not on when the file was built', () => {
    // One fresh national analysis among many stale ones is still news.
    const mixed = ipcSnapshot([ipcArea('SD', 10, 0, 0, 220), ipcArea('SO', 5, 0, 0, 20)]);
    expect(find(buildConditionCards({ ...emptyInputs, ipc: mixed }), 'famine')).toBeDefined();
  });

  it('drops a conflict window that upstream has not caught up to', () => {
    const stale: ConflictSnapshot = {
      generated: daysAgo(0),
      windowStart: daysAgo(151),
      windowEnd: daysAgo(145),
      events: [
        {
          id: '1',
          eventDate: daysAgo(150),
          family: 'kinetic',
          subEvent: 'armed_clash',
          actor1: 'A',
          country: 'Ukraine',
          iso3: 'UKR',
          location: 'x',
          lat: 0,
          lng: 0,
          fatalities: 9,
          notes: '',
          source: 'UCDP',
        },
      ],
    };
    expect(
      find(buildConditionCards({ ...emptyInputs, conflict: stale }), 'conflict'),
    ).toBeUndefined();
  });

  it('ships the hazard tally only when something is escalated and being revised', () => {
    const alert = (eventid: string, alertlevel: 'Green' | 'Orange', modAgo: number) =>
      ({
        eventid,
        eventtype: 'EQ',
        alertlevel,
        name: 'quake',
        country: 'X',
        iso3: 'XXX',
        affectedCountries: [],
        lat: 0,
        lng: 0,
        fromDate: daysAgo(20),
        toDate: null,
        modifiedDate: daysAgo(modAgo),
        severityText: '',
        severityValue: null,
        severityUnit: '',
        description: '',
        source: '',
        reportUrl: null,
      }) as GdacsSnapshot['alerts'][number];

    // All Green — a true sentence, and the same true sentence every morning.
    expect(
      find(
        buildConditionCards({ ...emptyInputs, gdacsAlerts: [alert('a', 'Green', 1)] }),
        'disasters',
      ),
    ).toBeUndefined();
    // Escalated but nobody has touched it in a fortnight.
    expect(
      find(
        buildConditionCards({ ...emptyInputs, gdacsAlerts: [alert('b', 'Orange', 12)] }),
        'disasters',
      ),
    ).toBeUndefined();
    // Escalated and live.
    expect(
      find(
        buildConditionCards({ ...emptyInputs, gdacsAlerts: [alert('c', 'Orange', 1)] }),
        'disasters',
      ),
    ).toBeDefined();
  });

  it('returns nothing at all on an ordinary day, and that is the expected result', () => {
    const ordinary = buildConditionCards({
      ...emptyInputs,
      ipc: ipcSnapshot([ipcArea('SD', 6_000_000, 0, 0, 220)]),
      determinations: [determination(341)],
      gdacsAlerts: [],
    });
    expect(ordinary).toEqual([]);
  });
});

describe('one definition per screen', () => {
  it('drops the hand-written part two whenever the pipeline has written a part four', () => {
    // The guard this replaced compared the first twenty-five characters, and
    // brent, us-10y and vix all slipped past it by a word — so every reading
    // card in the app was carrying two definitions of the same thing,
    // separated by a chart. The rule is structural now: `standing` is
    // authoritative, exactly as `types.ts` always said it was.
    const columns = buildInstrumentCards({
      trends: snapshot([
        indicator({
          id: 'btc',
          label: 'Bitcoin',
          unit: '$',
          // Says nothing the local sentence says, and is still the one that
          // survives — because deciding that by string comparison is what
          // failed.
          standing: 'Its price sets the tone for the rest of the digital-asset market.',
        }),
      ]),
      chokepoints: [],
      articles: [],
    });
    const btc = columns.money[0];
    expect(btc?.whatItIs).toBeUndefined();
    expect(btc?.why).toContain('sets the tone');
  });

  it('falls back to the hand-written sentence for an indicator with no standing', () => {
    const columns = buildInstrumentCards({
      trends: snapshot([indicator({ id: 'btc', label: 'Bitcoin', unit: '$' })]),
      chokepoints: [],
      articles: [],
    });
    expect(columns.money[0]?.whatItIs).toContain('no state issues');
    expect(columns.money[0]?.why).toBeUndefined();
  });

  it('explains what a prediction contract is once per column, not once per card', () => {
    // Three cards deep, and the explainer is the same 200 characters on each —
    // a reader met it three times in under a minute while two of the three
    // cards had no `standing` and so nothing else to say.
    const columns = buildInstrumentCards({
      trends: snapshot([
        indicator({ id: 'poly-a', label: 'A?', source: 'polymarket', unit: '%' }),
        indicator({ id: 'poly-b', label: 'B?', source: 'polymarket', unit: '%' }),
        indicator({ id: 'poly-c', label: 'C?', source: 'polymarket', unit: '%' }),
      ]),
      chokepoints: [],
      articles: [],
    });
    expect(columns.outlook).toHaveLength(3);
    expect(columns.outlook[0]?.whatItIs).toContain('pays out if this happens');
    expect(columns.outlook[1]?.whatItIs).toBeUndefined();
    expect(columns.outlook[2]?.whatItIs).toBeUndefined();
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
    expect(columns.outlook[0]?.title).toBe('US invade Iran before 2027?');
  });
});
