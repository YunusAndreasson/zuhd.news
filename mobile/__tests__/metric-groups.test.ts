import { getRanking, METRICS, type MetricKey } from '@shared/countries/country-ranking';
import { metricGroups, rankingLeaders } from '../lib/metric-groups';
import { displayCountryName } from '../lib/place-names';
import { LEADERS_LINE, LEADERS_SEPARATOR } from '../lib/row-leaders';

describe('metricGroups', () => {
  it('lists every ranking exactly once, and under a named group', () => {
    const listed = metricGroups().flatMap((g) => g.metrics);
    expect([...listed].sort()).toEqual((Object.keys(METRICS) as MetricKey[]).sort());
    expect(new Set(listed).size).toBe(listed.length);
    // `other` is the net for a metric added later, not a place to park one.
    expect(metricGroups().map((g) => g.label)).not.toContain('other');
  });
});

describe('rankingLeaders', () => {
  const keys = Object.keys(METRICS) as MetricKey[];

  it("is the head of the ranking's own order, one to three whole names", () => {
    for (const key of keys) {
      const leaders = rankingLeaders(key);
      expect(leaders.length).toBeGreaterThanOrEqual(1);
      expect(leaders.length).toBeLessThanOrEqual(3);
      expect(leaders).toEqual(
        getRanking(key)
          .slice(0, leaders.length)
          .map((entry) => displayCountryName(entry.name)),
      );
    }
  });

  it('drops a name rather than run past one line', () => {
    for (const key of keys) {
      const leaders = rankingLeaders(key);
      if (leaders.length > 1) {
        expect(leaders.join(LEADERS_SEPARATOR).length).toBeLessThanOrEqual(LEADERS_LINE);
      }
    }
    // Three names here are 66 characters.
    expect(rankingLeaders('fertilityRate')).toEqual(['Central African Republic', 'Chad']);
    expect(rankingLeaders('population')).toHaveLength(3);
  });

  it('leads with the best where lower is better', () => {
    const ranking = getRanking('pressFreedomScore');
    const lowest = Math.min(...ranking.map((entry) => entry.numeric));
    expect(ranking[0]?.numeric).toBe(lowest);
    expect(rankingLeaders('pressFreedomScore')[0]).toBe(
      displayCountryName(ranking[0]?.name ?? null),
    );
  });
});
