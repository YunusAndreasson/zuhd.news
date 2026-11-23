import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SheetAboutPage } from '../components/SheetAboutPage';

let mockPending = false;
jest.mock('expo-updates', () => ({
  useUpdates: () => ({ isUpdateAvailable: true, isUpdatePending: mockPending }),
}));
jest.mock('../hooks/useTheme', () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock('../components/MenuRow', () => ({ MenuRow: () => null, SectionLabel: () => null }));
jest.mock('../components/SheetContent', () => ({ SheetLink: () => null }));
jest.mock('../components/primitives', () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Icon: () => null,
}));
Object.assign(jest.requireMock('react-native'), {
  View: ({ children }: { children: ReactNode }) => children,
});

it('shows an update beside the version only once the download is ready', () => {
  const { rerender } = render(<SheetAboutPage articles={[]} version="1448.6.7" />);
  expect(screen.getByText('version 1448.6.7')).toBeTruthy();
  expect(screen.queryByText(/update ready/i)).toBeNull();
  mockPending = true;
  // Reopen About as a reader would after a background download.
  rerender(<SheetAboutPage key="reopened" articles={[]} version="1448.6.7" />);
  expect(screen.getByText('App update ready for the next launch.')).toBeTruthy();
});
