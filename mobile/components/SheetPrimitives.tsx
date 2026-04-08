import { useWindowDimensions } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { LAYOUT } from '../constants/theme';

export function SheetContainer({ children }: { children?: React.ReactNode }) {
  return <FullWindowOverlay>{children}</FullWindowOverlay>;
}

export function useMaxSheetHeight() {
  return useWindowDimensions().height * LAYOUT.sheetMaxFraction;
}
