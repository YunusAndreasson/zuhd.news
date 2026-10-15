const mockGetExpoPushToken = jest.fn();
const mockAddPushTokenListener = jest.fn();
const mockGetSecure = jest.fn();
const mockSetSecure = jest.fn();
const mockDeleteSecure = jest.fn();
const mockFetch = jest.fn();

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'project-id' } } } },
}));

jest.mock('expo-notifications', () => ({
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushToken(...args),
  addPushTokenListener: (...args: unknown[]) => mockAddPushTokenListener(...args),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetSecure(...args),
  setItemAsync: (...args: unknown[]) => mockSetSecure(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteSecure(...args),
}));

jest.mock('../lib/fetch', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
}));

import {
  addPushTokenListener,
  registerPushToken,
  TOKEN_FETCH_TIMEOUT_MS,
  unregisterPushToken,
} from '../lib/notifications';

function http(ok: boolean, status = ok ? 200 : 500): Response {
  return { ok, status } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetExpoPushToken.mockResolvedValue({ data: 'ExponentPushToken[new]' });
  mockFetch.mockResolvedValue(http(true));
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
    expect(console.warn).toHaveBeenCalledWith(
      'Push token registration failed:',
      expect.objectContaining({ message: expect.stringContaining('HTTP 503') }),
    );
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
    mockGetSecure.mockResolvedValue('ExponentPushToken[old]');
    mockFetch.mockResolvedValue(http(false, 500));
    await unregisterPushToken();
    expect(mockDeleteSecure).not.toHaveBeenCalled();
  });

  it('deletes the local token after backend unregister succeeds', async () => {
    mockGetSecure.mockResolvedValue('ExponentPushToken[old]');
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
  mockGetSecure.mockResolvedValue('ExponentPushToken[new]');
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
  mockGetSecure.mockResolvedValue('ExponentPushToken[old]');
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
    mockGetSecure.mockResolvedValue('ExponentPushToken[old]');
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
