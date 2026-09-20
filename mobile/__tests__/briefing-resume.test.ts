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
jest.mock('../lib/haptics', () => ({ hapticImpact: jest.fn() }));

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
