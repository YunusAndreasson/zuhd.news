import { coverageLabel, isMostCovered } from '../lib/coverage';

test('a story is most covered at 400 reports and not before', () => {
  expect(isMostCovered({ eventCoverage: 400 })).toBe(true);
  expect(isMostCovered({ eventCoverage: 884 })).toBe(true);
  expect(isMostCovered({ eventCoverage: 399 })).toBe(false);
});

// Unmeasured is not quiet, but it is not a claim of reach either.
test('no figure, or a nonsense one, claims nothing', () => {
  expect(isMostCovered({ eventCoverage: null })).toBe(false);
  expect(isMostCovered({ eventCoverage: 157_957 })).toBe(false);
});

test('the kicker prints the count, in reports, only over the bar', () => {
  expect(coverageLabel({ eventCoverage: 884 })).toBe('884 reports');
  expect(coverageLabel({ eventCoverage: 1907 })).toBe('1,907 reports');
  expect(coverageLabel({ eventCoverage: 399 })).toBeNull();
  expect(coverageLabel({ eventCoverage: null })).toBeNull();
});
