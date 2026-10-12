import { nearestIndex } from '../lib/arrays';
import { HOUR_MS } from '../lib/time';
import {
  labelledMarks,
  positionAt,
  runMarks,
  TRACK_RUN_GAP,
  timeTrackLayout,
} from '../lib/time-track';

const W = 350;
const h = (hours: number) => hours * HOUR_MS;
const run = (hours: number, count: number) => Array.from({ length: count }, () => h(hours));

// The live river on 2026-10-12 at 18:13 UTC: 41 stories in five cycles, the
// night's seven hours between the last two.
const DAY = [...run(0, 9), ...run(3.9, 11), ...run(8, 10), ...run(13, 8), ...run(20, 3)];

test('the stories fill the track, each an equal share of it', () => {
  const { centers, cells } = timeTrackLayout(DAY, W);
  const pitch = (W - 4 * TRACK_RUN_GAP) / DAY.length;
  expect(centers[0]).toBeCloseTo(pitch / 2);
  expect(centers[DAY.length - 1]).toBeCloseTo(W - pitch / 2);
  // A cycle's stories touch.
  expect((centers[1] ?? 0) - (centers[0] ?? 0)).toBeCloseTo(pitch);
  for (const cell of cells) expect(cell.width).toBeCloseTo(pitch - 1);
});

// The reason for the layout: a day to scale left 145 of these 350 points
// empty, in the hours when no cycle runs.
test('the hours between two cycles get one gap, however many they were', () => {
  const { centers } = timeTrackLayout(DAY, W);
  const pitch = (W - 4 * TRACK_RUN_GAP) / DAY.length;
  // Four hours apart, then the night's seven.
  expect((centers[9] ?? 0) - (centers[8] ?? 0)).toBeCloseTo(pitch + TRACK_RUN_GAP);
  expect((centers[38] ?? 0) - (centers[37] ?? 0)).toBeCloseTo(pitch + TRACK_RUN_GAP);
});

test('each cycle is a stretch of the track, dated by its first story', () => {
  const { runs } = timeTrackLayout(DAY, W);
  expect(runs.map((r) => r.first)).toEqual([0, 9, 20, 30, 38]);
  expect(runs[0]?.left).toBe(0);
  const last = runs[runs.length - 1];
  expect((last?.left ?? 0) + (last?.width ?? 0)).toBeCloseTo(W);
});

test('a cycle of one day is one stretch with no gap', () => {
  const { centers, runs } = timeTrackLayout(run(2, 4), W);
  expect(runs).toHaveLength(1);
  expect(centers[3]).toBeCloseTo(W - W / 8);
});

test('however many cycles, the gaps leave the stories most of the track', () => {
  const ages = Array.from({ length: 100 }, (_, i) => h(i));
  const { centers, runs } = timeTrackLayout(ages, W);
  expect(runs).toHaveLength(100);
  const stories = runs.reduce((sum, r) => sum + r.width, 0);
  expect(stories).toBeCloseTo(W * 0.75);
  expect(centers[0]).toBeGreaterThan(0);
  expect(centers[99]).toBeLessThan(W);
});

// Inside a run the most reported leads, so the river is not strictly by time.
test('a story sits in its own cycle whatever its place in the river', () => {
  const { centers, runs } = timeTrackLayout([h(12), h(18), h(1), h(3)], W);
  expect(centers[2]).toBeLessThan(centers[3] ?? 0);
  expect(centers[3]).toBeLessThan(centers[0] ?? 0);
  expect(centers[0]).toBeLessThan(centers[1] ?? 0);
  expect(runs.map((r) => r.first)).toEqual([2, 3, 0, 1]);
});

test('the ruler ticks each gap and names each cycle from its first cell', () => {
  const { runs } = timeTrackLayout(DAY, W);
  const marks = runMarks(runs, W, (i) => `${i}`, 28, 4);
  const ticks = marks.filter((m) => !m.label);
  expect(ticks).toHaveLength(4);
  expect(ticks[0]?.at).toBeCloseTo((runs[1]?.left ?? 0) - TRACK_RUN_GAP / 2);
  const words = marks.filter((m) => m.label);
  expect(words.map((m) => m.label)).toEqual(['0', '9', '20', '30', '38']);
  // The night's three stories are narrower than a word: theirs ends with the track.
  expect(words.map((m) => m.at)).toEqual([...runs.slice(0, 4).map((r) => r.left), W]);
  expect(words[4]?.end).toBe(true);
});

test('a word that would run into the one before it is dropped, and the oldest ends with the track', () => {
  // One story, one story, then a long cycle, then one story at the far end.
  const { runs } = timeTrackLayout([h(0), h(4), ...run(8, 30), h(20)], W);
  const marks = runMarks(runs, W, (i) => `${i}`, 28, 4);
  const words = marks.filter((m) => m.label);
  expect(words.map((m) => m.label)).toEqual(['0', '2', '32']);
  expect(words[2]).toMatchObject({ at: W, end: true });
  // Its tick stays.
  expect(marks.filter((m) => !m.label)).toHaveLength(3);
});

test('a cycle with no word keeps its tick', () => {
  const { runs } = timeTrackLayout([...run(1, 5), ...run(200, 5)], W);
  const marks = runMarks(runs, W, (i) => (i === 0 ? '1h' : ''), 28, 4);
  expect(marks.map((m) => m.label)).toEqual(['1h', undefined]);
});

test('the finger lands on the nearest story, and the deck position slides between them', () => {
  const centers = [10, 50, 200];
  expect(nearestIndex(centers, 0)).toBe(0);
  expect(nearestIndex(centers, 120)).toBe(1);
  expect(nearestIndex(centers, 130)).toBe(2);
  expect(positionAt(centers, 1.5)).toBe(125);
  expect(positionAt(centers, 7)).toBe(200);
});

test('crowded marks keep the half-day word', () => {
  const marks = labelledMarks(
    [
      { hours: 6, at: 100 },
      { hours: 12, at: 110 },
      { hours: 18, at: 260 },
    ],
    32,
  );
  expect(marks.map((m) => m.label)).toEqual([undefined, '12h', '18h']);
});
