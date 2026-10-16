import { act, render, screen } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import type { ToastRef } from '../components/Toast';

jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ colors: require('../constants/theme').DARK_COLORS }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../components/primitives', () => ({ Text: () => null }));

type Props = Record<string, unknown> & { children?: ReactNode };
let pill: Props | null = null;
Object.assign(jest.requireMock('react-native'), {
  Pressable: (props: Props) => {
    pill = props;
    return <span data-testid="toast" />;
  },
});
Object.assign(Reanimated.default, { View: ({ children }: Props) => children ?? null });
const { Toast } = require('../components/Toast') as typeof import('../components/Toast');

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  pill = null;
});
afterEach(() => jest.useRealTimers());

async function mount() {
  const ref = createRef<ToastRef>();
  render(<Toast ref={ref} />);
  // The recommended timeout is read once, as the toast mounts.
  await act(async () => {});
  return ref;
}

it('is a button that says what it does when a tap acts on it', async () => {
  const ref = await mount();
  const onPress = jest.fn();
  act(() =>
    ref.current?.show('Removed · tap to undo', {
      onPress,
      hint: 'Puts the story back in saved stories',
    }),
  );
  expect(pill?.accessibilityRole).toBe('button');
  expect(pill?.accessibilityHint).toBe('Puts the story back in saved stories');
  const press = pill?.onPress as (() => void) | undefined;
  act(() => press?.());
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('is an alert, with no hint, when nothing acts on it', async () => {
  const ref = await mount();
  act(() => ref.current?.show('Saved'));
  expect(pill?.accessibilityRole).toBe('alert');
  expect(pill?.accessibilityHint).toBeUndefined();
});

it('waits for VoiceOver to finish before it is said', async () => {
  const ref = await mount();
  act(() => ref.current?.show('Saved'));
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith('Saved', {
    queue: true,
  });
});

it('stays up as long as the reader has asked controls to stay', async () => {
  (AccessibilityInfo.getRecommendedTimeoutMillis as jest.Mock).mockResolvedValueOnce(10_000);
  const ref = await mount();
  act(() => ref.current?.show('Removed · tap to undo', { onPress: jest.fn(), hint: 'Undoes it' }));
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.queryByTestId('toast')).not.toBeNull();
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.queryByTestId('toast')).toBeNull();
});

it('clears a passing word in two seconds, whatever the setting', async () => {
  (AccessibilityInfo.getRecommendedTimeoutMillis as jest.Mock).mockResolvedValueOnce(10_000);
  const ref = await mount();
  act(() => ref.current?.show('Saved'));
  act(() => jest.advanceTimersByTime(2000));
  expect(screen.queryByTestId('toast')).toBeNull();
});
