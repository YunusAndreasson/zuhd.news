import { BottomSheetModal, type BottomSheetProps } from '@expo/ui/community/bottom-sheet';
import type { ComponentType } from 'react';
import { memo, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { LAYOUT } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { SheetHandle } from './SheetHandle';

/** The three wiring props every bottom sheet receives from the HomeScreen
 *  orchestrator: its modal ref, the safe-area bottom inset for content
 *  padding, and a dismiss callback. Concrete sheets extend this with their own
 *  payload-specific props so the wiring contract is declared once rather than
 *  re-typed in every sheet.
 *
 *  There is no `renderBackdrop` any more: the sheet is a real platform sheet,
 *  so the scrim is the system's (SwiftUI's on iOS, Material3's on Android) and
 *  a JS backdrop has nothing to render into. */
export interface BaseSheetProps {
  sheetRef: React.RefObject<BottomSheetMethodsRef | null>;
  bottomInset: number;
  onDismiss: () => void;
}

/** The imperative surface the orchestrator drives (`present`/`dismiss`).
 *  `@expo/ui` models this as `BottomSheetMethods`; naming it once here keeps
 *  every `useRef<…>` in the app off the library's own type path. */
export type BottomSheetMethodsRef = BottomSheetModal;

type OmittedModalProps = 'ref' | 'enablePanDownToClose' | 'backgroundStyle' | 'handleComponent';

interface SheetLayoutProps extends Omit<BottomSheetProps, OmittedModalProps> {
  sheetRef: React.RefObject<BottomSheetMethodsRef | null>;
  handleTitle?: string;
  /** Replaces the default titled handle. Rendered as the sheet's first child,
   *  not as `handleComponent` — see the note on the render below. */
  handleComponent?: ComponentType | null;
}

export const SheetLayout = memo(function SheetLayout({
  sheetRef,
  handleTitle,
  handleComponent: Handle,
  children,
  enableDynamicSizing = true,
  ...rest
}: SheetLayoutProps) {
  const { sheetStyles } = useTheme();
  const { height } = useWindowDimensions();
  // A content-sized sheet needs a ceiling, and the native side cannot give it
  // one. `enableDynamicSizing` with no `snapPoints` puts the library in
  // `fitToContents`, which measures the RN content's *natural* height and makes
  // the sheet that tall — so a long page (About, privacy, contact) grows past
  // the window and pushes its own handle, title and back chevron off the top of
  // the screen, leaving prose running under the status bar with no way back.
  //
  // gorhom's `maxDynamicContentSize` used to cap this. It was dropped on the
  // reasoning that iOS bounds a fitted detent itself and Android's partial
  // state is a fixed ~50%; the second half is only true for a sheet that is
  // *not* fit-to-content, so on Android nothing bounded it at all. The cap is
  // back, applied here rather than passed down, because only this component
  // knows which sizing mode the sheet is in.
  //
  // Fixed-snap sheets must NOT get the wrapper: they are handed a bounded
  // column already, and `SheetScrollView`'s `flexShrink: 1` fits the content to
  // it. Capping those at 70% would leave dead space inside an 85% sheet.
  const fitToContents = enableDynamicSizing && !(rest.snapPoints && rest.snapPoints.length > 0);
  const capStyle = useMemo(
    () => ({ maxHeight: Math.round(height * LAYOUT.sheetMaxFraction) }),
    [height],
  );
  // `handleComponent` is deliberately pinned to `null` and our handle rendered
  // as ordinary content instead. Native sheets do not render a custom handle —
  // `@expo/ui` only reads null-vs-non-null off that prop to decide whether to
  // show the platform's own drag indicator. Passing `SheetHandle` there would
  // silently drop the sheet's title *and* the back chevron that multi-page
  // sheets navigate with. Rendering it as the first child keeps both, and
  // keeps `SheetHandle`'s own indicator as the one the user drags — so the
  // sheet looks exactly as it did, with the platform indicator suppressed
  // rather than stacked on top of ours.
  return (
    <BottomSheetModal
      ref={sheetRef}
      enablePanDownToClose
      enableDynamicSizing={enableDynamicSizing}
      backgroundStyle={sheetStyles.bg}
      handleComponent={null}
      {...rest}
    >
      {fitToContents ? (
        <View style={capStyle}>
          {Handle ? <Handle /> : <SheetHandle title={handleTitle} />}
          {children}
        </View>
      ) : (
        <>
          {Handle ? <Handle /> : <SheetHandle title={handleTitle} />}
          {children}
        </>
      )}
    </BottomSheetModal>
  );
});
