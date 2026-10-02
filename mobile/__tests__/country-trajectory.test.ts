import cardsRaw from '@shared/data/country-cards.json';
import {
  type CountryCardData,
  getGlobalBenchmarks,
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
