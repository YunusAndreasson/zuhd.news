import { act, renderHook } from '@testing-library/react';
import { type AudioStatus, setIsAudioActiveAsync } from 'expo-audio';
import Storage from 'expo-sqlite/kv-store';
import { clearBriefingProgress } from '../lib/briefing-progress';
import { File } from 'expo-file-system';
import { AppState, type AppStateStatus } from 'react-native';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';

type PlaybackStatus = Pick<
  AudioStatus,
  'duration' | 'currentTime' | 'playing' | 'isLoaded' | 'didJustFinish' | 'error'
>;
const initialStatus: PlaybackStatus = {
  duration: 120,
  currentTime: 0,
  playing: false,
  isLoaded: true,
  didJustFinish: false,
  error: null,
};
let mockStatus = initialStatus;
const mockCachedAudio = new Set<string>();
const mockListeners = new Set<(status: PlaybackStatus) => void>();
const mockPlayer = {
  isLoaded: true,
  duration: 120,
  currentTime: 0,
  playing: false,
  addListener(event: string, listener: (status: PlaybackStatus) => void) {
    if (event !== 'playbackStatusUpdate') throw new Error(`Unexpected player event: ${event}`);
    mockListeners.add(listener);
    return {
      remove: () => {
        mockListeners.delete(listener);
      },
    };
  },
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
jest.mock('expo', () => ({
  useEventListener: (
    player: typeof mockPlayer,
    event: string,
    listener: (status: PlaybackStatus) => void,
  ) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(() => player.addListener(event, listener).remove, [player, event, listener]);
  },
}));

function emitStatus(change: Partial<PlaybackStatus>) {
  mockStatus = { ...mockStatus, ...change };
  for (const listener of mockListeners) listener(mockStatus);
}

