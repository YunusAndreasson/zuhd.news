import { StyleSheet, View } from 'react-native';

// A single absolute-fill overlay hosts every bottom sheet on BOTH platforms.
// zIndex outranks the Toast (zIndex: 100) and bottom/category bars (zIndex: 10);
// elevation is the Android-only cross-tree z-lift (ignored on iOS). pointerEvents
// in style (Fabric-safe; the legacy prop form is deprecated under the new arch)
// lets taps fall through the empty region when no sheet is mounted.
//
// We deliberately do NOT wrap the iOS path in react-native-screens'
// FullWindowOverlay: under the new architecture, content measured inside that
// overlay window doesn't report a stable height, so `enableDynamicSizing` sheets
// resolve a zero content detent and never open (the menu and every
// content-hugging sheet failed on iOS while Android — a plain View — worked).
// The sheet still renders above app chrome via the root-level
// BottomSheetModalProvider portal, so the extra native window bought nothing here.
export function SheetContainer({ children }: { children?: React.ReactNode }): React.ReactNode {
  return <View style={styles.overlay}>{children}</View>;
}

const styles = StyleSheet.create({
  overlay: {
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
