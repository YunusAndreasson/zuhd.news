import { memo, useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { LAYOUT } from '../constants/theme';
import type { CardStatus } from '../lib/card-history';
import type { SwipeCard } from '../lib/cards/rank';
import { CardView } from './cards/CardView';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

/**
 * A data card, in a sheet.
 *
 * This is where the graphs went. The three deck pagers are gone with the
 * section rail, but nothing about a card changed: `CardView` and `CardFrame`
 * render here exactly as they rendered there — the reading, the chart, the
 * desk's paragraph, the delta chip, the source caption, the same four tiers
 * in the same order. What changed is only how you arrive: a mark on the
 * globe, a slot in the strip, or a row in the instruments
 * list, rather than remembering which tab it lived under.
 *
 * **A fixed snap rather than content sizing.** Every other sheet in the app
 * is content-sized, which is right for prose that ends. A card is a fixed
 * composition that fills a screen and scrolls its analysis inside itself —
 * `CardFrame` owns that scroller — so it wants a bounded column, which is
 * what `snapPoints` gives it. Content sizing would measure the frame's own
 * `height: itemHeight` and produce a sheet sized to a guess.
 *
 * **Measured, not guessed.** The column the card fills is the sheet's own
 * layout. Sizing it as 85% of the window less a handle allowance left a band
 * of empty sheet under the analysis on a 411pt Android phone, where the
 * handle is shorter than the allowance; the guess now covers only the first
 * frame, before the column has been measured.
 *
 * **No handle title.** The card prints its own kicker line directly under the
 * handle — `current · what traders think · Sep 12` — so a title reading
 * "what traders think" above it was the same fact twice, one line apart.
 */

/** Room for the handle above the card's column, for the first-frame estimate. */
const HANDLE_ALLOWANCE = 56;
/** Below this a measurement is a sheet still presenting, not a column to fill. */
const MIN_COLUMN = 240;

interface CardSheetProps extends BaseSheetProps {
  card: SwipeCard | null;
  status?: CardStatus;
}

export const CardSheet = memo(function CardSheet({
  sheetRef,
  card,
  status,
  onDismiss,
}: CardSheetProps) {
  const { height } = useWindowDimensions();
  // Not a shared value the card can scroll: inside a sheet there is no pager
  // above it, so the arrival interpolation resolves at offset 0 — fully
  // arrived, no transform. That is the correct reading of the same code.
  const scrollY = useSharedValue(0);
  const estimate = useMemo(
    () => Math.max(MIN_COLUMN, Math.round(height * LAYOUT.sheetMaxFraction) - HANDLE_ALLOWANCE),
    [height],
  );
  const [measured, setMeasured] = useState<number | null>(null);
  const handleColumnLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    if (next < MIN_COLUMN) return;
    setMeasured((prev) => (prev === next ? prev : next));
  }, []);
  const itemHeight = measured ?? estimate;
  const snapPoints = useMemo(() => [`${Math.round(LAYOUT.sheetMaxFraction * 100)}%`], []);

  return (
    <SheetLayout
      sheetRef={sheetRef}
      onDismiss={onDismiss}
      enableDynamicSizing={false}
      snapPoints={snapPoints}
    >
      <View style={styles.column} onLayout={handleColumnLayout}>
        {card ? (
          <CardView
            card={card}
            itemHeight={itemHeight}
            index={0}
            scrollY={scrollY}
            status={status}
          />
        ) : null}
      </View>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  column: { flex: 1 },
});
