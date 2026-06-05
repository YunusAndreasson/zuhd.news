import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  type BottomSheetModalProps,
} from '@gorhom/bottom-sheet';
import { memo, useMemo } from 'react';
import { useTheme } from '../hooks/useTheme';
import { SheetHandle } from './SheetHandle';
import { SheetContainer } from './SheetPrimitives';

/** The four wiring props every bottom sheet receives from the HomeScreen
 *  orchestrator: its modal ref, the safe-area bottom inset for content
 *  padding, the shared backdrop renderer, and a dismiss callback. Concrete
 *  sheets extend this with their own payload-specific props so the wiring
 *  contract is declared once rather than re-typed in every sheet. */
export interface BaseSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
}

type OmittedModalProps =
  | 'ref'
  | 'enablePanDownToClose'
  | 'backdropComponent'
  | 'backgroundStyle'
  | 'containerComponent'
  | 'handleComponent';

interface SheetLayoutProps extends Omit<BottomSheetModalProps, OmittedModalProps> {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  handleTitle?: string;
  handleComponent?: BottomSheetModalProps['handleComponent'];
}

export const SheetLayout = memo(function SheetLayout({
  sheetRef,
  renderBackdrop,
  handleTitle,
  handleComponent,
  children,
  ...rest
}: SheetLayoutProps) {
  const { sheetStyles } = useTheme();
  const Handle = useMemo(
    () => handleComponent ?? (() => <SheetHandle title={handleTitle} />),
    [handleComponent, handleTitle],
  );
  return (
    <BottomSheetModal
      ref={sheetRef}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      containerComponent={SheetContainer}
      handleComponent={Handle}
      {...rest}
    >
      {children}
    </BottomSheetModal>
  );
});
