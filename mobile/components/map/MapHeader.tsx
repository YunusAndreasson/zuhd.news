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
 * The one bar above the earth: the zuhd mark · every gauge that moved · listen.
 *
 * **The mark is home.** Pressed, it puts the day back where the app opens: the
 * newest story on the card at rest, the globe's zoom released and the camera
 * flown to that story, and the gauges scrolled back to their start. A reader
 * twenty swipes in, pinched into a coastline, has one place to press to start
 * over — the same place a website's logo has always been.
 *
 * **The gauges scroll from beside it** to the listen button, or to the screen's
 * edge without one; the cut slot says the row continues.
 *
 * **Listen is fixed at the right**, a round filled button. It sat on the
 * sheet's masthead for one build, beside the story track, where a play button
 * next to a progress bar read as that bar's play head — and the briefing's own
 * player bar has a progress bar of its own. Absent rather than disabled when
 * there is no briefing, and while the player is up.
 *
 * **The menu is not here.** Settings and pages are opened from the header of
 * the story list (`IndexSheet`), the sheet a reader already opens for "the
 * rest of the app".
 */

/** The zuhd mark — `public/logo.svg`, the same three shapes on a 32-unit box. */
const MARK_PATH = Skia.Path.MakeFromSVGString(
  'M4.5 4.5H12L4.5 16.25Z M19.5 4.5H27.5L12 27.5H4.5Z M27.5 16.25V27.5H20Z',
);
const MARK_SIZE = 20;
/** The listen button's diameter: a 14pt glyph with room around it. */
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
  onHomePress,
  homeKey,
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
  /** The mark: back to the newest story, zoom released. */
  onHomePress: () => void;
  /** Changes on every home press, so the gauges scroll back to their start. */
  homeKey: number;
  briefingAvailable: boolean;
  briefingResumable: boolean;
  briefingDuration?: number;
  onBriefingPress: () => void;
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

  return (
    <View
      style={[
        styles.row,
        { paddingTop: insets.top + SPACING.xs },
        // Without a listen button the scroller reaches the right edge and pads
        // its own content.
        hasGauges && !briefingAvailable ? styles.rightToEdge : null,
      ]}
      pointerEvents="box-none"
    >
      <IconButton
        onPress={onHomePress}
        style={styles.home}
        accessibilityRole="header"
        accessibilityLabel="zuhd.news"
        accessibilityHint="Back to the newest story, with the globe's zoom reset"
      >
        <ZuhdMark color={colors.textEmphasis} />
      </IconButton>
      <Animated.View
        style={[styles.middle, { minHeight: gaugeHeight }, gaugesStyle]}
        pointerEvents={gaugesEnabled ? 'box-none' : 'none'}
      >
        <IndicatorStrip items={items} onSelect={onSelect} onAll={onAll} resetKey={homeKey} />
      </Animated.View>
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
  home: { paddingVertical: SPACING.xs },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
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
});
