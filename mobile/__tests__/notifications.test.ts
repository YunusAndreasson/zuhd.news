const mockGetExpoPushToken = jest.fn();
const mockAddPushTokenListener = jest.fn();
const mockGetSecure = jest.fn();
const mockSetSecure = jest.fn();
const mockDeleteSecure = jest.fn();
const mockFetch = jest.fn();
const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockChannel = jest.fn();

jest.mock('expo-application', () => ({ applicationId: 'news.zuhd.app' }));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'project-id' } } } },
}));

jest.mock('expo-notifications', () => ({
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushToken(...args),
  addPushTokenListener: (...args: unknown[]) => mockAddPushTokenListener(...args),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
  setNotificationChannelAsync: jest.fn(),
  getNotificationChannelAsync: (...args: unknown[]) => mockChannel(...args),
  AndroidImportance: { NONE: 0, DEFAULT: 3, HIGH: 4 },
  IosAuthorizationStatus: { AUTHORIZED: 2 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetSecure(...args),
  setItemAsync: (...args: unknown[]) => mockSetSecure(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteSecure(...args),
}));

jest.mock('../lib/fetch', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
}));

import { publisherSnapshot } from '../lib/publisher-state';
import * as platform from '../constants/platform';
import {
  addPushTokenListener,
  enableNotifications,
  notificationPermissionUndetermined,
  openNotificationSettings,
  publisherDelivery,
  registerPushToken,
  TOKEN_FETCH_TIMEOUT_MS,
  unregisterPushToken,
} from '../lib/notifications';

const mockRationale = jest.fn();
const postNotifications = 'android.permission.POST_NOTIFICATIONS';

function android(api: number): void {
  jest.replaceProperty(platform, 'IS_ANDROID', true);
  const rn = jest.requireMock('react-native');
  rn.Platform.Version = api;
  rn.TurboModuleRegistry = {
    getEnforcing: () => ({ shouldShowRequestPermissionRationale: mockRationale }),
  };
}

function http(ok: boolean, status = ok ? 200 : 500): Response {
  return { ok, status } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRationale.mockResolvedValue(false);
  mockSetSecure.mockResolvedValue(undefined);
  mockGetExpoPushToken.mockResolvedValue({ data: 'ExponentPushToken[new]' });
  mockFetch.mockResolvedValue(http(true, 201));
  mockGetSecure.mockResolvedValue(null);
  mockAddPushTokenListener.mockReturnValue({ remove: jest.fn() });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('push token backend synchronization', () => {
  it('registers a rotated native token and persists only the accepted Expo token', async () => {
    const nativeToken = { type: 'ios', data: 'native-token' } as never;
    await registerPushToken(nativeToken);

    expect(mockGetExpoPushToken).toHaveBeenCalledWith({
      projectId: 'project-id',
      devicePushToken: nativeToken,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tokens$/),
      10_000,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'ExponentPushToken[new]' }),
      }),
    );
    expect(mockSetSecure).toHaveBeenCalledWith('zuhd_pushToken', 'ExponentPushToken[new]');
  });

  it('keeps a deletion target when a registration response fails', async () => {
    mockFetch.mockResolvedValue(http(false, 503));
    await registerPushToken();

    expect(mockSetSecure).toHaveBeenCalledWith('zuhd_pushToken', 'ExponentPushToken[new]');
    expect(publisherSnapshot().status).toBe('failed');
  });

  it('forwards native token rotations through the listener', async () => {
    let listener: ((token: unknown) => void) | undefined;
    mockAddPushTokenListener.mockImplementation((callback: (token: unknown) => void) => {
      listener = callback;
      return { remove: jest.fn() };
    });
    addPushTokenListener();

    listener?.({ type: 'android', data: 'rotated' });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockGetExpoPushToken).toHaveBeenCalledWith(
      expect.objectContaining({ devicePushToken: { type: 'android', data: 'rotated' } }),
    );
  });

  it('keeps the local token when backend unregister fails', async () => {
    mockGetSecure.mockImplementation(async (key) =>
      key === 'zuhd_pushToken' ? 'ExponentPushToken[old]' : null,
    );
    mockFetch.mockResolvedValue(http(false, 500));
    await unregisterPushToken();
    expect(mockDeleteSecure).not.toHaveBeenCalled();
  });

  it('deletes the local token after backend unregister succeeds', async () => {
    mockGetSecure.mockImplementation(async (key) =>
      key === 'zuhd_pushToken' ? 'ExponentPushToken[old]' : null,
    );
    await unregisterPushToken();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tokens$/),
      10_000,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(mockDeleteSecure).toHaveBeenCalledWith('zuhd_pushToken');
  });
});

