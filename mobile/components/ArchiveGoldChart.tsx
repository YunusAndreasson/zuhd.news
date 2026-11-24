import { Image, StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Icon, Text } from './primitives';

export const ARCHIVE_QUOTE =
  'Gold, 3,515 US dollars per troy ounce on 20 November 2026. Down 9.5 percent over seven days.';

/** Only the line comes from the reviewed production capture. Units, both
 * dates, change and axis labels stay native text in either appearance. */
export function ArchiveGoldChart({ detail = false }: { detail?: boolean }) {
  const { colors, resolvedAppearance } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={ARCHIVE_QUOTE}
      style={[styles.frame, { borderColor: colors.rule }]}
    >
      <View style={styles.labels}>
        <Text variant="labelXs">Gold</Text>
        <Text variant="labelXs">{detail ? '20 Nov 2026' : '20 Nov'}</Text>
      </View>
      <View style={styles.reading}>
        <Text variant="tabularEmphasis" scale={19 / 11} maxFontSizeMultiplier={0}>
          $3,515
        </Text>
        <Text variant="caption" maxFontSizeMultiplier={0}>
          per troy ounce
        </Text>
        <View style={styles.week}>
          <Icon name="caret-down" size="xs" tone="fall" />
          <Text variant="caption" tone="fall">
            9.5%
          </Text>
          <Text variant="caption" maxFontSizeMultiplier={0}>
            over 7 days
          </Text>
        </View>
      </View>
      <Image
        accessible={false}
        style={[styles.line, detail && styles.detailLine]}
        resizeMode="stretch"
        source={
          resolvedAppearance === 'light'
            ? require('../assets/opening/gold-line-light.png')
            : require('../assets/opening/gold-line.png')
        }
      />
      <View style={styles.axis}>
        {(['Sep', 'Oct', 'Nov'] as const).map((month) => (
          <View key={month} style={styles.tick}>
            <Text variant="labelXs" style={styles.month}>
              {month}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  frame: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  reading: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: SPACING.xs },
  week: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  line: { width: '100%', height: SPACING.xxl },
  detailLine: { height: SPACING.xxl * 3 },
  axis: { flexDirection: 'row' },
  tick: { flex: 1 },
  month: { marginLeft: '20%' },
});
