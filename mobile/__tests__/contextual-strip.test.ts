import type { Indicator } from '@shared/types';
import { contextualStrip, linksFirst } from '../lib/contextual-strip';
import type { CountryCurrencies, StripItem } from '../lib/now';

function gauge(id: string, slug = ''): StripItem {
  return {
    id,
    short: id,
    label: id,
    reading: '100',
    coords: null,
    delta: { direction: 'up', magnitude: '1%', size: 1 },
    card: {
      id,
      kind: 'reading',
      kicker: 'market',
      title: id,
      reading: '100',
      asOf: '2026-10-09',
      why: 'test',
      cited: slug ? [{ slug, title: slug }] : [],
    },
  } as StripItem;
}
const region = {
  exploring: true,
  clip: 30,
  story: 0,
  named: [] as string[],
  unnamed: [] as string[],
  countries: [] as string[],
};
/** Country currencies whose slots moved by `sizes` percent; a size of 0 has no week. */
function currenciesOf(
  tags: Record<string, string[]>,
  sizes: Record<string, number> = {},
): CountryCurrencies & { slot: jest.Mock } {
  return {
    indicators: Object.entries(tags).map(([id, countryTags]) => ({ id, countryTags }) as Indicator),
    slot: jest.fn((indicator: Indicator) => {
      const size = sizes[indicator.id] ?? 1;
      if (size === 0) return null;
      const slot = gauge(indicator.id);
      return { ...slot, delta: { ...slot.delta, size } };
    }),
  };
}
const ids = (items: StripItem[]) => items.map((item) => item.id);
const sized = (item: StripItem, size: number): StripItem => ({
  ...item,
  delta: { ...item.delta, size },
});
const global = Array.from({ length: 12 }, (_, i) => gauge(`global-${i}`));

it('selects story citations from the full pool before the ten-item limit, including non-geographic gauges', () => {
  const linked = gauge('linked', 'story');
  expect(
    contextualStrip([...global, linked], { slug: 'story' }, { ...region, exploring: false }),
  ).toEqual([linked]);
});
it('shows the gauges in view the globe could not name and leaves the named ones to the globe', () => {
  const clustered = gauge('mkt:clustered');
  const quiet = gauge('strait-quiet');
  const pool = [gauge('mkt:named'), clustered, quiet, gauge('global')];
  expect(
    contextualStrip(pool, undefined, { ...region, unnamed: ['mkt:clustered', 'strait-quiet'] }),
  ).toEqual([clustered, quiet]);
});
it("reads a market signal as its exchange's mark", () => {
  const signal = gauge('market-signal:mkt:bist');
  expect(
    contextualStrip([...global, signal], undefined, { ...region, unnamed: ['mkt:bist'] }),
  ).toEqual([signal]);
});
it('falls back to the global movers at world zoom, with every mark named, or before a context', () => {
  const unnamed = gauge('mkt:unnamed');
  const pool = [...global, unnamed];
  const top = global.slice(0, 10);
  expect(
    contextualStrip(pool, undefined, { ...region, clip: 90, unnamed: ['mkt:unnamed'] }),
  ).toEqual(top);
  expect(contextualStrip(pool, undefined, region)).toEqual(top);
  expect(contextualStrip(pool, undefined, null)).toEqual(top);
  expect(contextualStrip(pool, { slug: 'unrelated' }, { ...region, exploring: false })).toEqual(
    top,
  );
});
it('takes the row in the order it was built, so a newcomer stands at its own rank', () => {
  const b = gauge('b');
  const c = gauge('c');
  const row = [c, b];
  expect(linksFirst(row)).toBe(row);
});

it('combines story links with unnamed gauges, prioritizes links and removes overlap before capping', () => {
  const unnamed = Array.from({ length: 12 }, (_, i) => gauge(`mkt:${i}`));
  const linked = gauge('linked', 'story');
  const both = gauge('mkt:both', 'story');
  expect(
    contextualStrip(
      [...unnamed, linked, both],
      { slug: 'story' },
      {
        ...region,
        exploring: false,
        unnamed: [...unnamed.map((item) => item.id), 'mkt:both'],
      },
    ),
  ).toEqual([linked, both, ...unnamed.slice(0, 8)]);
});
it('uses unnamed gauges for a story without explicit links and drops story-only links while exploring', () => {
  const unnamed = gauge('mkt:unnamed');
  const linked = gauge('linked', 'story');
  const pool = [...global, unnamed, linked];
  const context = { ...region, unnamed: ['mkt:unnamed'] };
  expect(contextualStrip(pool, { slug: 'unrelated' }, { ...context, exploring: false })).toEqual([
    unnamed,
  ]);
  expect(contextualStrip(pool, { slug: 'story' }, context)).toEqual([unnamed]);
});
it('puts story links first while preserving the built order within both groups', () => {
  const a = gauge('a');
  const b = gauge('b');
  const c = gauge('c');
  const d = gauge('d');
  expect(linksFirst([a, d, b, c], new Set(['c', 'd']))).toEqual([d, c, a, b]);
});

