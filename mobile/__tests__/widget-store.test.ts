import type { FeedResponse, WidgetCandidate } from '@shared/types';
import { widgetTap } from '../lib/daily-widget';
import { analytics } from '../lib/analytics';
import {
  completedWidgetAudio,
  currentWidgetEdition,
  eraseWidget,
  observeWidget,
  refreshWidget,
  syncWidget,
  widgetDetail,
  widgetPreview,
} from '../lib/widget-store';

const mockData = new Map<string, string>();
const mockPresence = jest.fn();
const mockTimeline = jest.fn(),
  mockSnapshot = jest.fn(),
  mockRemove = jest.fn();
jest.mock('expo', () => ({
  requireOptionalNativeModule: () => ({ briefingPresence: () => mockPresence() }),
}));
jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: (key: string) => mockData.get(key),
    setItemSync: (key: string, value: string) => mockData.set(key, value),
    removeItemSync: (key: string) => mockData.delete(key),
  },
}));
jest.mock(
  '../widgets/DailyBriefing',
  () => ({
    __esModule: true,
    default: {
      updateTimeline: (...args: unknown[]) => mockTimeline(...args),
      updateSnapshot: (...args: unknown[]) => mockSnapshot(...args),
    },
  }),
  { virtual: true },
);
jest.mock('../lib/widget-images', () => ({
  widgetImages: () => Promise.resolve({}),
  removeWidgetImages: () => mockRemove(),
}));
jest.mock('../lib/briefing-audio', () => ({
  briefingAudioFile: () => ({ exists: false, size: 0 }),
}));
jest.mock('../lib/analytics', () => ({ analytics: { track: jest.fn() } }));
const generated = '2026-11-23T05:46:00Z';
const candidate: WidgetCandidate = {
  version: 1,
  sourceRevision: 'a'.repeat(64),
  edition: '2026-11-23',
  audio: { status: 'available', date: '2026-11-23', generated, durationSeconds: 587 },
};
const feed = (stamp: string, c?: WidgetCandidate): FeedResponse => ({
  generated: stamp,
  briefing: null,
  categories: {},
  widgetCandidate: c,
});

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-23T16:00Z'));
  mockData.clear();
  jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());
it('schedules rollover and expiry, keeps an archive and clears private state on erase', async () => {
  await syncWidget(feed('2026-11-23T15:55Z', candidate));
  const timeline = mockTimeline.mock.calls[0]?.[0] as { props: { action?: string }; date: Date }[];
  expect(timeline.map((x) => x.props.action)).toEqual([
    'Daily briefing',
    'Previous edition',
    'Saved edition',
    undefined,
  ]);
  await completedWidgetAudio(generated);
  expect(widgetPreview().action).toBe('Listened');
  await refreshWidget(true);
  expect(widgetPreview().action).toBe('Audio needs internet');
  await syncWidget(feed('2026-11-24T01:00Z'));
  expect(currentWidgetEdition()?.edition).toBe('2026-11-23');
  const correction = {
    ...candidate,
    sourceRevision: 'c'.repeat(64),
    audio: { ...candidate.audio, status: 'unavailable' } as const,
  };
  await syncWidget(feed('2026-11-24T01:15Z', correction));
  expect(currentWidgetEdition()).toBeUndefined();
  expect(widgetDetail(candidate.edition, candidate.sourceRevision)).toBeDefined();
  await eraseWidget();
  expect(widgetPreview()).toEqual({});
  expect(mockSnapshot).toHaveBeenCalledWith({});
  expect(mockRemove).toHaveBeenCalled();
});
it('measures OS transitions separately and preserves the native observation time', async () => {
  mockPresence.mockReturnValue({ home: false, accessory: true });
  await observeWidget();
  await observeWidget();
  mockPresence.mockReturnValue({ home: true, accessory: true, observed: 12345 });
  await observeWidget();
  mockPresence.mockRejectedValue(new Error('unavailable'));
  await observeWidget();
  expect(analytics.track).toHaveBeenCalledTimes(3);
  expect(analytics.track).toHaveBeenNthCalledWith(
    1,
    'Widget Presence Verified',
    expect.objectContaining({ state: 'absent', accessory: 'present', sequence: 1 }),
  );
  expect(analytics.track).toHaveBeenNthCalledWith(
    2,
    'Widget Presence Verified',
    expect.objectContaining({ state: 'present', sequence: 2, observed_at: 12345 }),
  );
  expect(analytics.track).toHaveBeenNthCalledWith(
    3,
    'Widget Presence Verified',
    expect.objectContaining({ state: 'unknown', sequence: 3 }),
  );
});

it('reconciles an add and removal during a single trip to the Android launcher', async () => {
  const added = { home: true, accessory: false, observed: 1234, sequence: 1 };
  const removed = { home: false, accessory: false, observed: 5678, sequence: 2 };
  mockPresence.mockReturnValue({ ...removed, history: [added, removed] });
  await observeWidget();
  await observeWidget();
  expect(analytics.track).toHaveBeenCalledTimes(2);
  expect(analytics.track).toHaveBeenNthCalledWith(
    1,
    'Widget Presence Verified',
    expect.objectContaining({ state: 'present', observed_at: 1234 }),
  );
  expect(analytics.track).toHaveBeenNthCalledWith(
    2,
    'Widget Presence Verified',
    expect.objectContaining({ state: 'absent', observed_at: 5678 }),
  );
});

it('withdraws every same-edition recording when a newer feed omits the candidate', async () => {
  await syncWidget(feed('2026-11-23T10:00Z', candidate));
  const revised = { ...candidate, sourceRevision: 'b'.repeat(64) };
  await syncWidget(feed('2026-11-23T12:00Z', revised));
  await syncWidget(feed('2026-11-23T15:00Z'));
  expect(currentWidgetEdition()).toBeUndefined();
  for (const revision of [candidate, revised]) {
    const archived = widgetDetail(revision.edition, revision.sourceRevision);
    expect(archived?.audio).toBeUndefined();
    expect(widgetTap(archived, currentWidgetEdition(), null, true, true, Date.now())).toBe(
      'edition',
    );
  }
});
it('preserves observed connectivity across feed commits and redraws without a new feed', async () => {
  await refreshWidget(true);
  await syncWidget(feed('2026-11-23T15:00Z', candidate));
  expect(widgetPreview().action).toBe('Audio needs internet');
  await refreshWidget(false);
  expect(widgetPreview().action).toBe('Daily briefing');
});

it('expires the Android snapshot at its original verification deadline', async () => {
  const { Platform } = require('react-native');
  const original = Platform.OS;
  try {
    Platform.OS = 'android';
    const stamp = '2026-11-23T15:55Z';
    await syncWidget(feed(stamp, candidate));
    jest.mocked(Date.now).mockReturnValue(Date.parse(stamp) + 7 * 86400000);
    await refreshWidget();
    expect(mockSnapshot).toHaveBeenLastCalledWith({});
    expect(widgetPreview()).toEqual({});
  } finally {
    Platform.OS = original;
  }
});
