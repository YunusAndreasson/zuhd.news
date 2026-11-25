import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { WidgetSetup } from '../components/WidgetSetup';
import { analytics } from '../lib/analytics';
import { canPinWidget, pinWidget, observeWidget } from '../lib/widget-store';

jest.mock('../hooks/useTheme', () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock('../lib/analytics', () => ({ analytics: { track: jest.fn() } }));
jest.mock('../lib/widget-store', () => ({
  widgetPreview: () => ({}),
  widgetWallpaper: () => false,
  currentWidgetEdition: () => undefined,
  observeWidget: jest.fn(),
  canPinWidget: jest.fn(),
  pinWidget: jest.fn(),
}));
jest.mock('../components/MenuRow', () => ({
  MenuRow: ({ title, onPress }: { title: string; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {title}
    </button>
  ),
}));
jest.mock('../components/primitives', () => ({
  Icon: () => null,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Pressable: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock('../components/Spark', () => ({ Spark: () => null }));
const rn = jest.requireMock('react-native');
rn.View = ({ children }: { children: ReactNode }) => <div>{children}</div>;
beforeEach(() => {
  jest.clearAllMocks();
  rn.Platform.OS = 'ios';
});
it('shows the iPhone guide and checks actual placement on leaving setup', () => {
  const done = jest.fn();
  const view = render(<WidgetSetup done={done} />);
  fireEvent.click(screen.getByText('Show how to add'));
  expect(screen.getByText('Add to your Home Screen')).toBeTruthy();
  expect(pinWidget).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Done'));
  expect(done).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(observeWidget).toHaveBeenCalledTimes(1);
});
it.each([true, false])('requests Android pinning and handles request dispatch %s', (dispatched) => {
  rn.Platform.OS = 'android';
  jest.mocked(canPinWidget).mockReturnValue(true);
  jest.mocked(pinWidget).mockReturnValue(dispatched);
  render(<WidgetSetup done={() => {}} />);
  fireEvent.click(screen.getByText('Add to Home screen'));
  expect(pinWidget).toHaveBeenCalledTimes(1);
  expect(!!screen.queryByText('Open Widgets and find zuhd.news.')).toBe(!dispatched);
  expect(analytics.track).toHaveBeenCalledWith('Widget Setup Started', {
    source: 'menu',
    method: 'android_pin',
  });
  expect(analytics.track).not.toHaveBeenCalledWith('Widget Presence Verified', expect.anything());
});
it('offers manual placement immediately on a launcher without pin support', () => {
  rn.Platform.OS = 'android';
  jest.mocked(canPinWidget).mockReturnValue(false);
  render(<WidgetSetup done={() => {}} />);
  fireEvent.click(screen.getByText('Show how to add'));
  expect(screen.getByText('Touch and hold an empty area of your Home screen.')).toBeTruthy();
  expect(pinWidget).not.toHaveBeenCalled();
});
