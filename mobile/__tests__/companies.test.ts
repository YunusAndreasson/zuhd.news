import { windowReference } from '../lib/cards/card-chart';
import { admitted } from '../lib/cards/sections';
import { gaugeMove, WEEK_WINDOW } from '../lib/cards/week-move';
import {
  type Company,
  companyCard,
  companyGauges,
  companyKicker,
  isCompaniesSnapshot,
  sharePrice,
} from '../lib/companies';

const NOW = Date.parse('2026-10-03T12:00:00Z');

/** Forty sessions ending Oct 2: enough for the card's thirty-observation
 *  window and for a week. */
function sessions(last: number, step = 1): { values: number[]; periods: string[] } {
  const values: number[] = [];
  const periods: string[] = [];
  const end = Date.UTC(2026, 9, 2);
  for (let i = 39; i >= 0; i--) {
    const d = new Date(end - i * 86_400_000);
    values.push(Number((last - i * step).toFixed(2)));
    periods.push(
      `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`,
    );
  }
  return { values, periods };
}

function company(over: Partial<Company> = {}): Company {
  return {
    id: 'nvidia',
    name: 'Nvidia',
    about: 'AI chips',
    symbol: 'NVDA',
    iso2: 'US',
    currency: 'USD',
    currencyName: 'US dollars',
    level: 233.95,
    asOf: '2026-10-02',
    sourceLabel: 'Yahoo Finance · NMS',
    blurb: 'Designs the processors most AI models are trained on.',
    series: sessions(233.95),
    relatedArticles: [
      { slug: 'buyback', title: "Nvidia's Record Share Buyback", date: '2026-09-30T10:00:00Z' },
    ],
    ...over,
  };
}

describe('sharePrice', () => {
  it('puts the dollar and the euro before the number, where they mean one currency', () => {
    expect(sharePrice(233.95, 'USD', 'US dollars')).toEqual({
      reading: '$233.95',
      note: 'a share',
      unit: '',
    });
    expect(sharePrice(1653, 'EUR', 'euros')).toEqual({
      reading: '€1,653',
      note: 'a share',
      unit: '',
    });
  });

  it('names every other currency in words under the number', () => {
    // A bare `$2,500` for a Taiwan share would read as US dollars.
    expect(sharePrice(2500, 'TWD', 'Taiwan dollars')).toEqual({
      reading: '2,500',
      note: 'Taiwan dollars a share',
      unit: 'Taiwan dollars',
    });
    expect(sharePrice(25.28, 'SAR', 'Saudi riyals')).toEqual({
      reading: '25.28',
      note: 'Saudi riyals a share',
      unit: 'Saudi riyals',
    });
    expect(sharePrice(1_841_000, 'KRW', 'Korean won').reading).toBe('1,841,000');
  });

  it('keeps cents below a thousand and drops them above', () => {
    expect(sharePrice(104.2, 'USD', 'US dollars').reading).toBe('$104.20');
    expect(sharePrice(1074.89, 'USD', 'US dollars').reading).toBe('$1,075');
  });

  it('falls back to the code for a currency with no name', () => {
    expect(sharePrice(12, 'XYZ', '').note).toBe('XYZ a share');
  });
});

