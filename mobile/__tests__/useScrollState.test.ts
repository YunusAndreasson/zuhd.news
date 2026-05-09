import { act, renderHook } from '@testing-library/react';
import { useScrollState } from '../hooks/useScrollState';

/**
 * Scroll state used to be reset on `resetKey` change to recover from a
 * background-refresh remount that left scrollY stale. The remount has been
 * removed (the FlatList now reconciles by slug instead), so the contract is
 * simpler: state initialises to zero and the values stay live across
 * renders without forced resets. The cleanup of a pending overscroll timer
 * on unmount is the one behaviour worth pinning.
 */

describe('useScrollState', () => {
  it('initialises every value to its zero state', () => {
    const { result } = renderHook(() => useScrollState());

    expect(result.current.scrollY.value).toBe(0);
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.overscrollFired.value).toBe(false);
    expect(result.current.caughtUpFired.current).toBe(false);
  });

  it('preserves shared value identity across renders', () => {
    const { result, rerender } = renderHook(() => useScrollState());

    const scrollYBefore = result.current.scrollY;
    const overscrollBefore = result.current.overscrollFired;

    // Mutate so a stale-comparing rerender wouldn't accidentally pass
    act(() => {
      result.current.scrollY.value = 500;
      result.current.overscrollFired.value = true;
    });

    rerender();

    // Same shared value objects (mutations preserved), not new ones — avoids
    // breaking downstream animated styles that captured the reference.
    expect(result.current.scrollY).toBe(scrollYBefore);
    expect(result.current.overscrollFired).toBe(overscrollBefore);
    expect(result.current.scrollY.value).toBe(500);
    expect(result.current.overscrollFired.value).toBe(true);
  });

  it('clears a pending overscroll timer on unmount', () => {
    jest.useFakeTimers();
    const { result, unmount } = renderHook(() => useScrollState());

    const fired = jest.fn();
    act(() => {
      result.current.overscrollTimer.current = setTimeout(
        fired,
        800,
      ) as unknown as ReturnType<typeof setTimeout>;
    });

    unmount();
    jest.advanceTimersByTime(2000);
    expect(fired).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});
