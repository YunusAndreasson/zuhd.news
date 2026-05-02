import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { Chokepoint } from '@shared/types';
import { Canvas, Circle, Path } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import type { GdacsAlert } from '../lib/gdacs';
import { displayCountryName } from '../lib/place-names';
import { EVENT_TYPE_LABEL, GLYPH_HALF, getGlyphPath } from './globe/disaster-glyphs';
import type { TapResult } from './globe/MiniGlobe';
import { Pressable, Text } from './primitives';
import { SheetLayout } from './SheetLayout';

interface DisambiguationSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  /** The overlapping candidates surfaced by MiniGlobe.hitTest. Length ≥ 2
   *  whenever the sheet is opened — single hits resolve directly, never
   *  through this chooser. */
  candidates: TapResult[];
  /** Resolution context: same data the parent already holds for opening
   *  individual sheets. Used here to derive readable labels per row. */
  chokepoints: Chokepoint[];
  alerts: GdacsAlert[];
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
  /** Fires when a row is tapped. Parent should dismiss this sheet and
   *  re-dispatch the candidate through its existing tap handler. */
  onSelect: (result: TapResult) => void;
}

// Row icon footprint — small enough to keep rows tight (~52px tall),
// large enough that the GDACS glyph stays legible at a glance.
const ROW_ICON = 28;

interface DisplayRow {
  key: string;
  result: TapResult;
  primary: string;
  secondary: string;
  kind: 'gdacs' | 'chokepoint' | 'article' | 'hotspot';
  /** GDACS-only — drives the glyph + tint inside the icon canvas. */
  eventtype?: GdacsAlert['eventtype'];
  alertlevel?: GdacsAlert['alertlevel'];
}

function buildRow(
  result: TapResult,
  index: number,
  chokepointsById: Map<string, Chokepoint>,
  alertsById: Map<string, GdacsAlert>,
): DisplayRow | null {
  if (result.gdacsEventId) {
    const alert = alertsById.get(result.gdacsEventId);
    if (!alert) return null;
    const country = displayCountryName(alert.country) ?? alert.country;
    return {
      key: `gdacs-${alert.eventid}`,
      result,
      primary: alert.name.length > 0 ? alert.name : EVENT_TYPE_LABEL[alert.eventtype],
      secondary: `${EVENT_TYPE_LABEL[alert.eventtype].toLowerCase()}${country ? ` · ${country}` : ''}`,
      kind: 'gdacs',
      eventtype: alert.eventtype,
      alertlevel: alert.alertlevel,
    };
  }
  if (result.chokepointId) {
    const cp = chokepointsById.get(result.chokepointId);
    if (!cp) return null;
    return {
      key: `chokepoint-${cp.id}`,
      result,
      primary: cp.name,
      secondary: 'maritime chokepoint',
      kind: 'chokepoint',
    };
  }
  if (result.isHotspot) {
    const country = displayCountryName(result.countryName) ?? result.countryName;
    const stories = result.hotspotLabels ?? [];
    return {
      key: `hotspot-${result.countryName}-${index}`,
      result,
      primary: stories[0] ?? country ?? 'Hotspot',
      secondary: country ? `hotspot · ${country}` : 'hotspot',
      kind: 'hotspot',
    };
  }
  if (result.countryName) {
    const country = displayCountryName(result.countryName) ?? result.countryName;
    return {
      key: `article-${result.countryName}-${index}`,
      result,
      primary: result.location ?? country,
      secondary: result.location ? country : 'current article',
      kind: 'article',
    };
  }
  return null;
}

interface RowIconProps {
  row: DisplayRow;
  tint: string;
}

