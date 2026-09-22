import { act, renderHook } from '@testing-library/react';
import { AppState, type AppStateStatus } from 'react-native';
import { READ_DWELL_MS, useReadTracking } from '../hooks/useReadTracking';
import { markRead } from '../lib/read-store';

jest.mock('../lib/read-store', () => ({
  getSnapshot: () => new Set(),
  markRead: jest.fn(),
}));

let listeners: Map<string, (state: AppStateStatus) => void>;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  AppState.currentState = 'active';
  listeners = new Map();
  jest.mocked(AppState.addEventListener).mockImplementation((event, callback) => {
    listeners.set(event, callback);
    return { remove: () => listeners.delete(event) };
  });
});
afterEach(() => jest.useRealTimers());

it('marks only the story that stays in front for the full dwell', () => {
  const { rerender } = renderHook(({ slug, visible }) => useReadTracking(slug, visible), {
    initialProps: { slug: 'a', visible: false },
  });
  act(() => jest.advanceTimersByTime(READ_DWELL_MS));
  expect(markRead).not.toHaveBeenCalled();
  rerender({ slug: 'a', visible: true });
  act(() => jest.advanceTimersByTime(READ_DWELL_MS - 1));
  rerender({ slug: 'b', visible: true });
  act(() => jest.advanceTimersByTime(READ_DWELL_MS));
  expect(markRead).toHaveBeenCalledTimes(1);
  expect(markRead).toHaveBeenCalledWith('b');
});

it('cancels when covered or unmounted', () => {
  const { rerender, unmount } = renderHook(({ visible }) => useReadTracking('a', visible), {
    initialProps: { visible: true },
  });
  act(() => jest.advanceTimersByTime(READ_DWELL_MS - 1));
  rerender({ visible: false });
  act(() => jest.advanceTimersByTime(READ_DWELL_MS));
  rerender({ visible: true });
  unmount();
  act(() => jest.advanceTimersByTime(READ_DWELL_MS));
  expect(markRead).not.toHaveBeenCalled();
});

it('does not count background time and starts a fresh dwell on return', () => {
  renderHook(() => useReadTracking('a', true));
  act(() => jest.advanceTimersByTime(READ_DWELL_MS - 1));
  act(() => {
    AppState.currentState = 'background';
    listeners.get('change')?.('background');
    jest.advanceTimersByTime(60_000);
  });
  expect(markRead).not.toHaveBeenCalled();
  act(() => {
    AppState.currentState = 'active';
    listeners.get('change')?.('active');
    jest.advanceTimersByTime(READ_DWELL_MS - 1);
  });
  expect(markRead).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  expect(markRead).toHaveBeenCalledWith('a');
});

it('cancels while Android loses focus without backgrounding', () => {
  renderHook(() => useReadTracking('a', true));
  act(() => {
    listeners.get('blur')?.('active');
    jest.advanceTimersByTime(READ_DWELL_MS);
  });
  expect(markRead).not.toHaveBeenCalled();
  act(() => {
    listeners.get('focus')?.('active');
    jest.advanceTimersByTime(READ_DWELL_MS);
  });
  expect(markRead).toHaveBeenCalledWith('a');
});
