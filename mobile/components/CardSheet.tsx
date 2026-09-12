import { memo, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
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
 * globe, a slot in the strip, a row in the NOW block or in the instruments
 * list, rather than remembering which tab it lived under.
 *
 * **A fixed snap rather than content sizing.** Every other sheet in the app
 * is content-sized, which is right for prose that ends. A card is a fixed
 * composition that fills a screen and scrolls its analysis inside itself —
 * `CardFrame` owns that scroller — so it wants a bounded column, which is
 * what `snapPoints` gives it. Content sizing would measure the frame's own
 * `height: itemHeight` and produce a sheet sized to a guess.
 */

/** Room for the handle above the card's own column, so the frame's internal
 *  scroll boundary lands where the sheet actually ends. */
const HANDLE_ALLOWANCE = 56;

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
  const itemHeight = useMemo(
    () => Math.max(240, Math.round(height * LAYOUT.sheetMaxFraction) - HANDLE_ALLOWANCE),
    [height],
  );
  const snapPoints = useMemo(() => [`${Math.round(LAYOUT.sheetMaxFraction * 100)}%`], []);

  return (
    <SheetLayout
      sheetRef={sheetRef}
      onDismiss={onDismiss}
      enableDynamicSizing={false}
      snapPoints={snapPoints}
      handleTitle={card?.kicker ?? undefined}
    >
      <View style={styles.column}>
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