const status = (change: Partial<PlaybackStatus>) => act(() => emitStatus(change));

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  setIsAudioActiveAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-file-system', () => ({
  Paths: { cache: '/cache' },
  File: Object.assign(
    class {
      get exists() {
        return mockCachedAudio.has(this.uri);
      }
      get size() {
        return this.exists ? 13 : 0;
      }
      uri: string;
      constructor(directory: string, name: string) {
        this.uri = `${directory}/${name}`;
      }
      delete() {
        mockCachedAudio.delete(this.uri);
      }
    },
    {
      downloadFileAsync: jest.fn(async () => ({
        uri: 'file:///briefing.mp3',
        move: jest.fn((destination: File) => {
          mockCachedAudio.add(destination.uri);
        }),
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
    multiSet: jest.fn().mockResolvedValue(undefined),
    multiRemove: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../assets/icon.png', () => 1);
const mockTrack = jest.fn();
jest.mock('../lib/analytics', () => ({
  analytics: { track: (...args: unknown[]) => mockTrack(...args) },
}));
jest.mock('../lib/firsts', () => ({ claimFirst: () => false }));

let resume: (state: AppStateStatus) => Promise<void>;
beforeEach(() => {
  jest.clearAllMocks();
  mockCachedAudio.clear();
  mockPlayer.duration = 120;
  mockPlayer.isLoaded = true;
  mockPlayer.currentTime = 0;
  mockPlayer.playing = false;
  mockStatus = initialStatus;
  jest.mocked(Storage.multiSet).mockResolvedValue(undefined);
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
  await status({ currentTime: 120, playing: false, didJustFinish: true });
  expect(mockPlayer.playing).toBe(false);
  expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0);
  expect(hook.result.current.elapsed).toBe(0);
  expect(hook.result.current.resumable).toBe(false);
  expect(hook.result.current.state).toBe('idle');
  expect(Storage.multiSet).toHaveBeenCalledWith([
    ['zuhd_briefing_pos', '0'],
    ['zuhd_briefing_date', '2026-09-27'],
  ]);
});

it('keeps media controls cleared across rewind events until the next play', async () => {
  const hook = renderHook(() => useBriefingPlayer('2026-09-27'));
  await act(async () => {
    await hook.result.current.toggle();
  });
  await status({ playing: true });
  await status({ currentTime: 120, playing: false, didJustFinish: true });
  expect(mockPlayer.clearLockScreenControls).toHaveBeenCalled();
  mockPlayer.setActiveForLockScreen.mockClear();
  await status({ currentTime: 0, playing: false, didJustFinish: false });
  expect(mockPlayer.setActiveForLockScreen).not.toHaveBeenCalled();
  await act(async () => {
    await hook.result.current.toggle();
  });
  await status({ playing: true });
  expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledTimes(1);
});

it('discards a first play when the feed rotates during audio-session setup', async () => {
  let finishSetup!: () => void;
  jest.mocked(setIsAudioActiveAsync).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishSetup = resolve;
      }),
  );
  const hook = renderHook(({ date }) => useBriefingPlayer(date), {
    initialProps: { date: '2026-09-20' },
  });
  let firstPlay!: Promise<void>;
  await act(async () => {
    firstPlay = Promise.resolve(hook.result.current.toggle());
  });
  hook.rerender({ date: '2026-09-21' });
  await act(async () => {
    finishSetup();
    await firstPlay;
  });
  expect(File.downloadFileAsync).not.toHaveBeenCalled();
  expect(mockPlayer.play).not.toHaveBeenCalled();
  expect(hook.result.current.state).toBe('idle');
  await act(async () => {
    await hook.result.current.toggle();
  });
  expect(File.downloadFileAsync).toHaveBeenCalledWith(
    expect.stringContaining('briefing-2026-09-21.mp3'),
    expect.anything(),
    expect.anything(),
  );
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
    jest.mocked(Storage.multiSet).mockReturnValue(write);
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
  expect(Storage.multiSet).toHaveBeenCalledWith([
    ['zuhd_briefing_pos', '45'],
    ['zuhd_briefing_date', '2026-09-27'],
  ]);
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
  jest.mocked(Storage.multiSet).mockClear();
  await act(async () => {
    await resume('active');
    hook.result.current.dismiss();
  });
  expect(Storage.multiSet).not.toHaveBeenCalled();
});

it('checkpoints ongoing playback without requiring a pause or foreground return', async () => {
  jest.useFakeTimers();
  const hook = renderHook(() => useBriefingPlayer('2026-09-27'));
  await act(async () => {
    await hook.result.current.toggle();
  });
  await status({ playing: true, currentTime: 20 });
  mockPlayer.currentTime = 35;
  await act(async () => {
    jest.advanceTimersByTime(15_000);
  });
  expect(Storage.multiSet).toHaveBeenCalledWith([
    ['zuhd_briefing_pos', '35'],
    ['zuhd_briefing_date', '2026-09-27'],
  ]);
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

describe('briefing events', () => {
  const sent = (name: string) => mockTrack.mock.calls.filter(([event]) => event === name);
  it('a start is sent once the briefing is heard playing, and a pause and play is the same start', async () => {
    const hook = renderHook(() => useBriefingPlayer('2026-09-27', 120));
    await act(async () => {
      await hook.result.current.toggle();
    });
    expect(sent('Briefing Started')).toEqual([]);
    await status({ playing: true });
    expect(sent('Briefing Started')).toEqual([
      ['Briefing Started', { resumed: false, first_time: false }],
    ]);
    await act(async () => {
      await hook.result.current.toggle();
    });
    await status({ playing: false });
    await act(async () => {
      await hook.result.current.toggle();
    });
    await status({ playing: true });
    expect(sent('Briefing Started')).toHaveLength(1);
  });

  it.each([false, true])(
    'reports a native failure immediately, including after playback has started (%s)',
    async (started) => {
      const hook = renderHook(() => useBriefingPlayer('2026-09-27', 120));
      await act(async () => {
        await hook.result.current.toggle();
      });
      if (started) {
        mockPlayer.currentTime = 15;
        await status({ playing: true, currentTime: 15 });
      }
      // The next native status is idle and clears the transient error. React can batch both.
      await act(async () => {
        emitStatus({ error: 'Decoder failed', playing: false, isLoaded: false });
        emitStatus({ error: null });
      });
      expect(hook.result.current.failureCount).toBe(1);
      expect(mockPlayer.replace).toHaveBeenLastCalledWith(null);
      if (started)
        expect(Storage.multiSet).toHaveBeenCalledWith([
          ['zuhd_briefing_pos', '15'],
          ['zuhd_briefing_date', '2026-09-27'],
        ]);
      await act(async () => {
        await hook.result.current.toggle();
      });
      await status({ playing: true, isLoaded: true });
      expect(hook.result.current.state).toBe('playing');
      expect(hook.result.current.failureCount).toBe(1);
    },
  );

  it('downloads a fresh copy when native playback rejects the cached recording', async () => {
    const hook = renderHook(() => useBriefingPlayer('2026-09-27', 120));
    await act(async () => {
      await hook.result.current.toggle();
    });
    expect(mockCachedAudio.size).toBe(1);
    await status({ error: 'Source error', isLoaded: false });
    await act(async () => {
      await hook.result.current.toggle();
    });
    expect(File.downloadFileAsync).toHaveBeenCalledTimes(2);
  });

  it("a failed load's lock-screen deadline cannot activate the retry", async () => {
    jest.useFakeTimers();
    try {
      mockPlayer.duration = 0;
      mockPlayer.isLoaded = false;
      const hook = renderHook(() => useBriefingPlayer('2026-09-27'));
      const playWithoutDuration = () =>
        act(async () => {
          void hook.result.current.toggle();
        });
      await playWithoutDuration();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });
      await status({ error: 'Decode failed', duration: 0, isLoaded: false });
      await playWithoutDuration();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });
      expect(mockPlayer.setActiveForLockScreen).not.toHaveBeenCalled();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });
      expect(mockPlayer.setActiveForLockScreen).toHaveBeenCalledTimes(1);
      hook.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a load that gives up is no start; the retry that plays is one', async () => {
    jest.useFakeTimers();
    try {
      const hook = renderHook(() => useBriefingPlayer('2026-09-27', 120));
      await act(async () => {
        await hook.result.current.toggle();
      });
      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });
      expect(hook.result.current.failureCount).toBe(1);
      expect(sent('Briefing Started')).toEqual([]);
      await act(async () => {
        await hook.result.current.toggle();
      });
      await status({ playing: true });
      expect(sent('Briefing Started')).toHaveLength(1);
      hook.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a briefing heard to its end is completed once, and its finish is signalled', async () => {
    const hook = renderHook(() => useBriefingPlayer('2026-09-27', 120));
    await act(async () => {
      await hook.result.current.toggle();
    });
    await status({ playing: true });
    await status({ playing: false, currentTime: 120, didJustFinish: true });
    await act(async () => {
      hook.rerender();
    });
    expect(sent('Briefing Completed')).toHaveLength(1);
    expect(hook.result.current.finishCount).toBe(1);
  });

  it('closing the player says how much was heard, in quarters', async () => {
    const hook = renderHook(() => useBriefingPlayer('2026-09-27', 120));
    await act(async () => {
      await hook.result.current.toggle();
    });
    await status({ playing: true });
    mockPlayer.currentTime = 70;
    act(() => hook.result.current.dismiss());
    expect(sent('Briefing Stopped')).toEqual([['Briefing Stopped', { heard_pct: 50 }]]);
  });

  it('play goes on playing a briefing that plays: a briefing push is never a pause', async () => {
    const hook = renderHook(() => useBriefingPlayer('2026-09-27', 120));
    await act(async () => {
      hook.result.current.play();
    });
    await status({ playing: true });
    mockPlayer.pause.mockClear();
    await act(async () => {
      hook.result.current.play();
    });
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe('playing');
  });

  it('play resumes a paused briefing', async () => {
    const hook = renderHook(() => useBriefingPlayer('2026-09-27', 120));
    await act(async () => {
      await hook.result.current.toggle();
    });
    await status({ playing: true });
    await act(async () => {
      await hook.result.current.toggle();
    });
    await status({ playing: false });
    mockPlayer.play.mockClear();
    await act(async () => {
      hook.result.current.play();
    });
    expect(mockPlayer.play).toHaveBeenCalled();
  });
});
