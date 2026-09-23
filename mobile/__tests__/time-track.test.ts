import {
  labelledMarks,
  nearestStory,
  positionAt,
  TRACK_PITCH,
  timeTrackLayout,
} from '../lib/time-track';
import { HOUR_MS } from '../lib/time';

const W = 350;
const h = (hours: number) => hours * HOUR_MS;

// The live river on 2026-09-23 at 14:04 UTC: 47 stories in five cycles.
const DAY = [
  2.1, 2.3, 2.3, 2.5, 2.8, 2.8, 3.0, 3.1, 3.3, 4.1, 6.1, 6.2, 6.2, 6.4, 6.6, 6.9, 7.6, 7.9, 10.1,
  10.1, 10.1, 10.1, 10.2, 11.1, 11.6, 15.8, 15.9, 16.3, 16.4, 16.6, 16.7, 16.7, 17.4, 17.8, 18.2,
  18.6, 18.8, 20.6, 21.1, 21.3, 21.5, 21.5, 21.6, 21.7, 22.2, 23.3, 23.4,
].map(h);

test('a story sits at its time when there is room', () => {
  const { centers, marks } = timeTrackLayout([h(3), h(12), h(20)], W);
  expect(centers[0]).toBeCloseTo(W / 8);
  expect(centers[1]).toBeCloseTo(W / 2);
  expect(marks.find((m) => m.hours === 12)?.at).toBeCloseTo(W / 2);
});

test('every story gets a cell a finger can find, in order, on the track', () => {
  const { centers, cells } = timeTrackLayout(DAY, W);
  for (let i = 1; i < centers.length; i++) {
    expect((centers[i] ?? 0) - (centers[i - 1] ?? 0)).toBeGreaterThanOrEqual(TRACK_PITCH - 1e-9);
  }
  expect(cells[0]?.left).toBeGreaterThanOrEqual(0);
  const last = cells[cells.length - 1];
  expect((last?.left ?? 0) + (last?.width ?? 0)).toBeLessThanOrEqual(W);
});

test('a burst spreads about its own time, not away from it', () => {
  // Four stories filed in one minute at ten hours ago.
  const { centers } = timeTrackLayout([h(10), h(10), h(10), h(10)], W);
  const mean = centers.reduce((a, b) => a + b, 0) / centers.length;
  expect(mean).toBeCloseTo((10 / 24) * W);
});

// The reason marks are placed through the mapping rather than evenly.
test('an hour mark falls between the stories either side of that hour', () => {
  const { centers, marks } = timeTrackLayout(DAY, W);
  for (const { hours, at } of marks) {
    DAY.forEach((age, i) => {
      if (age < h(hours)) expect(centers[i]).toBeLessThanOrEqual(at);
      if (age > h(hours)) expect(centers[i]).toBeGreaterThanOrEqual(at);
    });
  }
  // On a day like this the marks stay close to the quarters.
  for (const { hours, at } of marks) expect(Math.abs(at - (hours / 24) * W)).toBeLessThan(20);
});

test('a day too full for the pitch falls back to one cell per story', () => {
  const ages = Array.from({ length: 100 }, () => h(1));
  const { centers } = timeTrackLayout(ages, W);
  expect(centers[0]).toBeCloseTo(W / 200);
  expect(centers[99]).toBeCloseTo(W - W / 200);
});

test('a story alone in a quiet stretch is a short dash, not the whole stretch', () => {
  const { cells } = timeTrackLayout([h(1), h(12), h(23)], W);
  expect(cells[1]?.width).toBeLessThanOrEqual(10);
});

// The day's top stories lead the river, out of time order.
test('a story sits at its own time whatever its place in the river', () => {
  const { centers, cells } = timeTrackLayout([h(12), h(18), h(1), h(3)], W);
  expect(centers[0]).toBeCloseTo(W / 2);
  expect(centers[1]).toBeCloseTo((18 / 24) * W);
  expect(centers[2]).toBeLessThan(centers[3] ?? 0);
  expect(cells[0]?.left).toBeLessThan(W / 2);
  expect((cells[0]?.left ?? 0) + (cells[0]?.width ?? 0)).toBeGreaterThan(W / 2);
});

test('older than a day sits at the right end', () => {
  const { centers } = timeTrackLayout([h(2), h(30), h(5)], W);
  expect(centers[2]).toBeLessThan(centers[1] ?? 0);
  expect(centers[1]).toBeLessThanOrEqual(W);
});

test('the finger lands on the nearest story, and the deck position slides between them', () => {
  const centers = [10, 50, 200];
  expect(nearestStory(centers, 0)).toBe(0);
  expect(nearestStory(centers, 120)).toBe(1);
  expect(nearestStory(centers, 130)).toBe(2);
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
