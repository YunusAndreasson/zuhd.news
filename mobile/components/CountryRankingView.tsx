import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { type FlatList, StyleSheet, Text, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { getRanking, METRICS, type MetricKey, type RankingEntry } from '../lib/country-ranking';
import { useOpenLink } from '../lib/open-link';
import { displayCountryName } from '../lib/place-names';
import { HapticPressable } from './HapticPressable';

interface Props {
  metric: MetricKey;
  currentCountryName: string | null;
  bottomInset: number;
  /** Close the enclosing bottom sheet. Called before the in-app browser
   *  opens — otherwise the browser presents behind the sheet overlay. */
  onRequestClose?: () => void;
}

export const CountryRankingView = memo(function CountryRankingView({
  metric,
  currentCountryName,
  bottomInset,
  onRequestClose,
}: Props) {
  const { colors, font, typography, textStyles } = useTheme();
  const ranking = useMemo(() => getRanking(metric), [metric]);
  const currentIndex = useMemo(
    () => (currentCountryName ? ranking.findIndex((r) => r.name === currentCountryName) : -1),
    [ranking, currentCountryName],
  );
  const listRef = useRef<FlatList<RankingEntry>>(null);

  // gorhom's BottomSheetFlatList silently ignores scrollToOffset while the
  // sheet is still animating to its top snap. Multiple attempts across the
  // animation window ensure at least one lands after the internal unlock.
  // Animated: once the first attempt lands, subsequent calls target the same
  // offset and are effectively no-ops (zero-distance animation).
  useEffect(() => {
    if (currentIndex < 0) return;
    const offset = Math.max(0, ROW_HEIGHT * currentIndex - ROW_HEIGHT * 2);
    const scroll = () => listRef.current?.scrollToOffset({ offset, animated: true });
    const timers = [100, 350, 600, 900].map((d) => setTimeout(scroll, d));
    return () => timers.forEach(clearTimeout);
  }, [currentIndex]);

  const renderItem = useCallback(
    ({ item, index }: { item: RankingEntry; index: number }) => {
      const isCurrent = item.name === currentCountryName;
      return (
        <View
          style={[
            styles.row,
            { borderBottomColor: colors.rule },
            isCurrent && { backgroundColor: colors.pillBg },
          ]}
        >
          <Text style={[styles.rank, textStyles.smallCapsXs]} maxFontSizeMultiplier={1.3}>
            {index + 1}
          </Text>
          <Text style={styles.flag}>{item.flag}</Text>
          <Text
            style={[
              styles.name,
              {
                ...font.regular,
                fontSize: typography.sizeSm,
                color: isCurrent ? colors.textEmphasis : colors.text,
              },
            ]}
            numberOfLines={1}
          >
            {displayCountryName(item.name)}
          </Text>
          <Text
            style={{
              ...font.regular,
              fontSize: typography.sizeSm,
              color: colors.text,
              fontVariant: ['oldstyle-nums'],
            }}
          >
            {item.value}
          </Text>
        </View>
      );
    },
    [colors, font, typography, textStyles, currentCountryName],
  );

  const totalLabel = `#${currentIndex + 1} of ${ranking.length}`;
  const meta = METRICS[metric];
  const openLink = useOpenLink();
  const openSource = useCallback(() => {
    if (!meta.sourceUrl) return;
    // Dismiss the sheet first — the in-app browser otherwise presents
    // behind gorhom's portal overlay on both iOS and Android.
    onRequestClose?.();
    openLink(meta.sourceUrl);
  }, [meta.sourceUrl, openLink, onRequestClose]);

  return (
    <BottomSheetFlatList
      ref={listRef as never}
      data={ranking}
      keyExtractor={(item) => item.name}
      renderItem={renderItem}
      getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
      contentContainerStyle={{ paddingBottom: bottomInset + SPACING.lg }}
      ListHeaderComponent={
        <View>
          <View style={styles.header}>
            <Text style={textStyles.smallCapsXs}>{meta.label}</Text>
            {currentIndex >= 0 && (
              <Text
                style={{
                  ...font.semiBold,
                  fontSize: typography.sizeXs,
                  color: colors.textEmphasis,
                  letterSpacing: typography.trackingCaps,
                  fontVariant: ['oldstyle-nums'],
                }}
              >
                {totalLabel}
              </Text>
            )}
          </View>
          {(meta.description || meta.source) && (
            <View style={[styles.meta, { borderBottomColor: colors.rule }]}>
              {meta.description && (
                <Text
                  style={{
                    ...font.regular,
                    fontSize: typography.sizeXs,
                    lineHeight: typography.sizeXs * typography.leadingBody,
                    color: colors.textSecondary,
                  }}
                >
                  {meta.description}
                </Text>
              )}
              {meta.source &&
                (meta.sourceUrl ? (
                  <HapticPressable
                    onPress={openSource}
                    haptic="tick"
                    accessibilityRole="link"
                    accessibilityLabel={`Source: ${meta.source}`}
                  >
                    <Text
                      style={[
                        textStyles.smallCapsXs,
                        { color: colors.dome, marginTop: SPACING.xxs },
                      ]}
                    >
                      {meta.source} ↗
                    </Text>
                  </HapticPressable>
                ) : (
                  <Text style={[textStyles.smallCapsXs, { marginTop: SPACING.xxs }]}>
                    {meta.source}
                  </Text>
                ))}
            </View>
          )}
        </View>
      }
    />
  );
});

const ROW_HEIGHT = 40;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  meta: {
    paddingHorizontal: SPACING.screenPadding,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.screenPadding,
    height: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: {
    width: 28,
    fontVariant: ['oldstyle-nums'],
  },
  flag: {
    fontSize: 18,
  },
  name: {
    flex: 1,
  },
});
