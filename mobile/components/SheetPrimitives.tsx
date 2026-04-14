import { Platform, useWindowDimensions } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { LAYOUT } from '../constants/theme';

export function SheetContainer({ children }: { children?: React.ReactNode }): React.ReactNode {
  if (Platform.OS === 'ios') return <FullWindowOverlay>{children}</FullWindowOverlay>;
  return <>{children}</>;
}

export function useMaxSheetHeight(): number {
  return useWindowDimensions().height * LAYOUT.sheetMaxFraction;
}
