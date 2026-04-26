import { StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { IS_IOS } from '../constants/platform';

// FullWindowOverlay is iOS-only (renders a no-op View on Android). On Android
// we wrap in an absolute-fill View with a zIndex that beats the Toast
// (zIndex: 100) and bottom/category bars (zIndex: 10) — otherwise the sheet
// renders behind those siblings. pointerEvents="box-none" keeps taps passing
// through the empty region when no sheet is mounted.
export function SheetContainer({ children }: { children?: React.ReactNode }): React.ReactNode {
  if (IS_IOS) return <FullWindowOverlay>{children}</FullWindowOverlay>;
  return (
    <View style={styles.androidOverlay} pointerEvents="box-none">
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  androidOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
});
