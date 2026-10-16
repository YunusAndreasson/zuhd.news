import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ colors: require('../constants/theme').DARK_COLORS }),
}));
type Props = Record<string, unknown> & { children?: ReactNode };
let mockPill: Props | null = null;
jest.mock('../components/primitives', () => ({
  Screen: ({ children }: Props) => children,
  Stack: ({ children }: Props) => children,
  Text: ({ children }: Props) => <span>{children}</span>,
  Pressable: (props: Props) => {
    mockPill = props;
    return props.children;
  },
}));
// A release build: the reader's words, not the developer's.
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
const { ErrorState } =
  require('../components/ErrorState') as typeof import('../components/ErrorState');

/** Press the pill as a finger would. */
function press() {
  const onPress = mockPill?.onPress as (() => void) | undefined;
  onPress?.();
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

it('says it is trying until the attempt settles, and cannot be pressed twice', async () => {
  const attempt = deferred();
  const onRetry = jest.fn(() => attempt.promise);
  render(<ErrorState offline={false} error={null} onRetry={onRetry} />);
  expect(screen.getByText('try again')).toBeTruthy();
  act(press);
  expect(screen.getByText('trying…')).toBeTruthy();
  expect(mockPill?.disabled).toBe(true);
  expect(mockPill?.accessibilityState).toEqual({ busy: true, disabled: true });
  await act(async () => attempt.resolve());
  expect(screen.getByText('try again')).toBeTruthy();
  expect(mockPill?.disabled).toBe(false);
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('says it is waiting for a connection while offline', async () => {
  const attempt = deferred();
  render(<ErrorState offline error={null} onRetry={() => attempt.promise} />);
  act(press);
  expect(screen.getByText('waiting for a connection…')).toBeTruthy();
  await act(async () => attempt.resolve());
});

it('goes back to `try again` when the attempt fails', async () => {
  render(
    <ErrorState offline={false} error={null} onRetry={() => Promise.reject(new Error('no'))} />,
  );
  await act(async () => press());
  expect(screen.getByText('try again')).toBeTruthy();
});
