import { memo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

/** Bound each invisible layout commit; leave time for the reader between batches. */
const MEASURE_BATCH = 1;

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
 * It renders one card at a time, invisible and untouchable, and yields to
 * interactions between batches. It reports all heights together,
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
  const [start, setStart] = useState(-1);
  const end = start < 0 ? 0 : Math.min(count, start + MEASURE_BATCH);
  const pending = useRef<number | null>(null);
  const finished = useRef(false);
  useEffect(() => {
    // Let the visible screen respond before starting invisible layout work.
    pending.current = requestIdleCallback(
      () => {
        pending.current = null;
        setStart(0);
      },
      { timeout: 1000 },
    );
    return () => {
      if (pending.current !== null) cancelIdleCallback(pending.current);
    };
  }, []);
  const record = useCallback(
    (index: number, height: number) => {
      heights.current.set(index, height);
      if (finished.current || heights.current.size < end) return;
      if (end < count) {
        if (pending.current === null) {
          pending.current = requestIdleCallback(
            () => {
              pending.current = null;
              setStart(end);
            },
            { timeout: 1000 },
          );
        }
        return;
      }
      finished.current = true;
      // In card order, not layout order: the caller keys each height to its
      // card. The parent keeps the old sheet height until this one report.
      onMeasured(Array.from({ length: count }, (_, i) => heights.current.get(i) ?? 0));
    },
    [count, end, onMeasured],
  );

  return (
    <View
      style={[styles.layer, { width }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: start < 0 ? 0 : end - start }, (_, offset) => {
        const index = start + offset;
        return (
          <Measured key={index} index={index} onHeight={record}>
            {renderCard(index)}
          </Measured>
        );
      })}
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
