import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { largeContent } from '../lib/large-content';

jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ colors: require('../constants/theme').DARK_COLORS }),
}));
jest.mock('../components/primitives', () => ({ Text: () => null }));

type Props = Record<string, unknown> & { children?: ReactNode };
let mockPressed: Props | null = null;
Object.assign(jest.requireMock('react-native'), {
  Pressable: (props: Props) => {
    mockPressed = props;
    return null;
  },
  View: ({ children }: Props) => children ?? null,
});
const { AlertPill } =
  require('../components/map/AlertPill') as typeof import('../components/map/AlertPill');

it('shows the words on the control, always on, at accessibility sizes', () => {
  expect(largeContent('share')).toEqual({
    accessibilityShowsLargeContentViewer: true,
    accessibilityLargeContentTitle: 'share',
  });
});

it('shows a live alert’s line whole, which the pill cuts to one line', () => {
  render(<AlertPill title="Tropical Cyclone DOLPHIN-26" top={0} onPress={() => {}} />);
  expect(mockPressed).toMatchObject(largeContent('now · Tropical Cyclone DOLPHIN-26'));
});
