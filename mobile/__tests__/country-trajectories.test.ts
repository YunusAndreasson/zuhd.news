import { countryTrajectories, trajectorySentence } from '../lib/country-cards';

// The sheet's cards are the site's (`trajectoryCards`), read off the bundled
// series by the name the globe hands over.

const card = (country: string, key: string) =>
  countryTrajectories(country).find((c) => c.key === key);

it('pages a country’s cards in the sheet’s order, and none for a name it cannot place', () => {
  expect(countryTrajectories('Sweden').map((c) => c.key)).toEqual([
    'complexity',
    'momentum',
    'prices',
    'demography',
  ]);
  expect(countryTrajectories('Atlantis')).toEqual([]);
  expect(countryTrajectories(null)).toEqual([]);
});

it('names the year a sentence was measured from, not the year it asked for', () => {
  // South Sudan's income series begins in 2008: "since 2000" was never true.
  const income = card('South Sudan', 'momentum');
  expect(income?.periods[0]).toBe('2008');
  expect(income?.subtitle).not.toMatch(/since 2000/);
  expect(income?.subtitle).toMatch(/since 2008\. GDP per head in \d{4}/);
});

it('keeps every complexity line inside the scale all countries share', () => {
  // Chad's index is under -3, the floor this chart had.
  const chad = card('Chad', 'complexity');
  expect(chad?.domain).toEqual([-4, 3]);
  const low = Math.min(...(chad?.values ?? []).filter(Number.isFinite));
  expect(low).toBeLessThan(-3);
  expect(low).toBeGreaterThan(-4);
});

it('hands the chart one value a year, with the world’s beside it', () => {
  for (const c of countryTrajectories('Luxembourg')) {
    const years = Number(c.periods[c.periods.length - 1]) - Number(c.periods[0]) + 1;
    expect({ key: c.key, n: c.values.length }).toEqual({ key: c.key, n: years });
    expect({ key: c.key, n: c.world.length }).toEqual({ key: c.key, n: years });
  }
});

it('says a card in one sentence, and its source when the whole card is said', () => {
  const [card] = countryTrajectories('Sweden');
  if (!card) throw new Error('Sweden has no trajectory cards');
  const chart = trajectorySentence(card);
  for (const part of [card.label, card.headline, card.subtitle, 'world median']) {
    expect(chart).toContain(part);
  }
  expect(chart).not.toContain(card.source);
  expect(trajectorySentence(card, { source: true })).toContain(card.source);
});
