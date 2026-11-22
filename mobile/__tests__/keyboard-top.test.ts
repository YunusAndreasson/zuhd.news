import { act, renderHook } from '@testing-library/react';
import { useKeyboardTop } from '../hooks/useKeyboardTop';

const mockMetrics = jest.fn();
const mockListen = jest.fn();
jest.mock('../constants/platform', () => ({ IS_ANDROID: true }));
jest.mock('react-native', () => ({
  Keyboard: {
    metrics: () => mockMetrics(),
    addListener: (...args: unknown[]) => mockListen(...args),
  },
}));

it('reads an already open keyboard and refreshes its bounds after a sheet is reopened', () => {
  const remove = jest.fn();
  mockListen.mockReturnValue({ remove });
  mockMetrics.mockReturnValue({ screenY: 400 });
  const hook = renderHook((enabled) => useKeyboardTop(enabled), { initialProps: true });
  expect(hook.result.current).toBe(400);
  mockMetrics.mockReturnValue(undefined);
  act(() => mockListen.mock.calls[1][1]());
  expect(hook.result.current).toBeNull();
  hook.rerender(false);
  expect(remove).toHaveBeenCalledTimes(2);
  mockMetrics.mockReturnValue({ screenY: 320 });
  hook.rerender(true);
  expect(hook.result.current).toBe(320);
});
