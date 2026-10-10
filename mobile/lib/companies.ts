import type { RelatedArticleRef } from '@shared/types';
import { compactUsd, deltaFrom, formatNumber, windowChange } from './cards/format';
import type { SwipeCard } from './cards/rank';
import { recordLine } from './cards/record';
import { exchangeIsStale, stockMarketPlace } from './markets';

/**
 * The menu's `largest companies` list: the published `/api/companies.json`
 * contract, and the card each company opens.
 *
 * Share prices of twenty of the world's largest listed companies, one close a
 * day. In the menu's list, and in the top strip among its other gauges
 * (`companyGauges`; 2026-10-03, the user's request — they were menu-only for
 * half a day, on the worry that a single share swings more than an index and
 * would crowd the straits and currencies out of a row sorted by the week's
 * largest move). Not on the globe: a company has a headquarters, not a place
 * its price is about.
 *
 * The paragraph under a company's chart answers the question the chart
 * raises: the desk's account of what happened to the share and why (`recent`,
 * from the daily narration, since the companies took slots in the strip),
 * and, on a day the desk has nothing to say, the catalog's standing sentence
 * of what the company is (`blurb`). One of them, never both: the kicker over
 * the name already says what the company does. Under it are the stories the
 * account was built from, or the stories about the company, marked on the
 * line.
 */
export interface Company {
  id: string;
  /** The name a reader knows it by: `Nvidia`, not `NVIDIA Corporation`. */
  name: string;
  /** What it is known for, in a few plain words: `AI chips`. */
  about: string;
  symbol: string;
  iso2: string;
  /** ISO code of the currency the share trades in. */
  currency: string;
  /** That currency in words, plural: `Taiwan dollars`. */
  currencyName: string;
  /** The last completed session's close. */
  level: number;
  /** What the whole company is worth at that close, in US dollars: the
   *  pipeline's share count by the close, at the day's rate. Absent from a
   *  build that has no count or no rate for it. */
  marketValue?: number;
  asOf: string;
  sourceLabel: string;
  /** What the company is: the catalog's sentence, and the card's fallback. */
  blurb: string;
  /** What happened to the share lately, and why. Absent when the desk wrote
   *  none — never an empty string. */
  recent?: string;
  stale?: boolean;
  series: { periods: string[]; values: number[] };
  relatedArticles?: RelatedArticleRef[];
}

