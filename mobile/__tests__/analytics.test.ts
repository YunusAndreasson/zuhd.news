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
  /** Every call that reached the SDK, in order, by method. */
  calls: [] as string[],
  /** The super properties as the SDK holds them: a reset empties them. */
  superProperties: {} as Record<string, unknown>,
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
      mockMixpanel.calls.push('track');
      // As the SDK sends it: the super properties under the event's own.
      mockMixpanel.tracked.push(
        args[1] === undefined && Object.keys(mockMixpanel.superProperties).length === 0
          ? args
          : [args[0], { ...mockMixpanel.superProperties, ...(args[1] as object) }],
      );
    }
    registerSuperProperties(properties: Record<string, unknown>) {
      mockMixpanel.calls.push('registerSuperProperties');
      Object.assign(mockMixpanel.superProperties, properties);
    }
    registerSuperPropertiesOnce(properties: Record<string, unknown>) {
      mockMixpanel.calls.push('registerSuperPropertiesOnce');
      mockMixpanel.superProperties = { ...properties, ...mockMixpanel.superProperties };
    }
    flush() {
      mockMixpanel.calls.push('flush');
    }
    reset() {
      mockMixpanel.calls.push('reset');
      mockMixpanel.resets++;
      mockMixpanel.superProperties = {};
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
  mockMixpanel.calls = [];
  mockMixpanel.superProperties = {};
  mockToken.value = 'test-token';
});

it('sends to Mixpanel’s EU endpoint, without automatic events', async () => {
  expect(MIXPANEL_SERVER_URL).toBe('https://api-eu.mixpanel.com');
  await load().track(ANALYTICS_EVENTS.STORY_SHARED, { completed: true });
  expect(mockMixpanel.constructed).toEqual([['test-token', false]]);
  expect(mockMixpanel.inits).toEqual([[false, {}, 'https://api-eu.mixpanel.com']]);
  expect(mockMixpanel.tracked).toEqual([['Story Shared', { completed: true }]]);
});

it('concurrent first calls initialise Mixpanel once', async () => {
  const analytics = load();
  await Promise.all([
    analytics.track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: '/' }),
    analytics.track(ANALYTICS_EVENTS.BRIEFING_COMPLETED),
    analytics.reset(),
  ]);
  expect(mockMixpanel.constructed).toHaveLength(1);
  expect(mockMixpanel.inits).toHaveLength(1);
  expect(mockMixpanel.resets).toBe(1);
});

it('a failed initialisation is tried again by the next call', async () => {
  const analytics = load();
  mockMixpanel.failNextInit = true;
  await analytics.track(ANALYTICS_EVENTS.STORY_SAVED);
  await analytics.track(ANALYTICS_EVENTS.STORY_SAVED);
  expect(mockMixpanel.inits).toHaveLength(2);
  expect(mockMixpanel.tracked).toHaveLength(1);
});

it('never throws', async () => {
  const analytics = load();
  mockMixpanel.throwOnTrack = true;
  await expect(analytics.track(ANALYTICS_EVENTS.STORY_SAVED)).resolves.toBeUndefined();
  mockMixpanel.failNextInit = true;
  await expect(analytics.reset()).resolves.toBeUndefined();
  await expect(analytics.register({ notifications_enabled: true })).resolves.toBeUndefined();
});

it('without a token, nothing is constructed', async () => {
  mockToken.value = undefined;
  const analytics = load();
  await analytics.track(ANALYTICS_EVENTS.STORY_SAVED);
  await analytics.register({ install_date: '2026-11-21' });
  await analytics.reset();
  expect(mockMixpanel.constructed).toHaveLength(0);
});

it('has no identify: events stay on the anonymous device id', () => {
  expect(Object.keys(load()).sort()).toEqual(['register', 'registerOnce', 'reset', 'track']);
});

it('a super property registered before Mixpanel starts goes with the first event', async () => {
  const analytics = load();
  void analytics.registerOnce({ install_date: '2026-11-21' });
  await analytics.track(ANALYTICS_EVENTS.FIRST_OPEN);
  expect(mockMixpanel.tracked).toEqual([['First Open', { install_date: '2026-11-21' }]]);
});

it('register replaces a value; registerOnce keeps the first', async () => {
  const analytics = load();
  await analytics.register({ notifications_enabled: false });
  await analytics.register({ notifications_enabled: true });
  await analytics.registerOnce({ install_date: '2026-11-20' });
  await analytics.registerOnce({ install_date: '2026-11-21' });
  await analytics.track(ANALYTICS_EVENTS.STORY_SAVED);
  expect(mockMixpanel.tracked).toEqual([
    ['Story Saved', { notifications_enabled: true, install_date: '2026-11-20' }],
  ]);
});

it('a reset sends what was queued, then puts the super properties back', async () => {
  const analytics = load();
  await analytics.registerOnce({ install_date: '2026-11-20' });
  await analytics.register({ notifications_enabled: true, ad_measurement: false });
  await analytics.track(ANALYTICS_EVENTS.LOCAL_DATA_ERASED);
  mockMixpanel.calls = [];
  await analytics.reset();
  expect(mockMixpanel.calls.slice(0, 2)).toEqual(['flush', 'reset']);
  await analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' });
  expect(mockMixpanel.tracked.at(-1)).toEqual([
    'App Opened',
    {
      install_date: '2026-11-20',
      notifications_enabled: true,
      ad_measurement: false,
      launch: 'cold',
    },
  ]);
});

it('reads the token from app.json extra, so an OTA update keeps it', async () => {
  mockToken.value = undefined;
  mockExtra.mixpanelToken = 'extra-token';
  try {
    await load().track(ANALYTICS_EVENTS.STORY_SAVED);
  } finally {
    delete mockExtra.mixpanelToken;
  }
  expect(mockMixpanel.constructed).toEqual([['extra-token', false]]);
});
