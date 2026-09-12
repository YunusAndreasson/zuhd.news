import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Icon, IconButton, Pressable, Text } from '../primitives';

/**
 * The one line of chrome above the earth.
 *
 * It replaces `SectionBar`, whose four labels were the app's navigation until
 * the sections went away. What is left is the two things a single-screen app
 * still owes the reader: which app this is, and the way out to everything that
 * is not today — search, saved, settings, the pages.
 *
 * The wordmark is not decoration here. With the rail gone there is no other
 * text at the top of the screen, and an app that opens on a rotating planet
 * with three numbers over it should say its own name once.
 *
 * `zoom` is a word rather than a glyph because pinch already exists on the
 * globe below and this is the path for readers who cannot pinch. A control
 * that duplicates a gesture has to be legible on its own terms; a magnifier
 * icon beside a hamburger would read as a second search.
 */
export const MapHeader = memo(function MapHeader({
  onMenuPress,
  onZoomPress,
  zoomLabel,
}: {
  onMenuPress: () => void;
  onZoomPress: () => void;
  zoomLabel: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.row, { paddingTop: insets.top + SPACING.xs }]} pointerEvents="box-none">
      <Text variant="wordmark" tone="emphasis" accessibilityRole="header">
        zuhd.news
      </Text>

      <View style={styles.spacer} />

      <Pressable
        onPress={onZoomPress}
        haptic="none"
        hitSlop={SPACING.md}
        style={[styles.pill, { backgroundColor: colors.pillBg, borderColor: colors.rule }]}
        accessibilityRole="button"
        accessibilityLabel="Globe zoom"
        accessibilityHint="Cycles through zoom levels"
      >
        <Text variant="labelXs">{zoomLabel}</Text>
      </Pressable>

      <IconButton onPress={onMenuPress} accessibilityLabel="Menu" style={styles.menu}>
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
  spacer: { flex: 1 },
  // Hairline edge so the control stays defined over whatever the globe puts
  // behind it — land, coastline, city-glow — where the low-lift `pillBg` fill
  // alone can disappear. Definition over elevation: no shadow.
  pill: {
    paddingVertical: SPACING.xxs,
    paddingHorizontal: SPACING.smPlus,
    borderRadius: RADIUS.floating,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Pull the glyph up ~1px so its optical centre lines up with the wordmark's
  // x-height rather than the row's geometric midline.
  menu: { transform: [{ translateY: -1 }] },
});