it('finishes an in-flight POST before deleting the token on opt-out', async () => {
  let finishPost!: (response: Response) => void;
  const posted = new Promise<Response>((resolve) => {
    finishPost = resolve;
  });
  let startedPost!: () => void;
  const started = new Promise<void>((resolve) => {
    startedPost = resolve;
  });
  mockFetch.mockImplementationOnce(() => {
    startedPost();
    return posted;
  });
  mockGetSecure.mockImplementation(async (key) =>
    key === 'zuhd_pushToken' ? 'ExponentPushToken[new]' : null,
  );
  const registration = registerPushToken();
  await started;
  const deletion = unregisterPushToken();
  expect(mockFetch).toHaveBeenCalledTimes(1);
  finishPost(http(true));
  await Promise.all([registration, deletion]);
  expect(mockFetch.mock.calls.map((call) => call[2].method)).toEqual(['POST', 'DELETE']);
  expect(mockDeleteSecure).toHaveBeenCalledWith('zuhd_pushToken');
});

it('does not send a registration still obtaining a token when opt-out occurs', async () => {
  let finishToken!: (value: { data: string }) => void;
  mockGetExpoPushToken.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishToken = resolve;
      }),
  );
  const registration = registerPushToken();
  await Promise.resolve();
  const deletion = unregisterPushToken();
  finishToken({ data: 'ExponentPushToken[new]' });
  await Promise.all([registration, deletion]);
  expect(mockFetch).not.toHaveBeenCalled();
});

it('can retry an offline deletion using the token retained on disk', async () => {
  mockGetSecure.mockImplementation(async (key) =>
    key === 'zuhd_pushToken' ? 'ExponentPushToken[old]' : null,
  );
  mockFetch.mockRejectedValueOnce(new Error('offline'));
  await unregisterPushToken();
  expect(mockDeleteSecure).not.toHaveBeenCalled();
  await unregisterPushToken();
  expect(mockDeleteSecure).toHaveBeenCalledWith('zuhd_pushToken');
});

it('an opt-out reaches the server even while a token request hangs', async () => {
  // The Expo token request is a fetch with no timeout; on a stalled network it
  // never settles, and the DELETE queued behind it waited with it.
  jest.useFakeTimers();
  try {
    mockGetExpoPushToken.mockImplementationOnce(() => new Promise(() => {}));
    mockGetSecure.mockImplementation(async (key) =>
      key === 'zuhd_pushToken' ? 'ExponentPushToken[old]' : null,
    );
    const registration = registerPushToken();
    // Let the registration reach its token request before the opt-out.
    await jest.advanceTimersByTimeAsync(0);
    expect(mockGetExpoPushToken).toHaveBeenCalledTimes(1);
    const deletion = unregisterPushToken();
    await jest.advanceTimersByTimeAsync(TOKEN_FETCH_TIMEOUT_MS);
    await Promise.all([registration, deletion]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][2]).toMatchObject({ method: 'DELETE' });
  } finally {
    jest.useRealTimers();
  }
});

