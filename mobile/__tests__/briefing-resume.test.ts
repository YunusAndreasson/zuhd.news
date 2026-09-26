import { act, renderHook } from '@testing-library/react';
import { setIsAudioActiveAsync } from 'expo-audio';
import Storage from 'expo-sqlite/kv-store';
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
const mockStatus = { duration: 120, currentTime: 0, playing: false, isLoaded: true };

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  setIsAudioActiveAsync: jest.fn().mockResolvedValue(undefined),
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
  },
}));
jest.mock('../assets/icon.png', () => 1);

let resume: (state: AppStateStatus) => Promise<void>;
beforeEach(() => {
  jest.clearAllMocks();
  mockPlayer.currentTime = 0;
  mockPlayer.playing = false;
  jest.mocked(Storage.setItem).mockResolvedValue(undefined);
  jest.mocked(AppState.addEventListener).mockImplementation((_event, callback) => {
    resume = callback as typeof resume;
    return { remove: jest.fn() };
  });
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
    const fromURI = jest.spyOn(jest.requireMock('expo-asset').Asset, 'fromURI');
    const hook = renderHook(() => useBriefingPlayer('2026-09-26', 502, '2026-09-26T17:32:41.210Z'));
    await act(async () => {
      await hook.result.current.toggle();
    });
    expect(fromURI).toHaveBeenCalledWith(
      expect.stringMatching(/briefing-2026-09-26\.mp3\?v=2026-09-26T17%3A32%3A41\.210Z$/),
    );
  });
});
