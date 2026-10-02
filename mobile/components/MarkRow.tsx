import type { ConflictEvent, GdacsAlert } from '@shared/types';
import { Canvas, Circle, Path, RadialGradient, vec } from '@shopify/react-native-skia';
import { type ComponentProps, memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING, straitMarkColor, withAlpha } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { formatCount, formatNumber } from '../lib/cards/format';
import { SUB_EVENT_LABEL } from '../lib/conflict';
import { parseSeverityHero } from '../lib/gdacs';
import {
  type FamineArea,
  famineBlocks,
  type GenocideSituation,
  type ThermalEvent,
  thermalPlace,
} from '../lib/overlays';
import { displayCountryName } from '../lib/place-names';
import type { StraitState } from '../lib/strait-map';
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

// Row icon footprint — small enough to keep rows tight (~52px tall),
// large enough that the GDACS glyph stays legible at a glance.
const ROW_ICON = 28;

/** A mark on the globe, as a row: the chooser's candidates and the menu's
 *  hazard lists. */
export interface MarkRowData {
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

/** A genocide determination, as a row. */
export function genocideMarkRow(g: GenocideSituation, result: TapResult): MarkRowData {
  return {
    key: `genocide-${g.id}`,
    result,
    primary: g.name,
    secondary: 'genocide · as determined by the UN',
    kind: 'genocide',
  };
}

/** An IPC famine classification, as a row. */
export function famineMarkRow(a: FamineArea, result: TapResult): MarkRowData {
  return {
    key: `famine-${a.id}`,
    result,
    primary: a.area,
    secondary: `${a.phaseName.toLowerCase()} · IPC phase ${a.phase}`,
    kind: 'famine',
    blocks: famineBlocks(a.phase),
  };
}

/** A FIRMS thermal anomaly, as a row. It carries no country, only `near`. */
export function thermalMarkRow(e: ThermalEvent, result: TapResult): MarkRowData {
  return {
    key: `thermal-${e.id}`,
    result,
    primary: thermalPlace(e) ?? 'Thermal anomaly',
    secondary: `thermal anomaly · ${formatCount(e.frp)} MW`,
    kind: 'thermal',
  };
}

/**
 * An alert's own measure — `M 4.9 · 64 km deep`, `5,973 ha · burn area` —
 * or null where GDACS publishes nothing that parses. The row said
 * `wildfire · Angola` under `Forest fires in Angola`: the title twice, and
 * `disasters` listed four Angolan fires no reader could tell apart
 * (2026-09-27), as the conflict rows once did.
 */
function gdacsMeasure(alert: GdacsAlert): string | null {
  const { focal, secondary } = parseSeverityHero(alert);
  if (!focal || focal === alert.severityText || focal === `${alert.alertlevel} alert`) return null;
  return secondary ? `${focal} · ${secondary}` : focal;
}

/** A GDACS alert, as a row. */
export function gdacsMarkRow(alert: GdacsAlert, result: TapResult): MarkRowData {
  const country = displayCountryName(alert.country) ?? alert.country;
  return {
    key: `gdacs-${alert.eventid}`,
    result,
    primary: alert.name.length > 0 ? alert.name : EVENT_TYPE_LABEL[alert.eventtype],
    // The country only where the title does not already name it.
    secondary: [
      gdacsMeasure(alert) ?? EVENT_TYPE_LABEL[alert.eventtype].toLowerCase(),
      country && !alert.name.includes(country) ? country : null,
    ]
      .filter(Boolean)
      .join(' · '),
    kind: 'gdacs',
    eventtype: alert.eventtype,
    alertlevel: alert.alertlevel,
  };
}

/** A conflict event, as a row. */
export function conflictMarkRow(evt: ConflictEvent, result: TapResult): MarkRowData {
  const country = displayCountryName(evt.country) ?? evt.country;
  const primary =
    evt.fatalities > 0
      ? `${formatNumber(evt.fatalities)} killed · ${SUB_EVENT_LABEL[evt.subEvent]}`
      : SUB_EVENT_LABEL[evt.subEvent];
  return {
    key: `conflict-${evt.id}`,
    result,
    primary,
    secondary: `${CONFLICT_FAMILY_LABEL[evt.family].toLowerCase()}${country ? ` · ${country}` : ''}`,
    kind: 'conflict',
  };
}

interface RowIconProps {
  row: MarkRowData;
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

/** The row's mark, in its globe hue and shape. */
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

/**
 * One mark, as a pressable row: its glyph, what it is, and where. The chooser
 * wraps it in its entrance; the menu's lists render it bare.
 */
export const MarkRow = memo(function MarkRow({
  row,
  onPress,
}: {
  row: MarkRowData;
  onPress: (result: TapResult) => void;
}) {
  const { colors } = useTheme();
  const handlePress = useCallback(() => onPress(row.result), [onPress, row.result]);
  return (
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
