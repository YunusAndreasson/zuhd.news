import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { LAYOUT } from '../constants/theme';
import type { SwipeCard } from '../lib/cards/rank';
import { CardView } from './cards/CardView';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

/**
 * A data card, in a sheet.
 *
 * `CardView` and `CardFrame` render here the reading, the chart, the desk's
 * paragraph, the delta chip and the source caption, in that order. You arrive
 * from a gauge in the top bar, a mark on the globe, a row in the instruments
 * list or the odds on a story.
 *
 * **It opens as high as a resting story, not over the map.** A gauge is a
 * place on the earth as much as a number, and the globe flies there as the
 * card opens — so the card first takes the room the news card takes at rest
 * (`peekHeight`, from `computeDeckLayout`), and the reader pulls it up for the
 * rest. It used to open at 85% and cover the flight it had just started. On
 * Android the platform sheet has only a partial (~half) and a full state, so
 * the first detent lands at half there rather than at the story's height.
 *
 * **One column, scrolled by the sheet.** The card was a fixed-height page with
 * its analysis in a scroll view of its own, the shape of the full-screen
 * pagers it came from. In a sheet that second scroll only hid the source
 * caption behind a region nobody knew to drag, so it is gone, and so is the
 * measuring that sized the page.
 *
 * **No handle title.** The card prints its own kicker line directly under the
 * handle — `current · what traders think · Sep 12` — so a title reading
 * "what traders think" above it was the same fact twice, one line apart.
 */

interface CardSheetProps extends BaseSheetProps {
  card: SwipeCard | null;
  /** The resting story card's height: where the card first opens. */
  peekHeight: number;
  /** Opens a story the card cites. */
  onStoryPress?: (slug: string) => void;
}

export const CardSheet = memo(function CardSheet({
  sheetRef,
  bottomInset,
  card,
  peekHeight,
  onDismiss,
  onStoryPress,
}: CardSheetProps) {
  const snapPoints = useMemo(
    () => [Math.round(peekHeight), `${Math.round(LAYOUT.sheetMaxFraction * 100)}%`],
    [peekHeight],
  );

  return (
    <SheetLayout
      sheetRef={sheetRef}
      onDismiss={onDismiss}
      enableDynamicSizing={false}
      snapPoints={snapPoints}
      index={0}
    >
      <SheetScrollView bottomInset={bottomInset} contentContainerStyle={styles.flush}>
        {/* Keyed by card, so the next card mounts fresh: its chart draws in and
            measures its own width, instead of inheriting the last card's. */}
        {card ? <CardView key={card.id} card={card} onStoryPress={onStoryPress} /> : null}
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  // `CardFrame` pads its own column, on the same vertical as the story card.
  flush: { paddingHorizontal: 0, paddingTop: 0 },
});
