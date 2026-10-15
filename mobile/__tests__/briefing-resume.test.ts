import { act, renderHook } from '@testing-library/react';
import { setIsAudioActiveAsync } from 'expo-audio';
import Storage from 'expo-sqlite/kv-store';
import { clearBriefingProgress } from '../lib/briefing-progress';
import { File } from 'expo-file-system';
import { AppState, type AppStateStatus } from 'react-native';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';

const mockPlayer = {
  isLoaded: true,
  duration: 120,
  currentTime: 0,
  playing: false,
  play: jest.fn(() => {
    mockPlayer.playing = true;
  }),
  pause: jest.fn(() => {
    mockPlayer.playing = false;
  }),
  replace: jest.fn(),
  seekTo: jest.fn().mockResolvedValue(undefined),
  clearLockScreenControls: jest.fn(),
  setActiveForLockScreen: jest.fn(),
};
let mockStatus = {
  duration: 120,
  currentTime: 0,
  playing: false,
  isLoaded: true,
  didJustFinish: false,
};

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  setIsAudioActiveAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-file-system', () => ({
  Paths: { cache: '/cache' },
  File: Object.assign(
    class {
      exists = false;
      size = 0;
      uri: string;
      constructor(directory: string, name: string) {
        this.uri = `${directory}/${name}`;
      }
    },
    {
      downloadFileAsync: jest.fn(async () => ({
        uri: 'file:///briefing.mp3',
        move: jest.fn(),
        delete: jest.fn(),
      })),
    },
  ),
}));
jest.mock('expo-asset', () => ({
  Asset: {
    fromURI: () => ({ downloadAsync: () => Promise.resolve({ localUri: 'file:///briefing.mp3' }) }),
    loadAsync: () => Promise.resolve([{ localUri: 'file:///icon.png' }]),
  },
}));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue(null) }));
jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../assets/icon.png', () => 1);

let resume: (state: AppStateStatus) => Promise<void>;
beforeEach(() => {
  jest.clearAllMocks();
  mockPlayer.currentTime = 0;
  mockPlayer.playing = false;
  mockStatus = {
    duration: 120,
    currentTime: 0,
    playing: false,
    isLoaded: true,
    didJustFinish: false,
  };
  jest.mocked(Storage.setItem).mockResolvedValue(undefined);
  jest.mocked(AppState.addEventListener).mockImplementation((_event, callback) => {
    resume = callback as typeof resume;
    return { remove: jest.fn() };
  });
});

it('pauses before rewinding an ended player so the briefing does not loop', async () => {
  const hook = renderHook(() => useBriefingPlayer('2026-09-27'));
  await act(async () => {
    await hook.result.current.toggle();
  });
  // ExoPlayer keeps playWhenReady true at the end; seeking starts it again
  // unless pause has first cleared that intent.
  let playWhenReady = true;
  mockPlayer.pause.mockImplementationOnce(() => {
    playWhenReady = false;
  });
  mockPlayer.seekTo.mockImplementationOnce(async () => {
    mockPlayer.playing = playWhenReady;
  });
  mockStatus = { ...mockStatus, currentTime: 120, playing: false, didJustFinish: true };
  await act(async () => {
    hook.rerender();
  });
  expect(mockPlayer.playing).toBe(false);
  expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0);
  expect(hook.result.current.elapsed).toBe(0);
  expect(hook.result.current.resumable).toBe(false);
  expect(hook.result.current.state).toBe('idle');
  expect(Storage.setItem).toHaveBeenCalledWith('zuhd_briefing_pos', '0');
});

it.each(['dismiss', 'rotate date', 'unmount'] as const)(
  'ignores a deferred foreground resume after %s',
  async (change) => {
    const hook = renderHook(({ date }) => useBriefingPlayer(date), {
      initialProps: { date: '2026-09-20' },
    });
    await act(async () => {
      await hook.result.current.toggle();
    });
    mockPlayer.currentTime = 30;

    let finishWrite!: () => void;
    const write = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    jest.mocked(Storage.setItem).mockReturnValue(write);
    jest.mocked(setIsAudioActiveAsync).mockClear();
    const pendingResume = resume('active');

    act(() => {
      if (change === 'dismiss') hook.result.current.dismiss();
      else if (change === 'rotate date') hook.rerender({ date: '2026-09-21' });
      else hook.unmount();
    });

    await act(async () => {
      finishWrite();
      await expect(pendingResume).resolves.toBeUndefined();
    });
    expect(setIsAudioActiveAsync).not.toHaveBeenCalledWith(true);
    if (change !== 'unmount') {
      expect(hook.result.current.resumable).toBe(false);
      expect(hook.result.current.state).not.toBe('playing');
    }
  },
);

