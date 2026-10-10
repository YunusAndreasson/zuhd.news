import type { Indicator, TrendEvent, TrendsSnapshot } from '@shared/types';
import { calendarCards } from '../lib/cards/markets';

// A rate decision's card carries the market's contract on it: the question and
// its price, beside the date it is decided on.

const NOW = new Date('2026-10-10T12:00:00Z');

const decision = (over: Partial<TrendEvent> = {}): TrendEvent => ({
  id: 'fomc-2026-10',
  title: 'FOMC rate decision',
  institution: 'Federal Reserve',
  kind: 'central-bank',
  date: '2026-10-28',
  standing: 'The committee that sets the US policy rate.',
  ...over,
});

const contract = (
  label: string,
  price: number,
  endDate: string | null,
  over: Partial<Indicator> = {},
): Indicator =>
  ({
    id: `poly-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label,
    unit: '%',
    source: 'polymarket',
    sourceLabel: 'Polymarket',
    cadence: 'daily',
    values: [price - 2, price],
    periods: ['Oct 9', 'Oct 10'],
    endDate,
    ...over,
  }) as Indicator;

const rate = (id: string): Indicator =>
  ({
    id,
    label: 'Fed target rate',
    unit: '%',
    source: 'fred',
    sourceLabel: 'FRED · Board of Governors',
    cadence: 'monthly',
    values: [3.75, 4],
    periods: ['Aug 2026', 'Sep 2026'],
  }) as Indicator;

const cardFor = (indicators: Indicator[], ev: TrendEvent = decision()) =>
  calendarCards(
    { fetchedAt: '2026-10-10', asOf: '2026-10-10', indicators, events: [ev] } as TrendsSnapshot,
    [],
    NOW,
  )[0];

/** The live contract of 2026-10-10: it closes hours after the decision. */
const HOLD = contract('No change in Fed rates after Oct 2026?', 84, '2026-10-29T03:59:00Z');

describe('the contract on a rate decision', () => {
  it('prints the question and its price, and names the market in the source line', () => {
    const card = cardFor([rate('fed-funds'), HOLD]);
    expect(card?.figures).toEqual([
      { label: 'No change in Fed rates after Oct 2026?', value: '84%' },
    ]);
    expect(card?.sourceLabel).toBe('FRED · Board of Governors · Polymarket');
    // The rest of the card is as it was.
    expect(card).toMatchObject({ title: 'FOMC rate decision', reading: 'in 3 weeks' });
  });

  it('stands with no series under it', () => {
    const card = cardFor([HOLD]);
    expect(card?.figures?.[0]?.value).toBe('84%');
    expect(card?.sourceLabel).toBe('Polymarket');
    expect(card?.series).toBeUndefined();
  });

  it('is this meeting’s: a contract that closes before it, or over a week after, is another’s', () => {
    const december = decision({ id: 'fomc-2026-12', date: '2026-12-09' });
    expect(cardFor([HOLD], december)?.figures).toBeUndefined();
    const early = contract('Fed rates cut before October?', 5, '2026-10-27T23:59:00Z');
    const open = contract('Fed rates above 5% in 2027?', 30, null);
    const late = contract('Fed rates higher by December?', 60, '2026-11-05T00:00:01Z');
    expect(cardFor([early, open, late])?.figures).toBeUndefined();
    // The week's last hour is still inside it.
    const edge = contract('Fed rates higher after October?', 20, '2026-11-04T00:00:00Z');
    expect(cardFor([edge])?.figures?.[0]?.value).toBe('20%');
  });

  it('names the bank and its rates, as whole words', () => {
    const closes = '2026-10-29T03:59:00Z';
    // On the Fed, and not on its rates.
    const chair = contract('Kevin Warsh out as Fed Chair in October?', 3, closes);
    // On rates, and another bank's.
    const ecb = contract('ECB cuts rates in October?', 40, closes);
    // `fed` inside another word, and `rate` inside another.
    const word = contract('Confederation Cup rates a rematch?', 50, closes);
    const inflation = contract('Fed sees inflation accelerate in October?', 50, closes);
    expect(cardFor([chair, ecb, word, inflation])?.figures).toBeUndefined();
    // Each bank is found by its own names.
    const frankfurt = decision({
      id: 'ecb-2026-10',
      institution: 'European Central Bank',
      date: '2026-10-29',
    });
    expect(
      cardFor([contract('ECB cuts rates in October?', 40, '2026-10-30T10:00:00Z')], frankfurt)
        ?.figures?.[0]?.value,
    ).toBe('40%');
    const tokyo = decision({ id: 'boj-2026-10', institution: 'Bank of Japan', date: '2026-10-30' });
    expect(
      cardFor(
        [contract('Bank of Japan raises rates in October?', 22, '2026-10-30T12:00:00Z')],
        tokyo,
      )?.figures?.[0]?.value,
    ).toBe('22%');
    // The yen's exchange rate is not the bank's decision.
    expect(
      cardFor(
        [contract('Yen exchange rate above 160 in October?', 70, '2026-10-30T12:00:00Z')],
        tokyo,
      )?.figures,
    ).toBeUndefined();
  });

  it('prints the outcome traders price highest where several are on one meeting', () => {
    const closes = '2026-10-29T03:59:00Z';
    const cut = contract('Fed cuts rates in October?', 4, closes);
    const hike = contract('Fed raises rates in October?', 12, closes);
    expect(cardFor([cut, HOLD, hike])?.figures).toEqual([
      { label: 'No change in Fed rates after Oct 2026?', value: '84%' },
    ]);
  });

  it('is a rate decision’s only: a release and a summit carry none', () => {
    const cpi = decision({
      id: 'fred-us-cpi-2026-10-14',
      kind: 'econ-release',
      institution: 'Bureau of Labor Statistics',
      date: '2026-10-28',
    });
    expect(cardFor([HOLD], cpi)?.figures).toBeUndefined();
    const unknown = decision({ institution: 'Reserve Bank of Australia' });
    expect(cardFor([HOLD], unknown)?.figures).toBeUndefined();
  });
});
