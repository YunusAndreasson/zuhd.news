import {
  GlobeFrameHistory,
  globeTransform,
  IDENTITY_GLOBE_TRANSFORM,
  inverseGlobePoint,
} from '../lib/globe-display';
import { type GlobeHitGeometry, hitGlobeMarks } from '../lib/globe-hit-test';
import { countryTap, markTap } from '../lib/tap-result';

const empty: GlobeHitGeometry = {
  storyMarks: [],
  readMarks: [],
  chokepoints: [],
  marketMarks: [],
  gdacsMarks: [],
  conflictMarks: [],
  famineMarks: [],
  thermalMarks: [],
  genocideMarks: [],
  hotspotGlows: [],
  dot: null,
  makkah: null,
  discRadius: 600,
};
const context = {
  hotspot: () => markTap({ isHotspot: true }),
  dot: () => countryTap('Sweden'),
  makkah: () => countryTap('Saudi Arabia'),
};
const story = { x: 200, y: 300, slug: 'story', color: 'story-color' };

it('maps a tap on a moving and zooming picture back to its recorded mark', () => {
  const cam = { lat: 50, lng: 20, k: 600 };
  const live = { lat: 51, lng: 24, clip: 17 };
  const transform = globeTransform(cam, live, 200, 350, 400, 800, 180);
  expect(transform).not.toEqual(IDENTITY_GLOBE_TRANSFORM);
  const point = inverseGlobePoint(
    story.x * transform.scale + transform.x,
    story.y * transform.scale + transform.y,
    transform,
  );
  expect(point.x).toBeCloseTo(story.x);
  expect(point.y).toBeCloseTo(story.y);
  expect(
    hitGlobeMarks({ ...empty, storyMarks: [story] }, point.x, point.y, transform.scale, context)
      ?.storySlug,
  ).toBe('story');
});

it.each([0.5, 1, 2])('keeps a story target at 32 screen points at scale %s', (scale) => {
  const frame = { ...empty, storyMarks: [story] };
  expect(hitGlobeMarks(frame, story.x + 32 / scale, story.y, scale, context)?.storySlug).toBe(
    'story',
  );
  expect(hitGlobeMarks(frame, story.x + 33 / scale, story.y, scale, context)).toBeNull();
});

it.each([0.5, 1, 2])('keeps a hazard target at 36 screen points at scale %s', (scale) => {
  const frame = { ...empty, gdacsMarks: [{ x: 200, y: 300, eventid: 'flood' }] };
  expect(hitGlobeMarks(frame, 200 + 36 / scale, 300, scale, context)?.gdacsEventId).toBe('flood');
  expect(hitGlobeMarks(frame, 200 + 37 / scale, 300, scale, context)).toBeNull();
});

it('keeps story priority unless a reference mark is closer', () => {
  const frame = {
    ...empty,
    storyMarks: [story],
    gdacsMarks: [{ x: 220, y: 300, eventid: 'flood' }],
  };
  expect(hitGlobeMarks(frame, 201, 300, 1, context)?.storySlug).toBe('story');
  expect(hitGlobeMarks(frame, 220, 300, 1, context)?.gdacsEventId).toBe('flood');
});

it('keeps unread stories ahead of found rings and coverage', () => {
  const frame = {
    ...empty,
    storyMarks: [story],
    readMarks: [{ ...story, x: 205, slug: 'found' }],
    hotspotGlows: [{ x: 205, y: 300, lat: 50, lng: 20, countryName: 'Poland', labels: [] }],
  };
  expect(hitGlobeMarks(frame, 205, 300, 1, context)?.storySlug).toBe('story');
  expect(hitGlobeMarks({ ...frame, storyMarks: [] }, 205, 300, 1, context)?.storySlug).toBe(
    'found',
  );
});

it('keeps every overlapping reference and market cluster member selectable', () => {
  const frame = {
    ...empty,
    marketMarks: [{ x: 200, y: 300, ids: ['one', 'two'] }],
    gdacsMarks: [{ x: 200, y: 300, eventid: 'flood' }],
  };
  expect(hitGlobeMarks(frame, 200, 300, 1, context)?.candidates).toEqual([
    markTap({ marketSignalId: 'one' }),
    markTap({ marketSignalId: 'two' }),
    markTap({ gdacsEventId: 'flood' }),
  ]);
  expect(hitGlobeMarks(frame, 10, 10, 1, context)).toBeNull();
});

it('uses no warp for a whole planet, missing camera or a far-side camera', () => {
  const live = { lat: 0, lng: 20, clip: 90 };
  for (const cam of [
    null,
    { lat: 0, lng: 0, k: 0 },
    { lat: 0, lng: 0, k: 180 },
    { lat: 0, lng: 180, k: 600 },
  ]) {
    expect(globeTransform(cam, live, 200, 350, 400, 800, 180)).toEqual(IDENTITY_GLOBE_TRANSFORM);
  }
});

it('retains a tapped frame while JS publishes newer frames, then releases consumed history', () => {
  const history = new GlobeFrameHistory<GlobeHitGeometry>();
  const tapped = history.publish({ ...empty, storyMarks: [story] });
  // JS can outrun UI publication. No acknowledgement means no eviction.
  let latest = tapped;
  for (let i = 0; i < 20; i++) latest = history.publish(empty);
  expect(
    hitGlobeMarks(history.get(tapped) as GlobeHitGeometry, 200, 300, 1, context)?.storySlug,
  ).toBe('story');
  history.acknowledge(latest);
  expect(history.get(tapped)).toBeUndefined();
  expect(history.get(latest)).toBe(empty);
  expect(history.get(latest - 1)).toBe(empty);
  expect(history.get(latest - 2)).toBeUndefined();
});
