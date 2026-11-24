import {
  archiveStory,
  archiveWithdrawn,
  hasOpeningReading,
  openingStory,
  selectStarter,
  type Starter,
} from '../lib/opening-story';

const story = (slug: string, changes: Partial<Starter> = {}): Starter => ({
  ...archiveStory,
  slug,
  ...changes,
});
const today = archiveStory.publishedAt! + 86400000;

it('prefers the latest eligible edition, then subject chart plus measured hook within it', () => {
  const chart = story('chart', { publishedAt: today, starterEvidence: 'both' });
  const measured = story('measured', { publishedAt: today + 2000, chart: undefined });
  const onlyChart = story('series', {
    publishedAt: today + 4000,
    sentences: ['Gold trades lower.'],
    starterEvidence: 'chart',
  });
  const newest = story('unflagged', { publishedAt: today + 86400000, starterEligible: undefined });
  const rows = [newest, onlyChart, measured, chart];
  expect(openingStory({ economy: rows }, archiveStory)?.slug).toBe('chart');
  expect(rows[0]).toBe(newest); // chronological feed remains intact
  expect(openingStory({ economy: [measured, onlyChart] }, archiveStory)?.slug).toBe('measured');
  expect(openingStory({ economy: [onlyChart] }, archiveStory)?.slug).toBe('series');
});

it('keeps the most recent approved revision it has when offline or on an old feed', () => {
  const cached = story('cached', { publishedAt: today });
  expect(openingStory({}, cached)?.slug).toBe('cached');
  expect(
    openingStory({ economy: [story('missing', { starterEligible: undefined })] }, cached)?.slug,
  ).toBe('cached');
  expect(openingStory({}, archiveStory)?.sentences).toHaveLength(5);
});

it('rejects withdrawn revisions, missing coordinates, and flagless measured news', () => {
  const cached = story('corrected');
  const revised = story('corrected', { starterEligible: false });
  expect(
    openingStory(
      {
        economy: [
          revised,
          story('untagged', { starterEligible: undefined }),
          story('unplaced', { lat: 92 }),
        ],
        politics: [story('political', { starterEligible: false })],
      },
      cached,
    ),
  ).toBeNull();
});

it('never selects a chart-only story whose dated reading cannot be drawn', () => {
  const onlyChart = story('chart', {
    sentences: ['Series 4 chips arrive.'],
    starterEvidence: 'chart',
  });
  const count = story('count', {
    sentences: ['The pilot reached 320 households.'],
    chart: undefined,
  });
  expect(openingStory({ science: [count] }, null)?.slug).toBe('count');
  const incidentalChart = { ...count, chart: 'unrelated' };
  expect(openingStory({ politics: [incidentalChart] }, null, () => false)?.slug).toBe('count');
  const temperature = { ...count, sentences: ['Nights were 0.041-0.125 °C warmer.'] };
  expect(openingStory({ science: [temperature] }, null, () => false)?.slug).toBe('count');
  expect(openingStory({ economy: [onlyChart] }, null, () => false)).toBeNull();
  expect(
    openingStory(
      {
        economy: [
          story('model', {
            sentences: ['Model 2026 arrives.'],
            starterEvidence: 'chart',
            chart: undefined,
          }),
        ],
      },
      null,
    ),
  ).toBeNull();
  const card = {
    id: 'gold',
    title: 'Gold',
    kind: 'reading',
    asOf: '2026-11-20',
    reading: '$30',
    series: { values: [28, 30], periods: ['2026-11-19', '2026-11-20'], label: 'gold' },
  } as const;
  const reading = {
    ...card,
    series: { ...card.series, values: [...card.series.values], periods: [...card.series.periods] },
  };
  expect(hasOpeningReading(reading)).toBe(true);
  expect(hasOpeningReading({ ...reading, asOf: undefined })).toBe(false);
  expect(hasOpeningReading({ ...reading, series: { ...reading.series, values: [NaN, 3] } })).toBe(
    false,
  );
});

it('falls back to the bundled edition after a cached withdrawal and remembers an archive withdrawal', () => {
  const previous = story('yesterday', { publishedAt: today });
  const state = { previous, archiveWithdrawn: false };
  expect(
    selectStarter({ economy: [{ ...previous, starterEligible: false } as Starter] }, state),
  ).toBe(archiveStory);
  const rejected = { economy: [{ ...archiveStory, starterEligible: false }] };
  const withdrawn = archiveWithdrawn(rejected, false);
  expect(withdrawn).toBe(true);
  expect(selectStarter({}, { previous: null, archiveWithdrawn: withdrawn })).toBeNull();
  expect(
    selectStarter(
      { economy: [{ ...archiveStory, starterEligible: undefined } as Starter] },
      { previous: null, archiveWithdrawn: false },
    ),
  ).toBe(archiveStory);
});

it('cannot substitute the bundled measurement when Karachi is reapproved on its chart alone', () => {
  const corrected = { ...archiveStory, starterEvidence: 'chart' as const };
  const feed = { economy: [corrected] };
  expect(
    selectStarter(feed, { previous: archiveStory, archiveWithdrawn: false }, () => false),
  ).toBeNull();
  expect(openingStory(feed, null, () => true)?.slug).toBe(archiveStory.slug);
});
