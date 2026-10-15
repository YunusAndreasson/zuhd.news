import { act, renderHook } from '@testing-library/react';
import { useSheetHandoff } from '../hooks/useSheetHandoff';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('opens the latest destination once after dismissal, cancelling its fallback', () => {
  const hook = renderHook(useSheetHandoff);
  const from = { current: { dismiss: jest.fn() } };
  const first = jest.fn();
  const second = jest.fn();
  act(() => {
    hook.result.current.handOffSheet(from, first);
    hook.result.current.handOffSheet(from, second);
  });
  expect(second).not.toHaveBeenCalled();
  act(() => {
    hook.result.current.runSheetHandOff();
    jest.runAllTimers();
  });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

it('falls back when no dismissal arrives and cancels pending work on unmount', () => {
  const hook = renderHook(useSheetHandoff);
  const next = jest.fn();
  act(() => {
    hook.result.current.handOffSheet({ current: null }, next);
    jest.runAllTimers();
  });
  expect(next).toHaveBeenCalledTimes(1);
  act(() => hook.result.current.handOffSheet({ current: null }, next));
  hook.unmount();
  act(() => jest.runAllTimers());
  expect(next).toHaveBeenCalledTimes(1);
});