describe('asking for permission', () => {
  const permission = (status: string, granted: boolean, canAskAgain: boolean) => ({
    status,
    granted,
    canAskAgain,
  });

  it('a first ask can show the system dialog, and its answer is the answer', async () => {
    mockGetPermissions.mockResolvedValue(permission('undetermined', false, true));
    mockRequestPermissions.mockResolvedValue(permission('denied', false, false));
    await expect(enableNotifications()).resolves.toEqual({
      granted: false,
      osPrompt: true,
      outcome: 'denied',
    });
  });

  it('once refused for good, the system answers without its dialog', async () => {
    mockGetPermissions.mockResolvedValue(permission('denied', false, false));
    mockRequestPermissions.mockResolvedValue(permission('denied', false, false));
    await expect(enableNotifications()).resolves.toEqual({
      granted: false,
      osPrompt: false,
      outcome: 'denied',
    });
  });

  it('already allowed: granted, with no dialog', async () => {
    mockGetPermissions.mockResolvedValue(permission('granted', true, true));
    mockRequestPermissions.mockResolvedValue(permission('granted', true, true));
    await expect(enableNotifications()).resolves.toEqual({
      granted: true,
      osPrompt: false,
      outcome: 'granted',
    });
  });

  it('on iOS, undetermined only while the system has never been asked', async () => {
    mockGetPermissions.mockResolvedValueOnce(permission('undetermined', false, true));
    await expect(notificationPermissionUndetermined()).resolves.toBe(true);
    mockGetPermissions.mockResolvedValueOnce(permission('denied', false, true));
    await expect(notificationPermissionUndetermined()).resolves.toBe(false);
    mockGetPermissions.mockRejectedValueOnce(new Error('no module'));
    await expect(notificationPermissionUndetermined()).resolves.toBe(false);
  });
  it('a fresh Android 13 install is eligible even though Expo reports denied', async () => {
    android(33);
    mockGetPermissions.mockResolvedValue(permission('denied', false, true));
    await expect(notificationPermissionUndetermined()).resolves.toBe(true);
    expect(mockRationale).toHaveBeenCalledWith(postNotifications);
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('remembers a Settings request before its dialog returns, even after a refusal', async () => {
    android(35);
    mockGetPermissions.mockResolvedValue(permission('denied', false, true));
    const saved = new Map<string, string>();
    mockSetSecure.mockImplementation(async (key: string, value: string) => saved.set(key, value));
    mockGetSecure.mockImplementation(async (key: string) => saved.get(key) ?? null);
    mockRationale.mockResolvedValue(true);
    let markerAtRequest: string | undefined;
    mockRequestPermissions.mockImplementation(async () => {
      markerAtRequest = saved.get('zuhd_notif_asked');
      return permission('denied', false, true);
    });
    await expect(enableNotifications()).resolves.toEqual({
      granted: false,
      osPrompt: true,
      outcome: 'denied',
    });
    expect(markerAtRequest).toBe('1');
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    await expect(notificationPermissionUndetermined()).resolves.toBe(false);
  });

  it('recognizes an older Settings refusal even without the app marker', async () => {
    android(33);
    mockGetPermissions.mockResolvedValue(permission('denied', false, true));
    mockRationale.mockResolvedValue(true);
    await expect(notificationPermissionUndetermined()).resolves.toBe(false);
  });

  it.each([
    [33, 'denied', false, false],
    [35, 'granted', true, true],
    [32, 'denied', false, false],
    [32, 'granted', true, true],
    [32, 'denied', false, true],
  ] as const)(
    'skips the primer on API %d with %s, granted=%s, canAskAgain=%s',
    async (api, status, granted, canAskAgain) => {
      android(api);
      mockGetPermissions.mockResolvedValue(permission(status, granted, canAskAgain));
      await expect(notificationPermissionUndetermined()).resolves.toBe(false);
      expect(mockRationale).not.toHaveBeenCalled();
    },
  );
});

describe('notification settings', () => {
  const sendIntent = jest.fn();
  const openSettings = jest.fn();

  beforeEach(() => {
    Object.assign(jest.requireMock('react-native').Linking, { sendIntent, openSettings });
  });

  it('opens the app’s notification settings on Android', async () => {
    android(33);
    await openNotificationSettings();
    expect(sendIntent).toHaveBeenCalledWith('android.settings.APP_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: 'news.zuhd.app' },
    ]);
    expect(openSettings).not.toHaveBeenCalled();
  });

  it('falls back to app settings when the device has no notification settings activity', async () => {
    android(33);
    sendIntent.mockRejectedValueOnce(new Error('No activity'));
    await openNotificationSettings();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('opens app settings directly on iOS', async () => {
    jest.replaceProperty(platform, 'IS_ANDROID', false);
    await openNotificationSettings();
    expect(sendIntent).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});

it('retries a lost acknowledgement and credits only a 201 for the current generation and token', async () => {
  const disk = new Map<string, string>();
  mockGetSecure.mockImplementation(async (key) => disk.get(key) ?? null);
  mockSetSecure.mockImplementation(async (key, value) => disk.set(key, value));
  mockDeleteSecure.mockImplementation(async (key) => disk.delete(key));
  mockFetch.mockRejectedValueOnce(new Error('offline'));
  await registerPushToken(undefined, 'enable', 1);
  expect(publisherSnapshot().status).toBe('pending');
  mockFetch.mockResolvedValueOnce(http(true, 200));
  await registerPushToken(undefined, 'reconnect', 1);
  expect(publisherSnapshot().status).toBe('failed');
  await registerPushToken(undefined, 'retry', 1);
  expect(publisherSnapshot().status).toBe('accepted');
  await registerPushToken(undefined, 'refresh', 1);
  expect(mockFetch).toHaveBeenCalledTimes(3);
  await registerPushToken(undefined, 'enable', 2);
  expect(mockFetch).toHaveBeenCalledTimes(4);
  mockGetExpoPushToken.mockResolvedValueOnce({ data: 'rotated' });
  await registerPushToken(undefined, 'rotation', 2);
  expect(mockFetch.mock.calls.slice(-2).map((call) => call[2].method)).toEqual(['POST', 'DELETE']);
  expect(mockFetch.mock.calls.at(-1)?.[2].body).toContain('ExponentPushToken[new]');
});

it('reads both Android channels independently and requires the OS grant', async () => {
  android(35);
  mockGetPermissions.mockResolvedValue({ granted: true });
  mockChannel.mockImplementation(async (id) => ({ importance: id === 'briefing' ? 0 : 4 }));
  await expect(publisherDelivery()).resolves.toEqual({ briefing: false, breaking: true });
  mockGetPermissions.mockResolvedValue({ granted: false });
  await expect(publisherDelivery()).resolves.toEqual({ briefing: false, breaking: false });
});

it('requires full iOS authorization and a visible delivery surface', async () => {
  for (const [status, visible, expected] of [
    [3, true, false],
    [2, false, false],
    [2, true, true],
  ] as const) {
    mockGetPermissions.mockResolvedValue({
      granted: true,
      ios: { status, allowsDisplayOnLockScreen: visible },
    });
    await expect(publisherDelivery()).resolves.toEqual({ briefing: expected, breaking: expected });
  }
});

it('does not display an unexpected OS dialog if a direct opt-in loses its grant', async () => {
  mockGetPermissions.mockResolvedValue({
    status: 'undetermined',
    granted: false,
    canAskAgain: true,
  });
  await expect(enableNotifications(false)).resolves.toMatchObject({
    osPrompt: false,
    granted: false,
  });
  expect(mockRequestPermissions).not.toHaveBeenCalled();
});

it('distinguishes an observable Android dismissal from an ambiguous denial', async () => {
  android(35);
  mockGetPermissions.mockResolvedValue({ status: 'denied', granted: false, canAskAgain: true });
  for (const [status, outcome] of [
    ['undetermined', 'dismissed'],
    ['denied', 'unknown'],
  ]) {
    mockRequestPermissions.mockResolvedValue({ status, granted: false, canAskAgain: true });
    await expect(enableNotifications()).resolves.toMatchObject({ outcome });
  }
});
