import type { GenocideSituation } from '@shared/genocide';
import type { Chokepoint, ConflictEvent, GdacsAlert, MarketExchange } from '@shared/types';
import { Canvas, Circle, Path } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ANIMATION, SPACING } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import { SUB_EVENT_LABEL } from '../lib/conflict';
import { type MarketDirection, marketDirection } from '../lib/markets';
import { displayCountryName } from '../lib/place-names';
import { severityTint } from '../lib/severity';
import { staggerEnter } from '../lib/stagger';
import {
  CHOKEPOINT_PATH,
  CONFLICT_FAMILY_LABEL,
  EVENT_TYPE_LABEL,
  GENOCIDE_CORE_R,
  GENOCIDE_RING_PATH,
  GLYPH_HALF,
  getConflictGlyphPath,
  getGlyphPath,
  getMarketGlyphPath,
  MARKET_DIRECTION_LABEL,
} from './globe/disaster-glyphs';
import type { TapResult } from './globe/MiniGlobe';
import { Pressable, Text } from './primitives';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

interface DisambiguationSheetProps extends BaseSheetProps {
  /** The overlapping candidates surfaced by MiniGlobe.hitTest. Length ≥ 2
   *  whenever the sheet is opened — single hits resolve directly, never
   *  through this chooser. */
  candidates: TapResult[];
  /** Resolution context: same data the parent already holds for opening
   *  individual sheets. Used here to derive readable labels per row. */
  chokepoints: Chokepoint[];
  alerts: GdacsAlert[];
  conflictEvents: ConflictEvent[];
  exchanges: MarketExchange[];
  genocideSituations: GenocideSituation[];
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
  kind: 'gdacs' | 'chokepoint' | 'conflict' | 'article' | 'hotspot' | 'market' | 'genocide';
  /** GDACS-only — drives the glyph + tint inside the icon canvas. */
  eventtype?: GdacsAlert['eventtype'];
  alertlevel?: GdacsAlert['alertlevel'];
  /** Conflict-only — drives the glyph + tint inside the icon canvas. */
  conflictFamily?: ConflictEvent['family'];
  /** Conflict-only — non-zero fatalities tilt the row tint to unfavorable. */
  fatalities?: number;
  /** Market-only — direction is the glyph, never a hue. */
  marketDir?: MarketDirection;
}