export interface CompaniesSnapshot {
  generated: string;
  companies: Company[];
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const STRINGS = [
  'id',
  'name',
  'about',
  'symbol',
  'iso2',
  'currency',
  'currencyName',
  'asOf',
  'sourceLabel',
  'blurb',
] as const;

export function isCompaniesSnapshot(v: unknown): v is CompaniesSnapshot {
  if (
    !object(v) ||
    typeof v.generated !== 'string' ||
    !Number.isFinite(Date.parse(v.generated)) ||
    !Array.isArray(v.companies)
  )
    return false;
  const ids = new Set<string>();
  return v.companies.every((c) => {
    if (!object(c) || !STRINGS.every((k) => typeof c[k] === 'string') || !c.id || !c.name)
      return false;
    if (ids.has(String(c.id))) return false;
    ids.add(String(c.id));
    if (
      !Number.isFinite(c.level) ||
      Number(c.level) <= 0 ||
      !Number.isFinite(Date.parse(String(c.asOf))) ||
      (c.stale !== undefined && typeof c.stale !== 'boolean') ||
      (c.recent !== undefined && typeof c.recent !== 'string')
    )
      return false;
    if (
      !object(c.series) ||
      !Array.isArray(c.series.values) ||
      !Array.isArray(c.series.periods) ||
      c.series.values.length !== c.series.periods.length ||
      !c.series.values.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
      !c.series.periods.every((s) => typeof s === 'string')
    )
      return false;
    return (
      c.relatedArticles === undefined ||
      (Array.isArray(c.relatedArticles) &&
        c.relatedArticles.every(
          (a) =>
            object(a) &&
            typeof a.slug === 'string' &&
            typeof a.title === 'string' &&
            (a.date === undefined || typeof a.date === 'string'),
        ))
    );
  });
}

/** The card id of a company: its own namespace, beside `mkt:` and `strait-`. */
export const companyCardId = (id: string): string => `co:${id}`;

/**
 * The currencies whose mark a reader takes for exactly one currency. `$` is
 * the US dollar here because every other dollar in the list says its country
 * in words; a peso, a yuan or a yen sign would each be read as two.
 */
const CURRENCY_MARKS: Readonly<Record<string, string>> = { USD: '$', EUR: '€' };

/**
 * A share price as a reading and the line under it: `$233.95` / `a share`,
 * `2,500` / `Taiwan dollars a share`. Cents are kept below a thousand, where
 * they are a tenth of a percent of the price; above it they are noise.
 *
 * `unit` is what a list of nothing but shares still has to say under a
 * number: the currency, where no mark says it, and nothing where one does.
 * The line over that list says `a share` once, and twenty rows repeating it
 * told the reader what the first had.
 */
export function sharePrice(
  level: number,
  currency: string,
  currencyName: string,
): { reading: string; note: string; unit: string } {
  const decimals = Math.abs(level) >= 1000 ? 0 : 2;
  const figure = formatNumber(level, decimals, decimals);
  const mark = CURRENCY_MARKS[currency];
  if (mark) return { reading: `${mark}${figure}`, note: 'a share', unit: '' };
  const words = currencyName || currency;
  return { reading: figure, note: `${words} a share`, unit: words };
}

/** What the figure is called, on the card and to a listener. */
export const MARKET_VALUE = 'market value';

/**
 * A company's market value as its row and its card print it: `$5.5T`, `$890B`.
 * Undefined where the payload carries none.
 *
 * To two figures and no further. The share count behind it is kept by hand
 * and dated, and a buyback moves it a per cent or two a year: `$885B` would
 * claim the third figure, which the count cannot give.
 *
 * It is what the list is of. `largest companies` printed share prices, and
 * `262,000` won beside `$229` says nothing about which is larger.
 */
export function companyValue(c: Pick<Company, 'marketValue'>): string | undefined {
  const value = c.marketValue;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return compactUsd(Number(value.toPrecision(2)));
}

/**
 * A daily price card measures thirty observations (`DAILY_WINDOW` in
 * `cards/markets.ts`, about six weeks of sessions), and a company's does too:
 * the chip names the day it opens on, and the chart draws that day's price as
 * a rule (`windowReference`).
 */
const CARD_WINDOW = 30;

/** What the company is and where it is from: `AI chips · US`. The line under
 *  its name in the list, and its card's kicker. */
export function companyKicker(c: Pick<Company, 'about' | 'iso2'>): string {
  return [c.about, stockMarketPlace(c.iso2)].filter(Boolean).join(' · ');
}

export function companyCard(c: Company): SwipeCard {
  const { reading, note } = sharePrice(c.level, c.currency, c.currencyName);
  const value = companyValue(c);
  return {
    id: companyCardId(c.id),
    kind: 'reading',
    title: c.name,
    kicker: companyKicker(c),
    asOf: c.asOf,
    reading,
    readingNote: note,
    delta: deltaFrom(windowChange(c.series, CARD_WINDOW)),
    // The share's record, where it has set one (`recordLine`).
    changed: exchangeIsStale(c)
      ? 'Older quote · last available observation'
      : recordLine(c.series.values, c.series.periods),
    // The account of the move where the desk wrote one, as every other
    // card's `why` is (`whyFor`); what the company is, where it did not.
    why: c.recent?.trim() || c.blurb,
    // The number its row in the list prints, from the same function.
    figures: value ? [{ label: MARKET_VALUE, value }] : undefined,
    sourceLabel: c.sourceLabel,
    series: {
      values: c.series.values,
      periods: c.series.periods,
      label: `Share price, ${c.currencyName || c.currency}`,
      unit: CURRENCY_MARKS[c.currency] ?? c.currency,
    },
    related: c.relatedArticles,
    // Listed under the paragraph and marked on the line by their number: the
    // stories the account was built from, or with no account the stories the
    // company is the subject of (the build decides; a mention is on neither).
    cited: c.relatedArticles,
  };
}

/**
 * The companies as gauges for the top strip: every one with a fresh quote.
 *
 * A company whose quote is old is left out. The strip sorts each reading's
 * past seven days against the others', and a week that ended days ago is not
 * this week. It keeps its row in the menu's list, whose card says the quote
 * is old.
 */
export function companyGauges(companies: readonly Company[], now = Date.now()): SwipeCard[] {
  return companies.filter((company) => !exchangeIsStale(company, now)).map(companyCard);
}
