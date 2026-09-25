import type { Chokepoint, ConflictEvent, GdacsAlert } from '@shared/types';
import { Canvas, Circle, Path, RadialGradient, vec } from '@shopify/react-native-skia';
import { type ComponentProps, memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ANIMATION, SPACING, straitMarkColor, withAlpha } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { SwipeCard } from '../lib/cards/rank';
import { gaugeMove } from '../lib/cards/week-move';
import { chooserTitle } from '../lib/chooser-title';
import { conflictChooserDetails, SUB_EVENT_LABEL } from '../lib/conflict';
import {
  type FamineArea,
  famineBlocks,
  type GenocideSituation,
  type ThermalEvent,
} from '../lib/overlays';
import { displayCountryName } from '../lib/place-names';
import { staggerEnter } from '../lib/stagger';
import { type StraitState, straitMapChange, straitStateFor } from '../lib/strait-map';
import {
  CONFLICT_FAMILY_LABEL,
  EVENT_TYPE_LABEL,
  GLYPH_HALF,
  getGlyphPath,
  getStraitPath,
  marketDirectionPath,
} from './globe/disaster-glyphs';
import type { TapResult } from './globe/MiniGlobe';
import {
  FAMINE_FRAME_PATH,
  FAMINE_FRAME_STROKE,
  getFamineBlocksPath,
  THERMAL_CORE_PATH,
  THERMAL_RAY_STROKE,
  THERMAL_RAYS_PATH,
} from './globe/overlay-glyphs';
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
  /** The ranked instruments, so a flagged exchange's row can name its index
   *  and its exchange rather than its id. */
  instruments: SwipeCard[];
  famineAreas: FamineArea[];
  thermalEvents: ThermalEvent[];
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
  kind:
    | 'gdacs'
    | 'chokepoint'
    | 'conflict'
    | 'market'
    | 'article'
    | 'hotspot'
    | 'famine'
    | 'thermal'
    | 'genocide';
  /** Famine-only — how many of the column's blocks are filled. */
  blocks?: number;
  direction?: 'up' | 'down' | 'flat';
  /** GDACS-only — the pictogram, and the Red alarm ring the globe draws. */
  eventtype?: GdacsAlert['eventtype'];
  alertlevel?: GdacsAlert['alertlevel'];
  /** Strait-only — the shape and colour its globe mark is drawn in. */
  straitState?: StraitState;
}

function buildRow(
  result: TapResult,
  index: number,
  chokepointsById: Map<string, Chokepoint>,
  alertsById: Map<string, GdacsAlert>,
  conflictById: Map<string, ConflictEvent>,
  marketsById: Map<string, SwipeCard>,
  overlays: {
    famine: Map<string, FamineArea>;
    thermal: Map<string, ThermalEvent>;
    genocide: Map<string, GenocideSituation>;
  },
): DisplayRow | null {
  if (result.genocideId) {
    const g = overlays.genocide.get(result.genocideId);
    if (!g) return null;
    return {
      key: `genocide-${g.id}`,
      result,
      primary: g.name,
      secondary: 'genocide · as determined by the UN',
      kind: 'genocide',
    };
  }
  if (result.famineAreaId) {
    const a = overlays.famine.get(result.famineAreaId);
    if (!a) return null;
    return {
      key: `famine-${a.id}`,
      result,
      primary: a.area,
      secondary: `${a.phaseName.toLowerCase()} · IPC phase ${a.phase}`,
      kind: 'famine',
      blocks: famineBlocks(a.phase),
    };
  }
  if (result.thermalEventId) {
    const e = overlays.thermal.get(result.thermalEventId);
    if (!e) return null;
    return {
      key: `thermal-${e.id}`,
      result,
      primary: e.near ?? 'Thermal anomaly',
      secondary: `thermal anomaly · ${Math.round(e.frp).toLocaleString('en-US')} MW`,
      kind: 'thermal',
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
    };
  }
  if (result.chokepointId) {
    const cp = chokepointsById.get(result.chokepointId);
    if (!cp) return null;
    return {
      key: `chokepoint-${cp.id}`,
      result,
      primary: cp.name,
      secondary: `all ships · ${straitMapChange(cp.delta7vs90.n_total)?.label ?? 'comparison unavailable'} · ${cp.asOf}`,
      kind: 'chokepoint',
      straitState: straitStateFor(cp.delta7vs90.n_total ?? 0),
    };
  }
  if (result.marketSignalId) {
    const card = marketsById.get(result.marketSignalId);
    if (!card) return null;
    // The week, as the mark under the finger and the strip print it; the
    // card's own session move is the card's to show, with its window.
    const week = gaugeMove(card)?.delta;
    const delta = week ?? card.delta;
    return {
      key: `market-${card.id}`,
      result,
      primary: card.title,
      secondary: [
        card.kicker,
        delta
          ? `${delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '−'} ${delta.magnitude}${week ? ' past week' : ''}`
          : null,
        card.asOf,
      ]
        .filter(Boolean)
        .join(' · '),
      kind: 'market',
      direction: delta?.direction,
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
      secondary: result.location ? country : 'current story',
      kind: 'article',
    };
  }
  return null;
}

