import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import type { StripItem } from '../../lib/now';
import { Icon, IconButton } from '../primitives';
import { IndicatorStrip } from './IndicatorStrip';

/**
 * The one bar above the earth: the zuhd mark · every gauge that moved, then the
 * menu.
 *
 * It was two rows — the briefing, a centred `zuhd.news` and the menu, with the
 * gauges on a line of their own under them — and the name took a whole row of
 * globe to say something the mark says in 20 points.
 *
 * **The mark is fixed at the left**, the one thing on the bar that never
 * changes, and the name the app says once.
 *
 * **The gauges scroll from beside it to the screen's edge**; the cut slot at the
 * edge says the row continues.
 *
 * **The menu rides at the end of the gauges**, after `all ›`: settings and
 * pages are visited rarely, and a fixed button cost the gauges a slot on every
 * glance. Before the gauges arrive it sits at the right edge on its own, so it
 * is never out of reach. While a story is grown it steps aside with the gauges;
 * putting the story down brings both back.
 *
 * **Listen is not here.** It is the round button on the sheet's masthead, in
 * the thumb's reach and in the row that already holds the day's controls.
 */

/** The zuhd mark — `public/logo.svg`, the same three shapes on a 32-unit box. */
const MARK_PATH = Skia.Path.MakeFromSVGString(
  'M4.5 4.5H12L4.5 16.25Z M19.5 4.5H27.5L12 27.5H4.5Z M27.5 16.25V27.5H20Z',
);
const MARK_SIZE = 20;

const ZuhdMark = memo(function ZuhdMark({ color }: { color: string }) {
  if (!MARK_PATH) return null;
  return (
    <Canvas style={styles.mark}>
      <Group transform={[{ scale: MARK_SIZE / 32 }]}>
        <Path path={MARK_PATH} color={color} />
      </Group>
    </Canvas>
  );
});

export const MapHeader = memo(function MapHeader({
  onMenuPress,
  items,
  onSelect,
  onAll,
  recede,
  gaugesEnabled,
}: {
  onMenuPress: () => void;
  items: StripItem[];
  onSelect: (item: StripItem) => void;
  onAll: () => void;
  /** 0 at rest, 1 with a story grown: the gauges step aside. */
  recede: SharedValue<number>;
  /** False while a story is grown, so a faded gauge cannot be tapped. */
  gaugesEnabled: boolean;
}) {
  const { colors, textVariants } = useTheme();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const hasGauges = items.length > 0;

  // The row is as tall as a gauge whether or not the gauges have arrived, so
  // their arrival does not move the globe, whose centre is measured from here.
  const gaugeHeight = Math.ceil(
    (textVariants.labelXsTight.lineHeight ?? 0) * Math.min(fontScale, MAX_FONT_SCALE.chrome) +
      (textVariants.tabularEmphasis.lineHeight ?? 0) * Math.min(fontScale, MAX_FONT_SCALE.tabular) +
      1 +
      SPACING.xs +
      SPACING.sm,
  );

  const gaugesStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, recede.value));
    return { opacity: 1 - p, transform: [{ translateY: -SPACING.sm * p }] };
  });

  const menu = (
    <IconButton onPress={onMenuPress} accessibilityLabel="Menu">
      <Icon name="menu" size="md" />
    </IconButton>
  );

  return (
    <View
      style={[
        styles.row,
        { paddingTop: insets.top + SPACING.xs },
        // With gauges the scroller reaches the right edge and pads its content.
        hasGauges ? styles.rightToEdge : null,
      ]}
      pointerEvents="box-none"
    >
      <View accessible accessibilityRole="header" accessibilityLabel="zuhd.news">
        <ZuhdMark color={colors.textEmphasis} />
      </View>
      <Animated.View
        style={[styles.middle, { minHeight: gaugeHeight }, gaugesStyle]}
        pointerEvents={gaugesEnabled ? 'box-none' : 'none'}
      >
        <IndicatorStrip items={items} onSelect={onSelect} onAll={onAll} trailing={menu} />
      </Animated.View>
      {hasGauges ? null : menu}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // Mirrors the reader column and the sheet, so every horizontal edge in
    // the app lands on one vertical.
    paddingHorizontal: SPACING.articlePadding,
    gap: SPACING.md,
  },
  rightToEdge: { paddingRight: 0 },
  middle: { flex: 1, minWidth: 0, justifyContent: 'center' },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
});
