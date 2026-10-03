import cardsRaw from '@shared/data/country-cards.json';
import {
  type CountryCardData,
  formatInflation,
  getGlobalBenchmarks,
  inflationSummary,
  trajectoryOf,
  type YearValue,
} from '../lib/country-cards';

const byIso2 = (cardsRaw as unknown as { byIso2: Record<string, CountryCardData> }).byIso2;
const world = getGlobalBenchmarks();

/** Every series a country card charts, with the world line it is drawn against. */
const charted = Object.entries(byIso2).flatMap(([iso, c]) =>
  [
    ['gdp', c.economy?.gdpPerCapita, world.economy?.gdpPerCapita],
    ['fertility', c.demography?.fertility, world.demography?.fertility],
    ['inflation', c.economy?.inflation, world.economy?.inflation],
    ['eci', c.complexity?.eci, world.complexity?.eci],
  ].map(([name, series, benchmark]) => ({
    label: `${iso} ${name}`,
    series: series as YearValue[] | undefined,
    benchmark: benchmark as YearValue[] | undefined,
  })),
);

it('puts both lines on one year axis', () => {
  for (const { label, series, benchmark } of charted) {
    const t = trajectoryOf(series, benchmark);
    if (!series?.length) {
      expect({ label, t }).toEqual({ label, t: null });
      continue;
    }
    const years = (t?.endYear ?? 0) - (t?.startYear ?? 0) + 1;
    expect({ label, n: t?.values.length }).toEqual({ label, n: years });
    expect({ label, n: t?.comparison.values.length }).toEqual({ label, n: years });
  }
});

it('leaves a dense series as it was', () => {
  for (const { label, series, benchmark } of charted) {
    if (!series?.length) continue;
    const t = trajectoryOf(series, benchmark);
    const dense = (t?.endYear ?? 0) - (t?.startYear ?? 0) + 1 === series.length;
    if (dense) expect({ label, v: t?.values }).toEqual({ label, v: series.map(([, v]) => v) });
  }
});

it('gaps the years a country is missing instead of stretching its line', () => {
  // Luxembourg's fertility has no 1961 or 1963: 63 values over 65 years, and
  // its line ran up to two years ahead of the decade ticks.
  const t = trajectoryOf(byIso2.LU?.demography?.fertility, world.demography?.fertility);
  expect(t?.startYear).toBe(1960);
  expect(t?.values[1]).toBeNull();
  expect(t?.values[3]).toBeNull();
  expect(t?.values.filter((v) => v === null)).toHaveLength(2);
  expect(t?.comparison.values[1]).not.toBeNull();
});

describe('inflation', () => {
  it('prints a decimal under a hundred, none above, and a true minus', () => {
    expect(formatInflation(58.5064)).toBe('58.5%');
    expect(formatInflation(219.88)).toBe('220%');
    expect(formatInflation(-0.42)).toBe('−0.4%');
  });

  it('says the year the figure is of, and the world’s median for that year', () => {
    const series: YearValue[] = [
      [2022, 72.3],
      [2024, 58.5],
    ];
    expect(
      inflationSummary(series, [
        [2023, 5.9],
        [2024, 3.1453],
      ]),
    ).toEqual({
      headline: '58.5%',
      subtitle: 'A year’s rise in consumer prices, in 2024. The world’s median was 3.1%.',
    });
    // A series that stops early is compared with its own year, or with nothing.
    expect(inflationSummary([[2022, 138.8]], [[2024, 3.1]])?.subtitle).toBe(
      'A year’s rise in consumer prices, in 2022.',
    );
    expect(inflationSummary(undefined, undefined)).toBeNull();
  });

  it('has a summary for every country that carries the series', () => {
    for (const c of Object.values(byIso2)) {
      if (!c.economy?.inflation?.length) continue;
      expect(inflationSummary(c.economy.inflation, world.economy?.inflation)).not.toBeNull();
    }
  });
});
