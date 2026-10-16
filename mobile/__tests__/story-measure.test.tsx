import { act, render } from '@testing-library/react';
import { StoryMeasure } from '../components/map/StoryMeasure';

const mockLayouts = new Map<number, (event: unknown) => void>();
const mockIdle = new Map<number, IdleRequestCallback>();
let mockNextIdle = 0;

jest.mock('react-native', () => {
  const React = require('react');
  return {
    StyleSheet: { create: (styles: unknown) => styles },
    View: ({
      children,
      onLayout,
    }: {
      children: React.ReactElement<{ 'data-index'?: number }>;
      onLayout?: (e: unknown) => void;
    }) => {
      const index = children?.props?.['data-index'];
      React.useLayoutEffect(() => {
        if (onLayout && typeof index === 'number') mockLayouts.set(index, onLayout);
        return () => {
          if (onLayout && typeof index === 'number') mockLayouts.delete(index);
        };
      }, [index, onLayout]);
      return React.createElement('div', null, children);
    },
  };
});

beforeEach(() => {
  mockLayouts.clear();
  mockIdle.clear();
  mockNextIdle = 0;
  global.requestIdleCallback = jest.fn((callback) => {
    mockIdle.set(++mockNextIdle, callback);
    return mockNextIdle;
  });
  global.cancelIdleCallback = jest.fn((id) => {
    if (id != null) mockIdle.delete(id);
  });
});

function layout(index: number, height = 100 + index) {
  act(() => mockLayouts.get(index)?.({ nativeEvent: { layout: { height } } }));
}
function idle() {
  const callbacks = [...mockIdle.values()];
  mockIdle.clear();
  act(() => {
    for (const cb of callbacks) cb({ didTimeout: false, timeRemaining: () => 10 });
  });
}
const card = (index: number) => <div data-index={index} />;

it('bounds mounted cards and reports every height once in card order after all batches', () => {
  const onMeasured = jest.fn();
  render(<StoryMeasure count={8} width={411} renderCard={card} onMeasured={onMeasured} />);
  expect([...mockLayouts.keys()]).toEqual([]);
  expect(onMeasured).not.toHaveBeenCalled();
  idle();
  for (let index = 0; index < 8; index++) {
    expect([...mockLayouts.keys()]).toEqual([index]);
    layout(index);
    layout(index, index === 1 ? 151 : 100 + index);
    if (index < 7) {
      expect(mockIdle.size).toBe(1);
      expect(onMeasured).not.toHaveBeenCalled();
      idle();
    }
  }
  expect(onMeasured).toHaveBeenCalledTimes(1);
  expect(onMeasured).toHaveBeenCalledWith([100, 151, 102, 103, 104, 105, 106, 107]);
});

it('cancels the next batch when data or type changes unmount the measurement', () => {
  const onMeasured = jest.fn();
  const view = render(
    <StoryMeasure count={8} width={411} renderCard={card} onMeasured={onMeasured} />,
  );
  idle();
  layout(0);
  expect(mockIdle.size).toBe(1);
  view.unmount();
  expect(mockIdle.size).toBe(0);
  idle();
  expect(onMeasured).not.toHaveBeenCalled();
});

it('cancels work if unmounted before the first idle opportunity', () => {
  const renderCard = jest.fn(card);
  const view = render(
    <StoryMeasure count={8} width={411} renderCard={renderCard} onMeasured={jest.fn()} />,
  );
  view.unmount();
  expect(mockIdle.size).toBe(0);
  idle();
  expect(renderCard).not.toHaveBeenCalled();
});
