import { memo, type ReactNode, useCallback, useRef } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

/**
 * Measures today's stories once, off screen, so the open sheet can be sized
 * from the cards that actually arrived (`openStoryHeight`).
 *
 * The open sheet is one height for every story — a height that followed each
 * story made the text and the globe jump on every swipe. Sized from type for
 * the longest story that could ever arrive, it left four or five blank lines
 * under a typical one. Measuring the real cards, with the same component, at
 * the reader's width and type size, sizes it for the stories that did arrive,
 * and nothing moves while the reader goes from one to the next.
 *
 * It renders every card once, invisible and untouchable, reports their heights,
 * and is unmounted by its parent until the river, the width or the type size
 * changes. The parent keys it by those, so a new measurement is a fresh mount:
 * a card whose content changed but whose size did not would never fire
 * `onLayout` again, and the measurement would never finish.
 */
export const StoryMeasure = memo(function StoryMeasure({
  count,
  width,
  renderCard,
  onMeasured,
}: {
  count: number;
  width: number;
  /** The card exactly as the deck renders it, without anything that draws
   *  over it (the veil) and without handlers. */
  renderCard: (index: number) => ReactNode;
  /** Every card's height, in card order, once every one has laid out. */
  onMeasured: (heights: number[]) => void;
}) {
  const heights = useRef(new Map<number, number>());
  const record = useCallback(
    (index: number, height: number) => {
      heights.current.set(index, height);
      if (heights.current.size < count) return;
      // In card order, not layout order: the caller keys each height to its
      // card.
      onMeasured(Array.from({ length: count }, (_, i) => heights.current.get(i) ?? 0));
    },
    [count, onMeasured],
  );

  return (
    <View
      style={[styles.layer, { width }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }, (_, i) => (
        <Measured key={i} index={i} onHeight={record}>
          {renderCard(i)}
        </Measured>
      ))}
    </View>
  );
});

const Measured = memo(function Measured({
  index,
  onHeight,
  children,
}: {
  index: number;
  onHeight: (index: number, height: number) => void;
  children: ReactNode;
}) {
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => onHeight(index, e.nativeEvent.layout.height),
    [index, onHeight],
  );
  return (
    <View style={styles.card} onLayout={handleLayout}>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  // Stacked on top of one another and never drawn: the cards only lay out.
  layer: { position: 'absolute', top: 0, left: 0, opacity: 0 },
  card: { position: 'absolute', top: 0, left: 0, right: 0 },
});
