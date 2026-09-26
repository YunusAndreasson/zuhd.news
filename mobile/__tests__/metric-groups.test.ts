import { METRICS, type MetricKey } from '@shared/countries/country-ranking';
import { metricGroups } from '../lib/metric-groups';

describe('metricGroups', () => {
  it('lists every ranking exactly once, and under a named group', () => {
    const listed = metricGroups().flatMap((g) => g.metrics);
    expect([...listed].sort()).toEqual((Object.keys(METRICS) as MetricKey[]).sort());
    expect(new Set(listed).size).toBe(listed.length);
    // `other` is the net for a metric added later, not a place to park one.
    expect(metricGroups().map((g) => g.label)).not.toContain('other');
  });
});