interface RowIconProps {
  row: DisplayRow;
}

/** Centres a glyph in a row icon. */
const GLYPH_TRANSFORM = [
  { translateX: ROW_ICON / 2 - GLYPH_HALF },
  { translateY: ROW_ICON / 2 - GLYPH_HALF },
];

/** A glyph stroked over a disc of its own colour — the shape the hazard,
 *  strait and exchange rows share. `ring` is the globe's Red-alert ring. */
function GlyphIcon({
  path,
  color,
  discOpacity,
  ring = false,
}: {
  path: ComponentProps<typeof Path>['path'];
  color: string;
  discOpacity: number;
  ring?: boolean;
}) {
  return (
    <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
      <Circle
        cx={ROW_ICON / 2}
        cy={ROW_ICON / 2}
        r={ROW_ICON / 2}
        color={color}
        opacity={discOpacity}
      />
      {ring ? (
        <Circle
          cx={ROW_ICON / 2}
          cy={ROW_ICON / 2}
          r={ROW_ICON / 2 - 0.75}
          color={color}
          style="stroke"
          strokeWidth={1.5}
        />
      ) : null}
      <Path
        path={path}
        color={color}
        style="stroke"
        strokeWidth={1.6}
        strokeJoin="round"
        strokeCap="round"
        transform={GLYPH_TRANSFORM}
      />
    </Canvas>
  );
}

