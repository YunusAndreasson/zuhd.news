const mockSentry = {
  init: jest.fn(),
  setTags: jest.fn(),
  reactNavigationIntegration: jest.fn(() => ({ name: 'ReactNavigation' })),
  breadcrumbsIntegration: jest.fn(() => ({ name: 'Breadcrumbs' })),
};
const mockExtra: { sentryDsn?: string } = {};

jest.mock('@sentry/react-native', () => mockSentry);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: mockExtra } },
}));
jest.mock('expo-updates', () => ({
  channel: 'production',
  updateId: 'test-update',
  runtimeVersion: 'test-runtime',
  isEmbeddedLaunch: false,
}));

const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const dev = globalThis as { __DEV__?: boolean };
const originalDev = dev.__DEV__;
const DSN = 'https://public@example.com/1';

afterEach(() => {
  if (originalDev === undefined) delete dev.__DEV__;
  else dev.__DEV__ = originalDev;
  if (originalDsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
  delete mockExtra.sentryDsn;
  jest.clearAllMocks();
});

function load(): typeof import('../lib/sentry') {
  let mod: typeof import('../lib/sentry') | undefined;
  jest.isolateModules(() => {
    mod = require('../lib/sentry');
  });
  if (!mod) throw new Error('sentry did not load');
  return mod;
}

type InitOptions = Parameters<typeof import('@sentry/react-native').init>[0];
const initOptions = (): InitOptions => mockSentry.init.mock.calls[0]![0] as InitOptions;

it.each([true, false])('does not initialize without a DSN (development: %s)', (development) => {
  dev.__DEV__ = development;
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  expect(load().sentryEnabled).toBe(false);
  expect(mockSentry.init).not.toHaveBeenCalled();
  expect(mockSentry.reactNavigationIntegration).not.toHaveBeenCalled();
});

it('does not send local development failures to the production project', () => {
  dev.__DEV__ = true;
  mockExtra.sentryDsn = DSN;
  expect(load().sentryEnabled).toBe(false);
  expect(mockSentry.init).not.toHaveBeenCalled();
  expect(mockSentry.reactNavigationIntegration).not.toHaveBeenCalled();
});

it('keeps native startup behind the JavaScript development check', () => {
  // With useNativeInit the Expo plugin starts Sentry before JavaScript runs.
  expect(require('../app.json').expo.plugins).not.toContainEqual([
    '@sentry/react-native/expo',
    expect.objectContaining({ useNativeInit: true }),
  ]);
});

it('reads the DSN from app.json extra, so an OTA update keeps it', () => {
  dev.__DEV__ = false;
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  mockExtra.sentryDsn = DSN;
  expect(load().sentryEnabled).toBe(true);
  expect(initOptions().dsn).toBe(DSN);
});

it('reports crashes in releases without capturing what anyone read', () => {
  dev.__DEV__ = false;
  process.env.EXPO_PUBLIC_SENTRY_DSN = DSN;
  expect(load().sentryEnabled).toBe(true);
  const options = initOptions();
  expect(options).toMatchObject({
    dsn: DSN,
    environment: 'production',
    enableNative: true,
    enableNativeCrashHandling: true,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableLogs: false,
    enableNetworkBreadcrumbs: false,
    enableAutoBreadcrumbTracking: false,
    tracesSampleRate: 0.1,
    tracePropagationTargets: [],
  });
  // Both unset is the SDK's no-PII mapping; any `dataCollection` starts from collect-everything.
  expect(options).not.toHaveProperty('sendDefaultPii');
  expect(options).not.toHaveProperty('dataCollection');
  expect(options.integrations).toContainEqual({ name: 'ReactNavigation' });

  expect(options.beforeBreadcrumb!({ category: 'console', message: 'x' }, {})).toBeNull();
  expect(options.beforeBreadcrumb!({ category: 'navigation' }, {})).toEqual({
    category: 'navigation',
  });
  expect(
    options.beforeSend!(
      {
        type: undefined,
        user: { id: 'x' },
        request: { url: 'https://zuhd.news/a/some-story' },
        extra: { slug: 'some-story' },
        exception: { values: [{ type: 'Error', value: 'boom' }] },
      },
      {},
    ),
  ).toEqual({ type: undefined, exception: { values: [{ type: 'Error', value: 'boom' }] } });

  const transaction = options.beforeSendTransaction!(
    {
      type: 'transaction',
      spans: [
        { op: 'http.client', description: 'GET /api/a/some-story.json' },
        { op: 'navigation' },
      ],
    } as never,
    {},
  ) as { spans: { op: string }[] };
  expect(transaction.spans).toEqual([{ op: 'navigation' }]);

  expect(mockSentry.setTags).toHaveBeenCalledWith(
    expect.objectContaining({ app: 'zuhd-news', expo_update_id: 'test-update' }),
  );
});