describe('a briefing recorded again under the same date', () => {
  // 2026-09-26 was recorded at 05:28 and again at 17:34, with a new voice, at
  // the same address. A place in the first is not a place in the second.
  const stored = (date: string, pos = '90') => {
    jest
      .mocked(Storage.getItem)
      .mockImplementation(async (key: string) =>
        key === 'zuhd_briefing_pos' ? pos : key === 'zuhd_briefing_date' ? date : null,
      );
  };
  afterEach(() => jest.mocked(Storage.getItem).mockResolvedValue(null));

  const settle = () => act(async () => {});

  it('does not resume a place saved in the earlier recording', async () => {
    stored('2026-09-26#2026-09-26T05:28:09.976Z');
    const hook = renderHook(() => useBriefingPlayer('2026-09-26', 502, '2026-09-26T17:32:41.210Z'));
    await settle();
    expect(hook.result.current.resumable).toBe(false);
  });

  it('resumes a place saved in the same recording', async () => {
    stored('2026-09-26#2026-09-26T17:32:41.210Z');
    const hook = renderHook(() => useBriefingPlayer('2026-09-26', 502, '2026-09-26T17:32:41.210Z'));
    await settle();
    expect(hook.result.current.resumable).toBe(true);
    expect(hook.result.current.resumeAt).toBe(90);
  });

  it('still resumes a place saved before recordings were told apart', async () => {
    stored('2026-09-26');
    const hook = renderHook(() => useBriefingPlayer('2026-09-26', 502, '2026-09-26T17:32:41.210Z'));
    await settle();
    expect(hook.result.current.resumable).toBe(true);
  });

  it('asks for the recording by its time, so a kept download of the first is not replayed', async () => {
    const download = jest.mocked(File.downloadFileAsync);
    const hook = renderHook(() => useBriefingPlayer('2026-09-26', 502, '2026-09-26T17:32:41.210Z'));
    await act(async () => {
      await hook.result.current.toggle();
    });
    expect(download).toHaveBeenCalledWith(
      expect.stringMatching(/briefing-2026-09-26\.mp3\?v=2026-09-26T17%3A32%3A41\.210Z$/),
      expect.anything(),
      expect.objectContaining({ signal: expect.anything() }),
    );
  });
});

it('saves progress when the app backgrounds', async () => {
  const hook = renderHook(() => useBriefingPlayer('2026-09-27'));
  await act(async () => {
    await hook.result.current.toggle();
  });
  mockPlayer.currentTime = 45;
  await act(async () => {
    await resume('background');
  });
  expect(Storage.setItem).toHaveBeenCalledWith('zuhd_briefing_pos', '45');
});

it('erases a mounted player after earlier writes finish, without restoring progress later', async () => {
  const hook = renderHook(() => useBriefingPlayer('2026-09-27'));
  await act(async () => {
    await hook.result.current.toggle();
  });
  mockPlayer.currentTime = 45;
  act(() => hook.result.current.dismiss());
  await act(async () => {
    await clearBriefingProgress();
  });
  expect(hook.result.current.resumeAt).toBe(0);
  expect(hook.result.current.resumable).toBe(false);
  expect(mockPlayer.replace).toHaveBeenLastCalledWith(null);
  jest.mocked(Storage.setItem).mockClear();
  await act(async () => {
    await resume('active');
    hook.result.current.dismiss();
  });
  expect(Storage.setItem).not.toHaveBeenCalled();
});

it('checkpoints ongoing playback without requiring a pause or foreground return', async () => {
  jest.useFakeTimers();
  const hook = renderHook(() => useBriefingPlayer('2026-09-27'));
  await act(async () => {
    await hook.result.current.toggle();
  });
  mockStatus = { ...mockStatus, playing: true, currentTime: 20 };
  await act(async () => {
    hook.rerender();
  });
  mockPlayer.currentTime = 35;
  await act(async () => {
    jest.advanceTimersByTime(15_000);
  });
  expect(Storage.setItem).toHaveBeenCalledWith('zuhd_briefing_pos', '35');
  hook.unmount();
  jest.useRealTimers();
});

it('publishes only completed downloads under the reusable MP3 cache name', async () => {
  const hook = renderHook(() => useBriefingPlayer('2026-09-27'));
  await act(async () => {
    await hook.result.current.toggle();
  });
  const download = jest.mocked(File.downloadFileAsync);
  const target = download.mock.calls[0]?.[1];
  expect(target?.uri).toMatch(/\.part$/);
  const complete = await download.mock.results[0]?.value;
  expect(complete.move).toHaveBeenCalledWith(
    expect.objectContaining({ uri: expect.stringMatching(/\.mp3$/) }),
  );
  expect(mockPlayer.replace).toHaveBeenCalledWith(expect.stringMatching(/\.mp3$/));
});

it('cancels an interrupted download without playing it, and starts a fresh download on retry', async () => {
  mockPlayer.isLoaded = false;
  const download = jest.mocked(File.downloadFileAsync);
  download.mockImplementationOnce(
    (_url, _file, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () =>
          reject(new Error('connection interrupted')),
        );
      }),
  );
  const hook = renderHook(() => useBriefingPlayer('2026-09-27'));
  let pending!: ReturnType<typeof hook.result.current.toggle>;
  await act(async () => {
    pending = hook.result.current.toggle();
  });
  expect(download).toHaveBeenCalledTimes(1);
  act(() => hook.result.current.dismiss());
  await act(async () => {
    await pending;
  });
  expect(download.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
  expect(mockPlayer.play).not.toHaveBeenCalled();
  expect(mockPlayer.replace).not.toHaveBeenCalledWith(expect.stringMatching(/https:|\.mp3$/));
  mockPlayer.isLoaded = true;
  await act(async () => {
    await hook.result.current.toggle();
  });
  expect(download).toHaveBeenCalledTimes(2);
  expect(download.mock.calls[1]?.[1]?.uri).not.toBe(download.mock.calls[0]?.[1]?.uri);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
});