function buildRow(
  result: TapResult,
  index: number,
  chokepointsById: Map<string, Chokepoint>,
  alertsById: Map<string, GdacsAlert>,
  conflictById: Map<string, ConflictEvent>,
  exchangesById: Map<string, MarketExchange>,
  genocideById: Map<string, GenocideSituation>,
): DisplayRow | null {
  // Genocide first, so a determination is never buried under the events that
  // overlap it — over Gaza this row shares a coordinate with conflict marks on
  // most days, and the chooser's order is the only hierarchy it has.
  if (result.genocideId) {
    const g = genocideById.get(result.genocideId);
    if (!g) return null;
    return {
      key: `genocide-${g.id}`,
      result,
      primary: `Genocide · ${g.name}`,
      secondary: 'as determined by the United Nations',
      kind: 'genocide',
    };
  }
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
  if (result.conflictEventId) {
    const evt = conflictById.get(result.conflictEventId);
    if (!evt) return null;
    const country = displayCountryName(evt.country) ?? evt.country;
    const primary =
      evt.fatalities > 0
        ? `${evt.fatalities.toLocaleString('en-US')} killed · ${SUB_EVENT_LABEL[evt.subEvent]}`
        : SUB_EVENT_LABEL[evt.subEvent];
    return {
      key: `conflict-${evt.id}`,
      result,
      primary,
      secondary: `${CONFLICT_FAMILY_LABEL[evt.family].toLowerCase()}${country ? ` · ${country}` : ''}`,
      kind: 'conflict',
      conflictFamily: evt.family,
      fatalities: evt.fatalities,
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
  if (result.marketExchangeId) {
    const e = exchangesById.get(result.marketExchangeId);
    if (!e) return null;
    const dir = marketDirection(e.changePct);
    return {
      key: `market-${e.id}`,
      result,
      primary: `${e.indexName} · ${e.city}`,
      // The direction in words, because the chooser is a list of text rows and
      // the row's own glyph is 28px of it. The percentage stays on the sheet.
      secondary: `${MARKET_DIRECTION_LABEL[dir].toLowerCase()} · stock exchange`,
      kind: 'market',
      marketDir: dir,
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
  if (row.kind === 'genocide') {
    // The only coloured row icon in the chooser, and the same annulus the
    // globe draws — a reader who taps a red ring and gets a list must be able
    // to find the ring again in it. `determination`, never `severityTint`:
    // this row is not on the severity ladder the other rows share.
    return (
      <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
        <Circle
          cx={ROW_ICON / 2}
          cy={ROW_ICON / 2}
          r={ROW_ICON / 2}
          color={colors.determination}
          opacity={0.16}
        />
        <Circle cx={ROW_ICON / 2} cy={ROW_ICON / 2} r={GENOCIDE_CORE_R} color={colors.sheetBg} />
        <Path
          path={GENOCIDE_RING_PATH}
          color={colors.determination}
          style="stroke"
          strokeWidth={2}
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
  if (row.kind === 'market' && row.marketDir) {
    return (
      <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
        <Circle
          cx={ROW_ICON / 2}
          cy={ROW_ICON / 2}
          r={ROW_ICON / 2}
          color={colors.textSecondary}
          opacity={0.12}
        />
        <Path
          path={getMarketGlyphPath(row.marketDir)}
          color={colors.textSecondary}
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
  if (row.kind === 'conflict' && row.conflictFamily) {
    return (
      <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
        <Circle cx={ROW_ICON / 2} cy={ROW_ICON / 2} r={ROW_ICON / 2} color={tint} opacity={0.18} />
        <Path
          path={getConflictGlyphPath(row.conflictFamily)}
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
          r={ROW_ICON / 2}
          color={colors.textSecondary}
          opacity={0.12}
        />
        <Path
          path={CHOKEPOINT_PATH}
          color={colors.textSecondary}
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
  if (row.kind === 'hotspot') {
    // Pulse pattern — three concentric layers read as "density radiating
    // from this point," the visual analogue of "multiple stories here."
    // Distinguishes structurally (not just by halo size) from the
    // article row, which is a single framed dot.
    return (
      <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
        <Circle
          cx={ROW_ICON / 2}
          cy={ROW_ICON / 2}
          r={ROW_ICON / 2}
          color={colors.accent}
          opacity={0.12}
        />
        <Circle
          cx={ROW_ICON / 2}
          cy={ROW_ICON / 2}
          r={8}
          color={colors.accent}
          opacity={0.5}
          style="stroke"
          strokeWidth={1}
        />
        <Circle cx={ROW_ICON / 2} cy={ROW_ICON / 2} r={2.5} color={colors.accent} />
      </Canvas>
    );
  }
  // Article row — single story at a place. Framed dot: a thin outer ring
  // contains the marker so it reads as "a focused, single point" rather
  // than a stray pixel. Quieter than hotspot (no halo, no accent ring) so
  // the cohort hierarchy stays: GDACS > chokepoint > hotspot > article.
  return (
    <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
      <Circle
        cx={ROW_ICON / 2}
        cy={ROW_ICON / 2}
        r={6}
        color={colors.textSecondary}
        opacity={0.4}
        style="stroke"
        strokeWidth={1}
      />
      <Circle cx={ROW_ICON / 2} cy={ROW_ICON / 2} r={2.5} color={colors.accent} />
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
  // Red disasters and fatal-conflict rows take the foreground rose tint
  // (the most editorially urgent signal). Lower-tier disasters read in
  // `textSecondary` — severity is still legible from the focal numbers
  // and labels in the row body.
  //
  // The genocide row is not on this ladder at all and does not pass through
  // here: `RowIcon` reaches for `colors.determination` directly, and the row's
  // TEXT stays monochrome like every other row's. The mark carries the hue;
  // a red headline in a list of neutral ones would read as an alert about the
  // interface, which is the same mistake the web map's filter row corrected.
  const tint = severityTint(
    colors,
    {
      alertLevel: row.alertlevel,
      fatalities: row.kind === 'conflict' ? row.fatalities : undefined,
    },
    colors.textSecondary,
  );
  const handlePress = useCallback(() => onPress(row.result), [onPress, row.result]);
  return (
    <Animated.View entering={staggerEnter(index, ANIMATION.fast)}>
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
  conflictEvents,
  exchanges,
  genocideSituations,
  bottomInset,
  renderBackdrop,
  onDismiss,
  onSelect,
}: DisambiguationSheetProps) {
  const snapProps = useSheetSnaps(false);

  const rows = useMemo<DisplayRow[]>(() => {
    const cpById = new Map(chokepoints.map((c) => [c.id, c]));
    const alertById = new Map(alerts.map((a) => [a.eventid, a]));
    const conflictById = new Map(conflictEvents.map((e) => [e.id, e]));
    const exchangeById = new Map(exchanges.map((e) => [e.id, e]));
    const genocideById = new Map(genocideSituations.map((g) => [g.id, g]));
    const out: DisplayRow[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const row = buildRow(
        candidates[i] as TapResult,
        i,
        cpById,
        alertById,
        conflictById,
        exchangeById,
        genocideById,
      );
      if (row) out.push(row);
    }
    // A determination outranks everything it overlaps. `hitTest` appends it
    // last so it lands nearest the thumb; here it is pulled to the top, where
    // reading order puts it first. Both are deliberate, and they are not in
    // conflict — one is about the hand, the other about the eye.
    out.sort((a, b) => Number(b.kind === 'genocide') - Number(a.kind === 'genocide'));
    return out;
  }, [candidates, chokepoints, alerts, conflictEvents, exchanges, genocideSituations]);

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
      <SheetScrollView bottomInset={bottomInset}>
        {rows.map((row, i) => (
          <CandidateRow key={row.key} row={row} index={i} onPress={handleSelect} />
        ))}
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.smPlus,
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
