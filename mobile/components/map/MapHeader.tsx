import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { formatAudioDurationMinutes } from '../../lib/audio-duration';
import type { StripItem } from '../../lib/now';
import { Icon, IconButton } from '../primitives';
import { IndicatorStrip } from './IndicatorStrip';

/**
 * The one bar above the earth: listen · every gauge that moved · menu.
 *
 * It was two rows — the briefing, a centred `zuhd.news` and the menu, with the
 * gauges on a line of their own under them — and the name took a whole row of
 * globe to say something the menu already says. One row gives that height back
 * to the earth.
 *
 * **Listen is first**, where a reader's eye starts: a round play button, the
 * only filled control on the bar. It was a word pill in this corner, and before
 * that a corner pill over the globe (not found) and the button on the sheet's
 * masthead (found, but it made the first row of the news list a control panel).
 * Absent rather than disabled when there is no briefing, and while the player
 * is up — a dead control the reader has to press to discover is dead is the
 * failure the old pill's "No briefing available" toast already made once.
 *
 * **The gauges fill the middle** and scroll sideways between the two buttons;
 * the slot cut at the menu's edge is what says the row continues.
 *
 * **The menu is last and quietest**: settings and pages, visited rarely.
 *
 * **The mark stands in when there is nothing to read.** Before the gauges load,
 * and while a story is grown and the gauges have stepped aside, the zuhd mark
 * sits where they were — the name said once, in the space nothing else needs.
 */

/** The zuhd mark — `public/logo.svg`, the same three shapes on a 32-unit box. */
const MARK_PATH = Skia.Path.MakeFromSVGString(
  'M4.5 4.5H12L4.5 16.25Z M19.5 4.5H27.5L12 27.5H4.5Z M27.5 16.25V27.5H20Z',
);
const MARK_SIZE = 20;
/** The play button's diameter: a 14pt glyph with room around it. */
const LISTEN_SIZE = 32;

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
  briefingAvailable,
  briefingResumable,
  briefingDuration,
  onBriefingPress,
  items,
  onSelect,
  onAll,
  recede,
  gaugesEnabled,
}: {
  onMenuPress: () => void;
  briefingAvailable: boolean;
  briefingResumable: boolean;
  briefingDuration?: number;
  onBriefingPress: () => void;
  items: StripItem[];
  onSelect: (item: StripItem) => void;
  onAll: () => void;
  /** 0 at rest, 1 with a story grown: the gauges step aside for the mark. */
  recede: SharedValue<number>;
  /** False while a story is grown, so a faded gauge cannot be tapped. */
  gaugesEnabled: boolean;
}) {
  const { colors, textVariants } = useTheme();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const minutes = formatAudioDurationMinutes(briefingDuration);
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
  const markStyle = useAnimatedStyle(() => {
    if (!hasGauges) return { opacity: 1 };
    return { opacity: Math.min(1, Math.max(0, recede.value)) };
  }, [hasGauges]);
  const markSpoken = !hasGauges || !gaugesEnabled;

  return (
    <View style={[styles.row, { paddingTop: insets.top + SPACING.xs }]} pointerEvents="box-none">
      {briefingAvailable ? (
        <IconButton
          onPress={onBriefingPress}
          haptic="none"
          style={[styles.listen, { backgroundColor: colors.pillBg, borderColor: colors.rule }]}
          accessibilityLabel={`${briefingResumable ? 'Resume daily briefing' : 'Daily briefing'}${minutes ? `, ${minutes}` : ''}`}
          accessibilityHint={
            briefingResumable ? "Resumes today's audio briefing" : "Plays today's audio briefing"
          }
        >
          <Icon name="play" size="sm" tone="default" />
        </IconButton>
      ) : null}

      <View style={[styles.middle, { minHeight: gaugeHeight }]} pointerEvents="box-none">
        <Animated.View
          style={[styles.fill, gaugesStyle]}
          pointerEvents={gaugesEnabled ? 'box-none' : 'none'}
        >
          <IndicatorStrip items={items} onSelect={onSelect} onAll={onAll} />
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.center, markStyle]}
          pointerEvents="none"
          accessible={markSpoken}
          accessibilityRole="header"
          accessibilityLabel="zuhd.news"
          accessibilityElementsHidden={!markSpoken}
          importantForAccessibility={markSpoken ? 'yes' : 'no-hide-descendants'}
        >
          <ZuhdMark color={colors.textEmphasis} />
        </Animated.View>
      </View>

      <IconButton onPress={onMenuPress} accessibilityLabel="Menu">
        <Icon name="menu" size="md" />
      </IconButton>
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
    gap: SPACING.smPlus,
  },
  middle: { flex: 1, minWidth: 0, justifyContent: 'center' },
  fill: { flex: 1, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  // Hairline edge so the control stays defined over whatever the globe puts
  // behind it — land, coastline, city-glow — where the low-lift `pillBg` fill
  // alone can disappear. Definition over elevation: no shadow.
  listen: {
    width: LISTEN_SIZE,
    height: LISTEN_SIZE,
    borderRadius: LISTEN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
});