it('adds the currency of each country whose capital is in view, and orders it with the unnamed marks by the size of the move', () => {
  const currencies = currenciesOf(
    { 'fx-try': ['TR'], 'fx-eur': ['EU', 'DE', 'FR'], 'fx-jpy': ['JP'] },
    { 'fx-try': 2, 'fx-eur': 5 },
  );
  const pool = [...global, sized(gauge('strait-bosporus'), 23), sized(gauge('mkt:clustered'), 3)];
  const context = {
    ...region,
    countries: ['DE', 'FR', 'TR'],
    unnamed: ['mkt:clustered', 'strait-bosporus'],
  };
  expect(ids(contextualStrip(pool, undefined, context, currencies))).toEqual([
    'strait-bosporus',
    'fx-eur',
    'mkt:clustered',
    'fx-try',
  ]);
  // A card costs a pass over the day's stories: none is built for a capital out of view.
  expect(currencies.slot).toHaveBeenCalledTimes(2);
});
it('gives no slot to what barely moved in view, and falls back to the largest moves with nothing else', () => {
  const currencies = currenciesOf(
    { 'fx-try': ['TR'], 'fx-rub': ['RU'] },
    { 'fx-try': 0.4, 'fx-rub': 1.9 },
  );
  const quiet = sized(gauge('mkt:quiet'), 0.3);
  const pinched = sized(gauge('strait-bosporus'), 23);
  const context = { ...region, countries: ['RU', 'TR'], unnamed: ['mkt:quiet', 'strait-bosporus'] };
  expect(ids(contextualStrip([...global, quiet, pinched], undefined, context, currencies))).toEqual(
    ['strait-bosporus', 'fx-rub'],
  );
  expect(
    contextualStrip(
      [...global, quiet],
      undefined,
      { ...region, countries: ['TR'], unnamed: ['mkt:quiet'] },
      currencies,
    ),
  ).toEqual(global.slice(0, 10));
});
it('gives no slot to a currency in view that did not move, unless the story names it', () => {
  const flat = (indicator: Indicator) => ({
    ...gauge(indicator.id),
    delta: { direction: 'flat' as const, magnitude: 'unchanged', size: 0 },
  });
  const currencies = { ...currenciesOf({ 'fx-lbp': ['LB'] }), slot: flat };
  const context = { ...region, countries: ['LB'] };
  expect(contextualStrip(global, undefined, context, currencies)).toEqual(global.slice(0, 10));
  const article = { slug: 'story', entities: [{ indicatorId: 'fx-lbp' }] } as Parameters<
    typeof contextualStrip
  >[1];
  expect(
    ids(contextualStrip(global, article, { ...context, exploring: false }, currencies)),
  ).toEqual(['fx-lbp']);
});
it("keeps the pool's own slot for a currency it already holds", () => {
  const mover = gauge('fx-try-mover');
  const currencies = currenciesOf({ 'fx-try': ['TR'] });
  expect(
    contextualStrip([...global, mover], undefined, { ...region, countries: ['TR'] }, currencies),
  ).toEqual([mover]);
  expect(currencies.slot).not.toHaveBeenCalled();
});
it('shows a currency the settled story names wherever its capital is, and not while exploring', () => {
  const currencies = currenciesOf({ 'fx-ngn': ['NG'] });
  const article = { slug: 'story', entities: [{ indicatorId: 'fx-ngn' }] } as Parameters<
    typeof contextualStrip
  >[1];
  expect(
    ids(contextualStrip(global, article, { ...region, exploring: false }, currencies)),
  ).toEqual(['fx-ngn']);
  expect(contextualStrip(global, article, region, currencies)).toEqual(global.slice(0, 10));
});
it('shows no currency at world zoom, and none without a seven-day move', () => {
  const top = global.slice(0, 10);
  const countries = ['TR'];
  expect(
    contextualStrip(
      global,
      undefined,
      { ...region, clip: 90, countries },
      currenciesOf({ 'fx-try': ['TR'] }),
    ),
  ).toEqual(top);
  expect(
    contextualStrip(
      global,
      undefined,
      { ...region, countries },
      currenciesOf({ 'fx-try': ['TR'] }, { 'fx-try': 0 }),
    ),
  ).toEqual(top);
});
it('leaves out of the largest moves the ones the globe is naming, at any zoom', () => {
  const hormuz = sized(gauge('strait-hormuz'), 10);
  const bist = sized(gauge('market-signal:mkt:bist'), 9);
  const pool = [hormuz, bist, ...global];
  const named = ['mkt:bist', 'strait-hormuz'];
  expect(contextualStrip(pool, undefined, { ...region, named })).toEqual(global.slice(0, 10));
  expect(contextualStrip(pool, undefined, { ...region, clip: 90, named })).toEqual(
    global.slice(0, 10),
  );
  // Turned to the far side, they are the largest moves again.
  expect(ids(contextualStrip(pool, undefined, region)).slice(0, 2)).toEqual([
    'strait-hormuz',
    'market-signal:mkt:bist',
  ]);
  // A story's own gauge stays, named on the globe or not.
  const article = { slug: 'story', entities: [{ indicatorId: 'cp:hormuz' }] } as Parameters<
    typeof contextualStrip
  >[1];
  expect(ids(contextualStrip(pool, article, { ...region, exploring: false, named }))).toEqual([
    'strait-hormuz',
  ]);
});
