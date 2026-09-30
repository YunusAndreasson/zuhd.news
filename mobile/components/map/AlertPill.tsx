import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PRESSED_STYLE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { announce } from '../../lib/announce';
import { CONTROL_ROW } from '../../lib/deck-layout';
import { Text } from '../primitives';

/** The pill's height, inside its `CONTROL_ROW` touch target: sized to its
 *  11pt words, as `‹ 3 new` is. */
const PILL = 28;

/** The room the pill takes under the top chrome, touch target and all. A top
 *  toast and the globe's market marks start below it while it is up. */
export const ALERT_ROW = CONTROL_ROW;

/**
 * A live Red hazard alert — a cyclone, an earthquake — as one line under the
 * gauges, over the globe: `now · Tropical Cyclone DOLPHIN-26`, which opens the
 * alert.
 *
 * **It sat at the foot of the screen until 2026-09-30, and moved at the
 * user's request.** First it took the dock's row in place of the story track,
 * so a cyclone live for days took the day's scrubber with it; then it floated
 * over the track's right end, where it lay on the resting story's text, shared
 * a row with `‹ 3 new`, and had to hide whenever a story was open. Up here it
 * covers no text, sits over the map the alert is about, and stays through an
 * open story: the open sheet always leaves `BAND_MIN` of globe under the bar.
 *
 * Ink, not red: the pill is the sheet's control material, like `‹ 3 new`, and
 * the hazard's colour is its mark on the globe. The alert is also a row in the
 * menu's `world hazards`, which is its path for a screen reader that never
 * reaches this line; the line itself is announced as it appears.
 */
export const AlertPill = memo(function AlertPill({
  title,
  top,
  onPress,
}: {
  /** The newest live Red alert's title. */
  title: string;
  /** Where the top chrome (and the briefing player, when up) ends. */
  top: number;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const line = `now · ${title}`;
  // A live region, which only Android speaks.
  useEffect(() => {
    announce(line, { liveRegion: true });
  }, [line]);
  return (
    <View style={[styles.row, { top }]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : 'text'}
        accessibilityLabel={line}
        accessibilityHint={onPress ? 'Opens the alert' : undefined}
        style={({ pressed }) => [styles.action, pressed && onPress ? PRESSED_STYLE : null]}
      >
        {/* Solid, with a hairline edge: it rests on the globe, which is busy
            with marks and labels under it. */}
        <View style={[styles.pill, { backgroundColor: colors.playerBg, borderColor: colors.rule }]}>
          <Text variant="labelXs" tone="emphasis" numberOfLines={1} style={styles.text}>
            {line}
          </Text>
        </View>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ALERT_ROW,
    alignItems: 'center',
    paddingHorizontal: SPACING.articlePadding,
    zIndex: 9,
  },
  action: {
    height: ALERT_ROW,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  pill: {
    height: PILL,
    borderRadius: PILL / 2,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.smPlus,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  text: { flexShrink: 1 },
});
