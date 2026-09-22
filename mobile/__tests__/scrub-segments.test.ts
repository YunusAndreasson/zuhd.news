import { segmentLayout } from '../lib/scrub-segments';

// The story track carries a colour and a read state per story, and a day runs
// to ~65 stories. Going continuous past 60 drew one plain bar on most days and
// dropped both — the read hairlines never showed.
test('a day of 65 stories keeps a cell per story, touching', () => {
  expect(segmentLayout(65, true)).toEqual({ cells: true, gapped: false });
});

test('under the ceiling the cells keep their gaps', () => {
  expect(segmentLayout(48, true)).toEqual({ cells: true, gapped: true });
  expect(segmentLayout(48, false)).toEqual({ cells: true, gapped: true });
});

test('a long track with nothing per cell is one bar', () => {
  expect(segmentLayout(65, false)).toEqual({ cells: false, gapped: false });
  expect(segmentLayout(undefined, false)).toEqual({ cells: false, gapped: false });
  expect(segmentLayout(1, true)).toEqual({ cells: false, gapped: false });
});
