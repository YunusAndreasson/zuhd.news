import { act, renderHook } from '@testing-library/react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useVerticalPager } from '../hooks/useVerticalPager';

const items = ['a', 'b', 'c'];
const getItemKey = (item: string) => item;
const event = (y: number) =>
  ({ nativeEvent: { contentOffset: { y } } }) as NativeSyntheticEvent<NativeScrollEvent>;

function setup() {
  const scrollToOffset = jest.fn();
  const listRef = { current: { scrollToOffset } };
  const currentIndexRef = { current: 0 };
  const onSettled = jest.fn();
  const onItemsReordered = jest.fn();
  const hook = renderHook(() => {
    const scrollY = useSharedValue(0);
    return {
      scrollY,
      ...useVerticalPager({
        listRef,
        scrollY,
        itemHeight: 800,
        count: items.length,
        currentIndexRef,
        onSettled,
        items,
        getItemKey,
        onItemsReordered,
      }),
    };
  });
  return { ...hook, scrollToOffset, onSettled };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('lets a fresh page swipe follow a text scroll without waiting for its mark to expire', () => {
  const { result, onSettled, scrollToOffset } = setup();
  act(() => {
    result.current.handleInnerScrollConsumed(0);
    jest.advanceTimersByTime(50);
    result.current.handlePagerBeginDrag();
    result.current.handleEndDrag(event(300));
    result.current.handleMomentumBegin();
    jest.advanceTimersByTime(250);
    result.current.handleMomentumEnd(event(800));
  });
  expect(onSettled).toHaveBeenCalledWith(1);
  expect(scrollToOffset).not.toHaveBeenCalled();
});

it('still pins an inherited text-scroll tail that has no new parent drag', () => {
  const { result, onSettled, scrollToOffset } = setup();
  act(() => {
    result.current.handleInnerScrollConsumed(0);
    result.current.scrollY.value = 280;
    result.current.armSettleFromScroll();
    jest.advanceTimersByTime(150);
  });
  expect(onSettled).not.toHaveBeenCalled();
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
});

it('does not correct the page while the reader is still dragging', () => {
  const { result, scrollToOffset } = setup();
  act(() => {
    result.current.handlePagerBeginDrag();
    result.current.scrollY.value = 280;
    result.current.armSettleFromScroll();
    jest.advanceTimersByTime(1000);
  });
  expect(scrollToOffset).not.toHaveBeenCalled();
});