describe('companyCard', () => {
  it('says what the company is and where, never a ticker', () => {
    const card = companyCard(company());
    expect(card.id).toBe('co:nvidia');
    expect(card.title).toBe('Nvidia');
    expect(card.kicker).toBe('AI chips · US');
    expect(`${card.title} ${card.kicker}`).not.toContain('NVDA');
    expect(companyKicker({ about: 'chip manufacturing', iso2: 'TW' })).toBe(
      'chip manufacturing · Taiwan',
    );
    // A country the atlas cannot name leaves the line as what the company does.
    expect(companyKicker({ about: 'retail', iso2: 'ZZ' })).toBe('retail');
  });

  it('prints the close and its day', () => {
    const card = companyCard(company());
    expect(card.reading).toBe('$233.95');
    expect(card.readingNote).toBe('a share');
    expect(card.asOf).toBe('2026-10-02');
  });

  it('passes the deck gate on the catalog sentence', () => {
    const card = companyCard(company());
    expect(card.why).toBe('Designs the processors most AI models are trained on.');
    expect(admitted(card)).toBe(true);
    // No paragraph, no card: the list does not print a bare chart.
    expect(admitted(companyCard(company({ blurb: '' })))).toBe(false);
  });

  it('leads with the account of the move, and falls back to what the company is', () => {
    const told = companyCard(company({ recent: 'It authorised a record buyback.' }));
    expect(told.why).toBe('It authorised a record buyback.');
    // One of them, never both: the kicker already says what the company does.
    expect(told.why).not.toContain('Designs the processors');
    // Absent or blank, the card still has a paragraph, so it stays in the list.
    for (const recent of [undefined, '', '   ']) {
      const quiet = companyCard(company({ recent }));
      expect(quiet.why).toBe('Designs the processors most AI models are trained on.');
      expect(admitted(quiet)).toBe(true);
    }
  });

  it('measures thirty sessions, and the chart can draw where that started', () => {
    const card = companyCard(company());
    if (card.kind !== 'reading' || !card.series) throw new Error('expected a reading');
    const from = card.series.periods[card.series.periods.length - 31];
    expect(card.delta?.direction).toBe('up');
    expect(card.delta?.window).toBe(`since ${from}`);
    expect(windowReference(card.series, card.delta)).toEqual({
      value: card.series.values[card.series.values.length - 31],
      label: `since ${from}`,
    });
  });

  it('has the week the list sorts on', () => {
    // 233.95 against the close seven days before it, five steps down.
    const week = gaugeMove(companyCard(company()), NOW);
    expect(week?.delta.window).toBe(WEEK_WINDOW);
    expect(week?.delta.direction).toBe('up');
  });

  it('lists the stories about it, and marks them on the line', () => {
    const card = companyCard(company());
    expect(card.cited?.map((a) => a.slug)).toEqual(['buyback']);
    expect(card.related).toBe(card.cited);
  });

  it('says when the quote is old', () => {
    expect(companyCard(company()).changed).toBeUndefined();
    expect(companyCard(company({ stale: true })).changed).toMatch(/Older quote/);
  });

  it('charts in the share’s own currency', () => {
    const usd = companyCard(company());
    const twd = companyCard(company({ currency: 'TWD', currencyName: 'Taiwan dollars' }));
    if (usd.kind !== 'reading' || twd.kind !== 'reading') throw new Error('expected readings');
    expect(usd.series?.unit).toBe('$');
    expect(usd.series?.label).toBe('Share price, US dollars');
    expect(twd.series?.unit).toBe('TWD');
  });
});

describe('companyGauges', () => {
  it('makes a gauge of every company with a fresh quote', () => {
    const gauges = companyGauges([company(), company({ id: 'apple', name: 'Apple' })], NOW);
    expect(gauges.map((c) => c.id)).toEqual(['co:nvidia', 'co:apple']);
  });

  it('leaves out a company whose quote is old: its week is not this week', () => {
    const flagged = company({ id: 'flagged', stale: true });
    const silent = company({ id: 'silent', asOf: '2026-09-20' });
    expect(companyGauges([flagged, silent, company()], NOW).map((c) => c.id)).toEqual([
      'co:nvidia',
    ]);
  });
});

describe('isCompaniesSnapshot', () => {
  const good = () => ({ generated: '2026-10-03T05:00:00.000Z', companies: [company()] });

  it('accepts the published shape', () => {
    expect(isCompaniesSnapshot(good())).toBe(true);
    expect(isCompaniesSnapshot({ generated: '2026-10-03T05:00:00.000Z', companies: [] })).toBe(
      true,
    );
  });

  it('accepts a company with the desk\u2019s account, and one without', () => {
    expect(
      isCompaniesSnapshot({ ...good(), companies: [company({ recent: 'It rose on orders.' })] }),
    ).toBe(true);
    expect('recent' in company()).toBe(false);
  });

  it('accepts a company with no stories', () => {
    const { relatedArticles: _stories, ...bare } = company();
    expect(isCompaniesSnapshot({ ...good(), companies: [bare] })).toBe(true);
  });

  it.each([
    ['no stamp', { companies: [] }],
    ['a stamp that is not a time', { generated: 'soon', companies: [] }],
    ['companies that are not a list', { generated: '2026-10-03T05:00:00Z', companies: {} }],
    ['a missing name', { ...good(), companies: [{ ...company(), name: '' }] }],
    ['a missing currency name', { ...good(), companies: [{ ...company(), currencyName: 3 }] }],
    ['a price of nothing', { ...good(), companies: [{ ...company(), level: 0 }] }],
    ['a day that is not one', { ...good(), companies: [{ ...company(), asOf: 'yesterday' }] }],
    ['an account that is not text', { ...good(), companies: [{ ...company(), recent: 3 }] }],
    [
      'a series whose halves differ in length',
      { ...good(), companies: [{ ...company(), series: { values: [1, 2], periods: ['Oct 1'] } }] },
    ],
    [
      'a close that is not a number',
      {
        ...good(),
        companies: [{ ...company(), series: { values: [1, null], periods: ['a', 'b'] } }],
      },
    ],
    ['one company twice', { ...good(), companies: [company(), company()] }],
    [
      'a story with no slug',
      { ...good(), companies: [{ ...company(), relatedArticles: [{ title: 'x' }] }] },
    ],
  ])('refuses %s', (_name, payload) => {
    expect(isCompaniesSnapshot(payload)).toBe(false);
  });
});
