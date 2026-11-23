import { act, renderHook } from '@testing-library/react';
import { hide } from 'expo-splash-screen';
import { useLaunchSplash } from '../hooks/useLaunchSplash';

jest.mock('expo-splash-screen', () => ({ hide: jest.fn() }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(hide).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

it('waits for the feed, then reveals a heatmap that arrives within the grace period', () => {
  const { rerender } = renderHook(({ loading, ready }) => useLaunchSplash(loading, ready), {
    initialProps: { loading: true, ready: false },
  });
  act(() => jest.advanceTimersByTime(2000));
  expect(hide).not.toHaveBeenCalled();
  rerender({ loading: false, ready: false });
  act(() => jest.advanceTimersByTime(300));
  expect(hide).not.toHaveBeenCalled();
  rerender({ loading: false, ready: true });
  act(() => jest.advanceTimersByTime(1200));
  expect(hide).toHaveBeenCalledTimes(1);
});

it('reveals the readable feed within 1.2 seconds when the heatmap is still missing', () => {
  const { rerender } = renderHook((ready) => useLaunchSplash(false, ready), {
    initialProps: false,
  });
  act(() => jest.advanceTimersByTime(1199));
  expect(hide).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  rerender(true);
  expect(hide).toHaveBeenCalledTimes(1);
});
