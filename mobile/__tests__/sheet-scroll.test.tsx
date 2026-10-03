import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { StoryDeck } from '../components/map/StoryDeck';

jest.mock('../hooks/useTheme', () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock('react-native-gesture-handler', () => ({
  usePanGesture: (config: unknown) => config,
  useNativeGesture: (config: unknown) => config,
  GestureDetector: ({ children }: { children: ReactNode }) => children,
}));

const reactions: ((next: number, previous: number | null) => void)[] = [];
const handlers: ((event: { contentOffset: { y: number } }) => void)[] = [];
const scrollTo = jest.fn();
const passthrough = ({ children }: { children: ReactNode }) => children;
Object.assign(jest.requireMock('react-native'), { View: passthrough });
Object.assign(Reanimated.default, { View: passthrough, ScrollView: passthrough });
Object.assign(Reanimated, {
  scrollTo,
  useAnimatedReaction: (
    _prepare: unknown,
    react: (next: number, previous: number | null) => void,
  ) => {
    reactions.push(react);
  },
  useAnimatedScrollHandler: (handler: {
    onScroll: (event: { contentOffset: { y: number } }) => void;
  }) => {
    handlers.push(handler.onScroll);
    return handler.onScroll;
  },
});
const shared = (value: number) => ({ value }) as SharedValue<number>;

function setup() {
  const offset = shared(0);
  render(
    <StoryDeck
      count={1}
      index={0}
      progress={shared(0)}
      peekFade={shared(1)}
      width={400}
      sheetGesture={{} as never}
      scrollEnabled
      onScrollOffset={offset}
      keyOf={String}
      renderStory={() => null}
      renderEnd={() => null}
      onDragStart={jest.fn()}
      onSettle={jest.fn()}
    />,
  );
  const frame = reactions[0];
  const scroll = handlers[0];
  if (!frame || !scroll) throw new Error('Missing current story scroll handlers');
  return { offset, frame, scroll };
}

beforeEach(() => {
  reactions.length = 0;
  handlers.length = 0;
  scrollTo.mockClear();
});

it('returns a scrolled article to its headline in step with the closing sheet', () => {
  const { offset, frame, scroll } = setup();
  act(() => {
    scroll({ contentOffset: { y: 240 } });
    frame(0.5, 1);
  });
  expect(offset.value).toBe(120);
  expect(scrollTo).toHaveBeenLastCalledWith(expect.anything(), 0, 120, false);
  act(() => frame(0.25, 0.5));
  expect(offset.value).toBe(60);
  act(() => frame(0, 0.25));
  expect(offset.value).toBe(0);
});

it('restarts from the current scroll position after reversing a close', () => {
  const { offset, frame, scroll } = setup();
  act(() => {
    scroll({ contentOffset: { y: 240 } });
    frame(0.5, 1);
    frame(0.75, 0.5);
  });
  expect(offset.value).toBe(120);
  act(() => frame(0.5, 0.75));
  expect(offset.value).toBe(80);
});

it('does no native scrolling when the story is already at its headline', () => {
  const { frame } = setup();
  act(() => frame(0.5, 1));
  expect(scrollTo).not.toHaveBeenCalled();
});