function RowIcon({ row, tint }: RowIconProps) {
  const { colors } = useTheme();
  if (row.kind === 'gdacs' && row.eventtype) {
    return (
      <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
        <Circle cx={ROW_ICON / 2} cy={ROW_ICON / 2} r={ROW_ICON / 2} color={tint} opacity={0.18} />
        <Path
          path={getGlyphPath(row.eventtype)}
          color={tint}
          style="stroke"
          strokeWidth={1.6}
          strokeJoin="round"
          strokeCap="round"
          transform={[
            { translateX: ROW_ICON / 2 - GLYPH_HALF },
            { translateY: ROW_ICON / 2 - GLYPH_HALF },
          ]}
        />
      </Canvas>
    );
  }
  if (row.kind === 'chokepoint') {
    return (
      <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
        <Circle
          cx={ROW_ICON / 2}
          cy={ROW_ICON / 2}
          r={9}
          color={colors.textSecondary}
          style="stroke"
          strokeWidth={1.4}
          opacity={0.7}
        />
      </Canvas>
    );
  }
  if (row.kind === 'hotspot') {
    return (
      <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
        <Circle cx={ROW_ICON / 2} cy={ROW_ICON / 2} r={10} color={colors.accent} opacity={0.18} />
        <Circle cx={ROW_ICON / 2} cy={ROW_ICON / 2} r={4} color={colors.accent} />
      </Canvas>
    );
  }
  return (
    <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
      <Circle cx={ROW_ICON / 2} cy={ROW_ICON / 2} r={4} color={colors.accent} />
    </Canvas>
  );
}

function CandidateRow({
  row,
  index,
  onPress,
}: {
  row: DisplayRow;
  index: number;
  onPress: (result: TapResult) => void;
}) {
  const { colors } = useTheme();
  const tint =
    row.alertlevel === 'Red'
      ? colors.toneUnfavorable
      : row.alertlevel === 'Orange'
        ? colors.alertOrange
        : row.alertlevel === 'Green'
          ? colors.alertGreen
          : colors.textSecondary;
  const handlePress = useCallback(() => onPress(row.result), [onPress, row.result]);
  return (
    <Animated.View entering={FadeInDown.duration(ANIMATION.fast).delay(staggerDelay(index))}>
      <Pressable
        haptic="tick"
        onPress={handlePress}
        style={[styles.row, { borderBottomColor: colors.rule }]}
        accessibilityRole="button"
        accessibilityLabel={`${row.primary}, ${row.secondary}`}
      >
        <RowIcon row={row} tint={tint} />
        <View style={styles.rowText}>
          <Text variant="bodyEmphasis" numberOfLines={1}>
            {row.primary}
          </Text>
          <Text variant="labelSm" tone="secondary" numberOfLines={1} style={styles.rowSecondary}>
            {row.secondary}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const DisambiguationSheet = memo(function DisambiguationSheet({
  sheetRef,
  candidates,
  chokepoints,
  alerts,
  bottomInset,
  renderBackdrop,
  onDismiss,
  onSelect,
}: DisambiguationSheetProps) {
  const { sheetStyles } = useTheme();
  const snapProps = useSheetSnaps(false);

  const rows = useMemo<DisplayRow[]>(() => {
    const cpById = new Map(chokepoints.map((c) => [c.id, c]));
    const alertById = new Map(alerts.map((a) => [a.eventid, a]));
    const out: DisplayRow[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const row = buildRow(candidates[i] as TapResult, i, cpById, alertById);
      if (row) out.push(row);
    }
    return out;
  }, [candidates, chokepoints, alerts]);

  const handleSelect = useCallback(
    (result: TapResult) => {
      onSelect(result);
    },
    [onSelect],
  );

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      renderBackdrop={renderBackdrop}
      onDismiss={onDismiss}
      handleTitle="multiple items here"
    >
      <BottomSheetView style={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}>
        {rows.map((row, i) => (
          <CandidateRow key={row.key} row={row} index={i} onPress={handleSelect} />
        ))}
      </BottomSheetView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: SPACING.xxs,
  },
  rowSecondary: {
    marginTop: SPACING.xxs,
  },
});
