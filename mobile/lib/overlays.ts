import type { GenocideSituation } from '@shared/genocide';

/**
 * The three hazard layers the web map draws and the app did not: IPC famine
 * classifications, FIRMS thermal anomalies and UN genocide determinations.
 *
 * The payloads are the web's, unchanged — `/api/ipc.json`, `/api/firms.json`,
 * `/api/genocide.json` are a published contract. The types here are narrowed
 * to the fields the app reads, so a field the web adds later cannot fail the
 * app's validator. The full shapes are `IpcArea` and `ThermalEvent` in
 * `public/islands/_map/types.ts` and `GenocideSituation` in `shared/`.
 *
 * The encodings are the web's too (`public/islands/situation-map.ts`), kept as
 * pure functions so a mark on the phone and the same mark in the browser
 * cannot quietly disagree about how old or how hot something is.
 */

export type { GenocideSituation };

export interface FamineArea {
  id: string;
  area: string;
  iso3: string;
  iso2?: string;
  /** 3, 4 or 5 — IPC's own `overall_phase`, never derived. */
  phase: number;
  phaseName: string;
  lat: number;
  lng: number;
  /** `"Jun 2026"` — the analysis month. */
  vintage: string;
  ageMonths: number;
  pop?: { total?: number; p3plus?: number };
}

export interface FamineSnapshot {
  areas: FamineArea[];
}

export interface ThermalEvent {
  id: string;
  lat: number;
  lng: number;
  /** Earliest acquisition, ms. */
  t: number;
  /** Total fire radiative power across the cluster, MW. */
  frp: number;
  pixels: number;
  confidence: 'low' | 'nominal' | 'high';
  daynight?: 'D' | 'N';
  /** The place name the fetcher resolved, where it did. */
  near?: string;
  /** Slugs of the stories this anomaly was joined to. */
  relatedArticles?: string[];
}

export interface ThermalSnapshot {
  events: ThermalEvent[];
}

export interface GenocideSnapshot {
  situations: GenocideSituation[];
}

/** Web: opacity 1 → 0.55 as the analysis ages toward twelve months. */
export function famineAlpha(ageMonths: number): number {
  const t = Math.max(0, Math.min(1, ageMonths / 12));
  return 1 - 0.45 * t;
}

/** How many of the column's three blocks a phase fills. Clamped, so an
 *  out-of-range phase draws an empty frame — "classified, level unknown". */
export function famineBlocks(phase: number): 0 | 1 | 2 | 3 {
  return Math.max(0, Math.min(3, Math.round(phase) - 2)) as 0 | 1 | 2 | 3;
}

/** The famine column's box, in points, for Phase 3 and for Phase 5. */
const FAMINE_BOX_MIN = 10;
export const FAMINE_BOX_MAX = 14;

/**
 * A famine column's box, in points, by how many blocks it fills: the web's
 * 10–14px (`famine-marks` once zoomed to a region), gravest largest.
 *
 * It was the app's 22pt glyph family at 0.8–1.1, 18–24pt: wider than a story
 * beacon, so over Sudan the columns covered the stories they are the ground
 * of. The web goes smaller still at world zoom so a pile reads as texture; the
 * globe culls overlapping columns instead (`FAMINE_COLLIDE_*`), so it keeps the
 * size at which each of the three blocks can still be read.
 */
export function famineBox(blocks: number): number {
  const t = Math.max(0, Math.min(2, blocks - 1)) / 2;
  return FAMINE_BOX_MIN + (FAMINE_BOX_MAX - FAMINE_BOX_MIN) * t;
}

/** Web: opacity by the cluster's best confidence. */
export function thermalAlpha(confidence: ThermalEvent['confidence']): number {
  return confidence === 'high' ? 0.95 : confidence === 'nominal' ? 0.8 : 0.5;
}

/**
 * A thermal anomaly's box, in points, by radiative power: the web's
 * `thermal-marks`, about 7 at the floor and 18 at 5,000 MW. Log because FRP
 * spans four orders of magnitude between a field burn and a refinery, and a
 * linear scale would draw every mark but one at the minimum; capped at 5,000
 * because past it a fire is already the largest thing on the map.
 *
 * It was the app's 22pt glyph family at 0.7–1.3 (15–29pt) — the same gap the
 * famine column had (`famineBox`), which the user flagged as too large.
 */
export function thermalBox(frp: number): number {
  const mag = Math.min(1, Math.log1p(Math.max(0, frp)) / Math.log(5000));
  return 16 * (0.42 + 0.68 * mag);
}

/**
 * A conflict mark's size by the event's best fatality estimate, on a log
 * scale, 0.8–1.4 of the glow: the web map sizes its conflict squares the same
 * way. The app drew every event at one size, so a clash with one death and a
 * massacre with a hundred were the same mark. Log because the counts run from
 * zero to hundreds, and a linear scale would draw every mark but the worst at
 * the minimum. Unknown counts draw at the minimum, never as a guess.
 */
export function conflictScale(fatalities: number | null | undefined): number {
  const n =
    typeof fatalities === 'number' && Number.isFinite(fatalities) ? Math.max(0, fatalities) : 0;
  const t = Math.min(1, Math.log10(1 + n) / 2);
  return 0.8 + 0.6 * t;
}
