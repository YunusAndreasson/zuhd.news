import { act, renderHook } from '@testing-library/react';
import { useSheetNavigation } from '../hooks/useSheetNavigation';

it('pops one page for a burst, then accepts a deliberate second Back', () => {
  jest.useFakeTimers();
  try {
    const { result } = renderHook(() => useSheetNavigation<'stocks' | 'detail'>());
    act(() => {
      result.current.push('stocks');
      result.current.push('detail');
    });
    const backFromDetail = result.current.pop;
    act(() => {
      expect(backFromDetail()).toBe(true);
      expect(backFromDetail()).toBe(false);
    });
    expect(result.current.current).toBe('stocks');
    jest.advanceTimersByTime(280);
    act(() => expect(result.current.pop()).toBe(false));
    jest.advanceTimersByTime(280);
    act(() => expect(result.current.pop()).toBe(false));
    jest.advanceTimersByTime(400);
    act(() => expect(result.current.pop()).toBe(true));
    expect(result.current.current).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
