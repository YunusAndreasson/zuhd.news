import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { formatAudioDurationMinutes } from '../../lib/audio-duration';
import { Icon, IconButton, Pressable, Text } from '../primitives';

/**
 * The one line of chrome above the earth: the briefing, the name, the menu.
 *
 * **The briefing is top left**, where a reader's eye starts. It was a corner
 * pill over the globe (not found), then the button on the sheet's masthead
 * (found, but it made the first row of the news list a control panel). Here
 * it is the first thing on the screen and the sheet below is left to news.
 * Absent rather than disabled when there is no briefing, and while the player
 * is up — a dead control the reader has to press to discover is dead is the
 * failure the old pill's "No briefing available" toast already made once.
 *
 * **The wordmark is centred.** With the rail gone there is no other text at
 * the top of the screen, and an app that opens on a rotating planet should
 * say its own name once. Equal side zones keep it on the screen's midline
 * whether or not the briefing button is there.
 *
 * **No zoom control.** Pinch on the globe steps through the same levels.
 */
export const MapHeader = memo(function MapHeader({
  onMenuPress,
  briefingAvailable,
  briefingResumable,
  briefingDuration,
  onBriefingPress,
}: {
  onMenuPress: () => void;
  briefingAvailable: boolean;
  briefingResumable: boolean;
  briefingDuration?: number;
  onBriefingPress: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // The verb alone. "resume · 10 min" ran into the centred wordmark on a 411pt
  // phone; the length is still spoken, and the player bar shows it once the
  // briefing is playing.
  const action = briefingResumable ? 'resume' : 'listen';
  const minutes = formatAudioDurationMinutes(briefingDuration);

  return (
    <View style={[styles.row, { paddingTop: insets.top + SPACING.xs }]} pointerEvents="box-none">
      <View style={styles.side} pointerEvents="box-none">
        {briefingAvailable ? (
          <Pressable
            onPress={onBriefingPress}
            haptic="none"
            hitSlop={SPACING.md}
            style={[styles.listen, { backgroundColor: colors.pillBg, borderColor: colors.rule }]}
            accessibilityRole="button"
            accessibilityLabel={`${briefingResumable ? 'Resume daily briefing' : 'Daily briefing'}${minutes ? `, ${minutes}` : ''}`}
            accessibilityHint={
              briefingResumable ? "Resumes today's audio briefing" : "Plays today's audio briefing"
            }
          >
            <Icon name="play" size="sm" tone="default" />
            <Text variant="labelXs" tone="default" numberOfLines={1}>
              {action}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text variant="wordmark" tone="emphasis" accessibilityRole="header">
        zuhd.news
      </Text>

      <View style={[styles.side, styles.sideEnd]} pointerEvents="box-none">
        <IconButton onPress={onMenuPress} accessibilityLabel="Menu" style={styles.menu}>
          <Icon name="menu" size="md" />
        </IconButton>
      </View>
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
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  sideEnd: { justifyContent: 'flex-end' },
  // Hairline edge so the control stays defined over whatever the globe puts
  // behind it — land, coastline, city-glow — where the low-lift `pillBg` fill
  // alone can disappear. Definition over elevation: no shadow. The play
  // triangle is what makes a word pill read as pressable rather than a label.
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.smPlus,
    borderRadius: RADIUS.floating,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Pull the glyph up ~1px so its optical centre lines up with the wordmark's
  // x-height rather than the row's geometric midline.
  menu: { transform: [{ translateY: -1 }] },
});
