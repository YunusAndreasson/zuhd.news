import type { ConflictEvent, GdacsAlert } from '@shared/types';
import { formatCount, formatNumber } from './cards/format';
import { CONFLICT_FAMILY_LABEL, SUB_EVENT_LABEL } from './conflict';
import { EVENT_TYPE_LABEL, parseSeverityHero } from './gdacs';
import {
  type FamineArea,
  famineBlocks,
  type GenocideSituation,
  type ThermalEvent,
  thermalPlace,
} from './overlays';
import { displayCountryName } from './place-names';
import type { StraitState } from './strait-map';
import type { TapResult } from './tap-result';

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
