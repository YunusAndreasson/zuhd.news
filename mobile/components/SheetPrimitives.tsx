import { StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { IS_IOS } from '../constants/platform';

// FullWindowOverlay is iOS-only (renders a no-op View on Android). On Android
// we wrap in an absolute-fill View that combines elevation (cross-tree z lift
// on Android) and a high zIndex so the sheet outranks the Toast (zIndex: 100)
// and bottom/category bars (zIndex: 10). pointerEvents in style (Fabric-safe;
// the legacy prop form is deprecated under the new architecture).
export function SheetContainer({ children }: { children?: React.ReactNode }): React.ReactNode {
  if (IS_IOS) return <FullWindowOverlay>{children}</FullWindowOverlay>;
  return <View style={styles.androidOverlay}>{children}</View>;
}

const styles = StyleSheet.create({
  androidOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
    pointerEvents: 'box-none',
  },
});
