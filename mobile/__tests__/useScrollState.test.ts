import { act, renderHook } from '@testing-library/react';
import { useScrollState } from '../hooks/useScrollState';

/**
 * These tests guard against stale scroll-derived state after a FlatList
 * remount (resetKey change). The original bug: after a background refresh,
 * scrollY retained the old offset → first article rendered at opacity 0.
 */

describe('useScrollState', () => {
  /** Creates a mock SharedValue matching the subset used by useScrollState */
  function makeSV<T>(init: T) {
    return {
      value: init,
      get: () => init,
      modify(fn: (v: T) => T) {
        this.value = fn(this.value);
      },
      addListener: () => {},
      removeListener: () => {},
    };
  }

  it('resets all scroll state when resetKey changes', () => {
    const progressesSV = makeSV([0, 0, 0, 0]);

    const { result, rerender } = renderHook(
      ({ resetKey }) => useScrollState(resetKey, 0, progressesSV as never),
      { initialProps: { resetKey: 0 } },
    );

    // Simulate stale state accumulated during scrolling
    act(() => {
      result.current.scrollY.value = 2400;
      result.current.setCurrentIndex(3);
      result.current.overscrollFired.value = true;
      result.current.caughtUpFired.current = true;
      progressesSV.value = [0.75, 0.3, 0, 0.1];
    });

    expect(result.current.scrollY.value).toBe(2400);
    expect(result.current.currentIndex).toBe(3);
    expect(result.current.overscrollFired.value).toBe(true);
    expect(result.current.caughtUpFired.current).toBe(true);

    // Trigger reset by changing resetKey (simulates background refresh)
    rerender({ resetKey: 1 });

    // Every scroll-derived value must be back to initial
    expect(result.current.scrollY.value).toBe(0);
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.overscrollFired.value).toBe(false);
    expect(result.current.caughtUpFired.current).toBe(false);
    expect(progressesSV.value[0]).toBe(0);
  });

  it('only resets its own category progress', () => {
    const progressesSV = makeSV([0.5, 0.8, 0.3, 0.9]);

    const { rerender } = renderHook(
      ({ resetKey }) => useScrollState(resetKey, 2, progressesSV as never),
      { initialProps: { resetKey: 0 } },
    );

    rerender({ resetKey: 1 });

    // Category 2 resets, others untouched
    expect(progressesSV.value).toEqual([0.5, 0.8, 0, 0.9]);
  });

  it('clears pending overscroll timer on reset', () => {
    jest.useFakeTimers();
    const progressesSV = makeSV([0, 0, 0, 0]);

    const { result, rerender } = renderHook(
      ({ resetKey }) => useScrollState(resetKey, 0, progressesSV as never),
      { initialProps: { resetKey: 0 } },
    );

    // Simulate a pending overscroll timer that would reset overscrollFired
    act(() => {
      result.current.overscrollFired.value = true;
      result.current.overscrollTimer.current = setTimeout(() => {
        // This would set it to false, but it should be cleared by the reset
        result.current.overscrollFired.value = true; // intentionally wrong value
      }, 800);
    });

    // Reset clears the timer and resets overscrollFired itself
    rerender({ resetKey: 1 });
    expect(result.current.overscrollFired.value).toBe(false);

    // Advance past the old timer — it should NOT fire
    jest.advanceTimersByTime(1000);
    expect(result.current.overscrollFired.value).toBe(false);

    jest.useRealTimers();
  });

  it('preserves shared value identity across resets', () => {
    const progressesSV = makeSV([0, 0, 0, 0]);

    const { result, rerender } = renderHook(
      ({ resetKey }) => useScrollState(resetKey, 0, progressesSV as never),
      { initialProps: { resetKey: 0 } },
    );

    const scrollYBefore = result.current.scrollY;
    const overscrollBefore = result.current.overscrollFired;

    rerender({ resetKey: 1 });

    // Same shared value objects (just reset), not new ones — avoids
    // breaking downstream animated styles that captured the reference
    expect(result.current.scrollY).toBe(scrollYBefore);
    expect(result.current.overscrollFired).toBe(overscrollBefore);
  });
});
