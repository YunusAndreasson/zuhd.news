import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { type BottomSheetMethodsRef, SheetLayout } from '../components/SheetLayout';

jest.mock('@expo/ui/community/bottom-sheet', () => ({
  BottomSheetModal: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({
    onAccessibilityEscape,
    collapsable,
  }: {
    onAccessibilityEscape: () => void;
    collapsable?: boolean;
  }) =>
    collapsable === false ? (
      <button type="button" aria-label="Escape" onClick={onAccessibilityEscape} />
    ) : null,
}));
jest.mock('../components/SheetHandle', () => ({ SheetHandle: () => null }));
jest.mock('../hooks/useKeyboardTop', () => ({ useKeyboardTop: () => null }));
jest.mock('../hooks/useTheme', () => ({ useTheme: () => ({ sheetStyles: {} }) }));
Object.assign(jest.requireMock('react-native'), { useWindowDimensions: () => ({ height: 800 }) });

it('pops one sheet page, then dismisses at the root', () => {
  const back = jest.fn();
  const dismiss = jest.fn();
  const sheetRef = { current: { dismiss } as unknown as BottomSheetMethodsRef };
  const { rerender } = render(
    <SheetLayout sheetRef={sheetRef} onBackPress={back}>
      {null}
    </SheetLayout>,
  );
  screen.getByRole('button').click();
  expect(back).toHaveBeenCalledTimes(1);
  expect(dismiss).not.toHaveBeenCalled();
  rerender(<SheetLayout sheetRef={sheetRef}>{null}</SheetLayout>);
  screen.getByRole('button').click();
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(back).toHaveBeenCalledTimes(1);
});