function RowIcon({ row }: RowIconProps) {
  const { colors } = useTheme();
  // Every layer keeps its globe hue and shape here: the row names the mark
  // the reader just tapped, and a grey glyph would not. The hazard, conflict
  // and strait rows were grey (rose for a Red alert or a death) until
  // 2026-09-25 — a conflict row drew a gun-sight the globe never shows, and
  // every strait the resting shape whatever its state.
  if (row.kind === 'famine') {
    return (
      <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
        <Circle
          cx={ROW_ICON / 2}
          cy={ROW_ICON / 2}
          r={ROW_ICON / 2}
          color={colors.markFamine}
          opacity={0.14}
        />
        <Path
          path={FAMINE_FRAME_PATH}
          color={colors.markFamine}
          style="stroke"
          strokeWidth={FAMINE_FRAME_STROKE}
          transform={GLYPH_TRANSFORM}
        />
        <Path
          path={getFamineBlocksPath(row.blocks ?? 0)}
          color={colors.markFamine}
          transform={GLYPH_TRANSFORM}
        />
      </Canvas>
    );
  }
  if (row.kind === 'thermal') {
    return (
      <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
        <Circle
          cx={ROW_ICON / 2}
          cy={ROW_ICON / 2}
          r={ROW_ICON / 2}
          color={colors.markThermal}
          opacity={0.14}
        />
        <Path path={THERMAL_CORE_PATH} color={colors.markThermal} transform={GLYPH_TRANSFORM} />
        <Path
          path={THERMAL_RAYS_PATH}
          color={colors.markThermal}
          style="stroke"
          strokeWidth={THERMAL_RAY_STROKE}
          strokeCap="round"
          transform={GLYPH_TRANSFORM}
        />
      </Canvas>
    );
  }
  if (row.kind === 'genocide') {
    return (
      <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
        <Circle cx={ROW_ICON / 2} cy={ROW_ICON / 2} r={9} color={colors.markGenocideCore} />
        <Circle
          cx={ROW_ICON / 2}
          cy={ROW_ICON / 2}
          r={9}
          color={colors.markGenocide}
          style="stroke"
          strokeWidth={1.6}
        />
        <Circle cx={ROW_ICON / 2} cy={ROW_ICON / 2} r={3} color={colors.markGenocide} />
      </Canvas>
    );
  }
  if (row.kind === 'gdacs' && row.eventtype) {
    return (
      <GlyphIcon
        path={getGlyphPath(row.eventtype)}
        color={colors.markGdacs}
        discOpacity={0.14}
        ring={row.alertlevel === 'Red'}
      />
    );
  }
  if (row.kind === 'conflict') {
    // The globe's glow, as the map key draws it.
    return (
      <Canvas style={{ width: ROW_ICON, height: ROW_ICON }}>
        <Circle cx={ROW_ICON / 2} cy={ROW_ICON / 2} r={9}>
          <RadialGradient
            c={vec(ROW_ICON / 2, ROW_ICON / 2)}
            r={9}
            colors={[colors.markConflict, withAlpha(colors.markConflict, 0)]}
          />
        </Circle>
      </Canvas>
    );
  }
  if (row.kind === 'chokepoint') {
    const state = row.straitState ?? 'rest';
    return (
      <GlyphIcon
        path={getStraitPath(state)}
        color={straitMarkColor(state, colors)}
        discOpacity={0.12}
      />
    );
  }
  if (row.kind === 'market') {
    return (
      <GlyphIcon
        path={marketDirectionPath(row.direction ?? 'flat')}
        color={
          row.direction === 'up'
            ? colors.markMarketUp
            : row.direction === 'down'
              ? colors.markMarketDown
              : colors.textSecondary
        }
        discOpacity={0.12}
      />
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
  const handlePress = useCallback(() => onPress(row.result), [onPress, row.result]);
  return (
    <Animated.View entering={staggerEnter(index, ANIMATION.fast)}>
      <Pressable
        onPress={handlePress}
        style={[styles.row, { borderBottomColor: colors.rule }]}
        accessibilityRole="button"
        accessibilityLabel={`${row.primary}, ${row.secondary}`}
      >
        <RowIcon row={row} />
        <View style={styles.rowText}>
          <Text variant="bodyEmphasis" numberOfLines={1}>
            {row.primary}
          </Text>
          <Text variant="labelSm" tone="secondary" style={styles.rowSecondary}>
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
  instruments,
  famineAreas,
  thermalEvents,
  genocideSituations,
  bottomInset,
  onDismiss,
  onSelect,
}: DisambiguationSheetProps) {
  const rows = useMemo<DisplayRow[]>(() => {
    const cpById = new Map(chokepoints.map((c) => [c.id, c]));
    const alertById = new Map(alerts.map((a) => [a.eventid, a]));
    const conflictById = new Map(conflictEvents.map((e) => [e.id, e]));
    const marketById = new Map(instruments.map((c) => [c.id, c]));
    const overlays = {
      famine: new Map(famineAreas.map((a) => [a.id, a])),
      thermal: new Map(thermalEvents.map((e) => [e.id, e])),
      genocide: new Map(genocideSituations.map((g) => [g.id, g])),
    };
    const out: DisplayRow[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const row = buildRow(
        candidates[i] as TapResult,
        i,
        cpById,
        alertById,
        conflictById,
        marketById,
        overlays,
      );
      if (row) out.push(row);
    }
    const conflictDetails = conflictChooserDetails(
      out.flatMap((row) => {
        const event = row.result.conflictEventId
          ? conflictById.get(row.result.conflictEventId)
          : null;
        return event ? [event] : [];
      }),
    );
    for (const row of out) {
      if (row.result.conflictEventId)
        row.secondary = conflictDetails.get(row.result.conflictEventId) ?? row.secondary;
    }
    return out;
  }, [
    candidates,
    chokepoints,
    alerts,
    conflictEvents,
    instruments,
    famineAreas,
    thermalEvents,
    genocideSituations,
  ]);

  const handleSelect = useCallback(
    (result: TapResult) => {
      onSelect(result);
    },
    [onSelect],
  );

  return (
    <SheetLayout
      sheetRef={sheetRef}
      onDismiss={onDismiss}
      handleTitle={chooserTitle(rows.map((row) => row.kind))}
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
