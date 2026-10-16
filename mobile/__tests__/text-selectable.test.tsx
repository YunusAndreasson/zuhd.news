import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';

// On Android, text that mounts selectable in a new window (a platform sheet)
// waits 600 ms before it is, so the window does not hand it the focus and
// paint a band over it. Text made selectable later, an open story in the
// screen's own window, switches the prop in place on the view it has.

jest.mock('../constants/platform', () => ({ IS_ANDROID: true, ANDROID_TEXT_BASE: {} }));
jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: require('../constants/theme').DARK_COLORS,
    textVariants: { body: {} },
  }),
}));

type Props = Record<string, unknown> & { children?: ReactNode };
let mockMounts = 0;
let mockLast: Props | null = null;
jest.mock('react-native', () => {
  const { useEffect } = require('react');
  return {
    Text: (props: Props) => {
      useEffect(() => {
        mockMounts += 1;
      }, []);
      mockLast = props;
      return null;
    },
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 0.5 },
    Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android },
  };
});
const { Text } =
  require('../components/primitives/Text') as typeof import('../components/primitives/Text');

beforeEach(() => {
  jest.useFakeTimers();
  mockMounts = 0;
  mockLast = null;
});
afterEach(() => jest.useRealTimers());

it('switches selectable on in place for text made selectable after it mounts', () => {
  const { rerender } = render(<Text variant="body">A story</Text>);
  expect(mockLast?.selectable).toBeUndefined();
  rerender(
    <Text variant="body" selectable>
      A story
    </Text>,
  );
  expect(mockLast?.selectable).toBe(true);
  expect(mockMounts).toBe(1);
});

it('waits before text that mounts selectable is', () => {
  render(
    <Text variant="body" selectable>
      In a sheet
    </Text>,
  );
  expect(mockLast?.selectable).toBe(false);
  act(() => jest.advanceTimersByTime(600));
  expect(mockLast?.selectable).toBe(true);
});

it('turns off when asked, on either path', () => {
  const { rerender } = render(
    <Text variant="body" selectable>
      In a sheet
    </Text>,
  );
  act(() => jest.advanceTimersByTime(600));
  rerender(
    <Text variant="body" selectable={false}>
      In a sheet
    </Text>,
  );
  expect(mockLast?.selectable).toBe(false);
});
