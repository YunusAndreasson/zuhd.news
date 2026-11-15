/**
 * Mixpanel: initialised once per launch against the EU endpoint, anonymous,
 * and silent whatever fails. Plain functions and a class rather than
 * `jest.fn` for the SDK, so a reset between tests cannot empty them.
 */
const mockMixpanel = {
  constructed: [] as unknown[][],
  inits: [] as unknown[][],
  tracked: [] as unknown[][],
  resets: 0,
  failNextInit: false,
  throwOnTrack: false,
};

jest.mock('mixpanel-react-native', () => ({
  Mixpanel: class {
    constructor(...args: unknown[]) {
      mockMixpanel.constructed.push(args);
    }
    async init(...args: unknown[]) {
      mockMixpanel.inits.push(args);
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (mockMixpanel.failNextInit) {
        mockMixpanel.failNextInit = false;
        throw new Error('init failed');
      }
    }
    track(...args: unknown[]) {
      if (mockMixpanel.throwOnTrack) throw new Error('track failed');
      mockMixpanel.tracked.push(args);
    }
    reset() {
      mockMixpanel.resets++;
    }
  },
}));

const mockToken: { value: string | undefined } = { value: 'test-token' };
const mockExtra: { mixpanelToken?: string } = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: mockExtra } },
}));
jest.mock('../constants/analytics', () =>
  Object.defineProperty(
    { ...jest.requireActual<Record<string, unknown>>('../constants/analytics') },
    'MIXPANEL_TOKEN',
    { get: () => mockToken.value },
  ),
);

const { ANALYTICS_EVENTS, MIXPANEL_SERVER_URL } =
  jest.requireActual<typeof import('../constants/analytics')>('../constants/analytics');

function load(): typeof import('../lib/analytics')['analytics'] {
  let mod: typeof import('../lib/analytics') | undefined;
  jest.isolateModules(() => {
    mod = require('../lib/analytics');
  });
  if (!mod) throw new Error('analytics did not load');
  return mod.analytics;
}

beforeEach(() => {
  mockMixpanel.constructed = [];
  mockMixpanel.inits = [];
  mockMixpanel.tracked = [];
  mockMixpanel.resets = 0;
  mockMixpanel.failNextInit = false;
  mockMixpanel.throwOnTrack = false;
  mockToken.value = 'test-token';
});

it('sends to Mixpanel’s EU endpoint, without automatic events', async () => {
  expect(MIXPANEL_SERVER_URL).toBe('https://api-eu.mixpanel.com');
  await load().track(ANALYTICS_EVENTS.STORY_SHARED);
  expect(mockMixpanel.constructed).toEqual([['test-token', false]]);
  expect(mockMixpanel.inits).toEqual([[false, {}, 'https://api-eu.mixpanel.com']]);
  expect(mockMixpanel.tracked).toEqual([['Story Shared', undefined]]);
});

it('concurrent first calls initialise Mixpanel once', async () => {
  const analytics = load();
  await Promise.all([
    analytics.track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: '/' }),
    analytics.track(ANALYTICS_EVENTS.BRIEFING_STARTED),
    analytics.reset(),
  ]);
  expect(mockMixpanel.constructed).toHaveLength(1);
  expect(mockMixpanel.inits).toHaveLength(1);
  expect(mockMixpanel.resets).toBe(1);
});

it('a failed initialisation is tried again by the next call', async () => {
  const analytics = load();
  mockMixpanel.failNextInit = true;
  await analytics.track(ANALYTICS_EVENTS.STORY_SHARED);
  await analytics.track(ANALYTICS_EVENTS.STORY_SHARED);
  expect(mockMixpanel.inits).toHaveLength(2);
  expect(mockMixpanel.tracked).toHaveLength(1);
});

it('never throws', async () => {
  const analytics = load();
  mockMixpanel.throwOnTrack = true;
  await expect(analytics.track(ANALYTICS_EVENTS.STORY_SHARED)).resolves.toBeUndefined();
  mockMixpanel.failNextInit = true;
  await expect(analytics.reset()).resolves.toBeUndefined();
});

it('without a token, nothing is constructed', async () => {
  mockToken.value = undefined;
  const analytics = load();
  await analytics.track(ANALYTICS_EVENTS.STORY_SHARED);
  await analytics.reset();
  expect(mockMixpanel.constructed).toHaveLength(0);
});

it('has no identify: events stay on the anonymous device id', () => {
  expect(Object.keys(load()).sort()).toEqual(['reset', 'track']);
});

it('reads the token from app.json extra, so an OTA update keeps it', async () => {
  mockToken.value = undefined;
  mockExtra.mixpanelToken = 'extra-token';
  try {
    await load().track(ANALYTICS_EVENTS.STORY_SHARED);
  } finally {
    delete mockExtra.mixpanelToken;
  }
  expect(mockMixpanel.constructed).toEqual([['extra-token', false]]);
});
