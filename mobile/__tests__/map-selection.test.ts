import type { StoryRow } from '../lib/map-feed';
import { coverageStory, mapCandidates, type MapSelectionSources } from '../lib/map-selection';
import { countryTap, markTap } from '../lib/tap-result';

function row(
  slug: string,
  time: number,
  coords: [number, number] | null = [50, 20],
  label = 'Talks',
): StoryRow {
  return {
    slug,
    title: slug,
    coords,
    article: { slug, title: slug, addedAt: time, threadLabel: `${label}: next steps` },
  } as StoryRow;
}
const glow = {
  ...countryTap('Poland'),
  isHotspot: true,
  hotspotLabels: ['Old topic', 'Talks'],
  hotspotCoords: [50, 20] as const,
};

it('selects the newest unfound match across every coverage label, regardless of category order', () => {
  const rows = [row('old', 1), row('newest', 3), row('unfound', 2)];
  expect(coverageStory(glow, rows, new Set(['newest']))).toBe('unfound');
  expect(coverageStory(glow, rows, new Set(rows.map((r) => r.slug)))).toBe('newest');
});

it('does not send a similarly labelled story in another place to the camera', () => {
  expect(coverageStory(glow, [row('wrong-place', 4, [0, 0]), row('here', 1)], new Set())).toBe(
    'here',
  );
  expect(
    coverageStory(glow, [row('wrong-place', 4, [0, 0]), row('no-place', 5, null)], new Set()),
  ).toBeNull();
});

it('uses geography for article-derived glows with no labels and handles the dateline', () => {
  const at = { ...glow, hotspotLabels: [], hotspotCoords: [0, 179.9] as const };
  expect(coverageStory(at, [row('across', 2, [0, -179.9])], new Set())).toBe('across');
});

it('matches headlines and returns no story when only historical coverage remains', () => {
  expect(
    coverageStory({ ...glow, hotspotLabels: ['headline'] }, [row('headline', 1)], new Set()),
  ).toBe('headline');
  expect(coverageStory(glow, [row('unrelated', 1, [50, 20], 'Other')], new Set())).toBeNull();
  expect(coverageStory(glow, [], new Set())).toBeNull();
});

const sources: MapSelectionSources = {
  stories: [{ slug: 'story' }],
  markets: [{ id: 'market' }],
  chokepoints: [{ id: 'strait' }],
  alerts: [{ eventid: 'flood' }],
  conflicts: [{ id: 'conflict' }],
  famine: [{ id: 'famine' }],
  thermal: [{ id: 'thermal' }],
  genocide: [{ id: 'genocide' }],
};

it('filters and deduplicates before deciding whether to show the chooser', () => {
  const kept = markTap({ gdacsEventId: 'flood' });
  expect(mapCandidates([markTap({ gdacsEventId: 'removed' }), kept, kept], sources)).toEqual([
    kept,
  ]);
  expect(mapCandidates([kept], { ...sources, alerts: [] })).toEqual([]);
});

it('revalidates all mark types without merging different kinds with similar IDs', () => {
  const candidates = [
    markTap({ storySlug: 'story' }),
    markTap({ marketSignalId: 'market' }),
    markTap({ chokepointId: 'strait' }),
    markTap({ conflictEventId: 'conflict' }),
    markTap({ famineAreaId: 'famine' }),
    markTap({ thermalEventId: 'thermal' }),
    markTap({ genocideId: 'genocide' }),
    countryTap('Poland'),
    glow,
  ];
  expect(mapCandidates(candidates, sources)).toEqual(candidates);
  const empty = {
    stories: [],
    markets: [],
    chokepoints: [],
    alerts: [],
    conflicts: [],
    famine: [],
    thermal: [],
    genocide: [],
  };
  expect(mapCandidates(candidates, empty)).toEqual([countryTap('Poland'), glow]);
});
