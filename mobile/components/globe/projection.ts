/**
 * Pure math + data helpers for MiniGlobe. No Skia, no Reanimated, no React —
 * everything here is unit-testable in isolation and safe to import from
 * anywhere. The rendering pipeline in MiniGlobe.tsx composes these into the
 * per-frame projection.
 */

import { geoCircle, geoContains } from 'd3-geo';
import { COUNTRY_OVERRIDES } from './coordinates';
import { countries, countryAreas, countryBboxes } from './shared';

// ── Astronomical / time constants ──────────────────────────────────────────

export const NORTH_POLE: [number, number] = [0, 90];
export const SOUTH_POLE: [number, number] = [0, -90];
export const ARCTIC_CIRCLE = geoCircle().center(NORTH_POLE).radius(23.44)();
export const ANTARCTIC_CIRCLE = geoCircle().center(SOUTH_POLE).radius(23.44)();
export const HALF_PI = Math.PI / 2;

/** Exponential decay λ for story-pin opacity — Math.LN2 / 18h = 18-hour half-life. */
export const DECAY_LAMBDA = Math.LN2 / 18;

// ── Zoom / clip thresholds ─────────────────────────────────────────────────

/** Cheap zoom-gated layers (neighbour labels, water-feature labels) fade
 *  in from clip=30°. At small-country 1× (clip ≈ 25°) the reader gets a
 *  faint "whisper" of geographic context without needing to tap the zoom
 *  pill. Full opacity at 10°. */
export const PLACES_APPEAR_CLIP = 30;
export const PLACES_FULL_CLIP = 10;

/** Heavy rivers-path projection fade range — gated tighter than the cheap
 *  layers so the ~9k-vertex projection only kicks in once the user actually
 *  taps zoom. Keeps small-country 1× stories free of the settle-frame spike
 *  a rivers projection would cause. Visible from 22° → 10°. */
export const RIVERS_APPEAR_CLIP = 22;

// ── Reference locations ────────────────────────────────────────────────────

/** Makkah — qibla direction reference. [lng, lat] for d3-geo. */
export const MAKKAH = {
  coords: [39.83, 21.42] as [number, number],
  name: 'Makkah',
};

// ── Moon phase ─────────────────────────────────────────────────────────────

const SYNODIC = 29.53059;
const KNOWN_NEW_MOON = Date.UTC(2025, 0, 29, 12, 36); // Jan 29, 2025 12:36 UTC

/** Fractional moon phase in [0, 1). 0 = new, 0.5 = full. */
export function getMoonPhase(): number {
  const days = (Date.now() - KNOWN_NEW_MOON) / 86400000;
  return (((days % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC;
}

// ── Sun position ───────────────────────────────────────────────────────────

let cachedSunPos: [number, number] = [0, 0];
let sunPosTs = 0;

/** Bust sun-position cache so the next call recalculates immediately. */
export function invalidateSunCaches(): void {
  sunPosTs = 0;
}

/** Sun's subsolar point [lng, lat] at current UTC. Cached 60s. */
export function getSunPosition(): [number, number] {
  const now = Date.now();
  if (now - sunPosTs < 60000) return cachedSunPos;
  sunPosTs = now;
  const d = new Date(now);
  const dayOfYear = Math.floor((now - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000);
  const declination = -23.44 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
  const hourAngle = ((d.getUTCHours() + d.getUTCMinutes() / 60) / 24) * 360 - 180;
  cachedSunPos = [-hourAngle, declination];
  return cachedSunPos;
}

// ── Local time formatting ──────────────────────────────────────────────────

const localTimeCache = new Map<string, { ts: number; value: string }>();

/** HH:MM in the given IANA timezone, or null on failure. Cached 30s. */
export function formatLocalTime(tz: string): string | null {
  const now = Date.now();
  const cached = localTimeCache.get(tz);
  if (cached && now - cached.ts < 30_000) return cached.value;
  try {
    const value = new Date(now).toLocaleTimeString('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    });
    localTimeCache.set(tz, { ts: now, value });
    return value;
  } catch {
    return null;
  }
}

// ── Hit-test / geometry helpers ────────────────────────────────────────────

/** Squared-distance hit test: is (x, y) within `r` of (px, py)? Caller passes r². */
export function isNear(x: number, y: number, px: number, py: number, r2: number): boolean {
  const dx = x - px;
  const dy = y - py;
  return dx * dx + dy * dy <= r2;
}

/** Append alpha channel to hex color. a ∈ [0, 1]. */
export function withAlpha(hex: string, a: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, a)) * 255);
  return `${hex}${byte.toString(16).padStart(2, '0')}`;
}

// ── Point-in-country lookup ────────────────────────────────────────────────

/** Nudge offsets for coastal/border coordinate fallback. 0.1° ≈ 11 km. */
const NUDGES: [number, number][] = [
  [0, 0],
  [0.1, 0],
  [-0.1, 0],
  [0, 0.1],
  [0, -0.1],
  [0.1, 0.1],
  [-0.1, 0.1],
  [0.1, -0.1],
  [-0.1, -0.1],
  [0.2, 0],
  [-0.2, 0],
  [0, 0.2],
  [0, -0.2],
  [0.3, 0],
  [-0.3, 0],
  [0, 0.3],
  [0, -0.3],
];

/** Find the country polygon containing (lat, lng). Checks manual overrides
 *  first, then tries small nudges so coastal/disputed coordinates resolve. */
export function findCountry(
  lat: number,
  lng: number,
  location?: string | null,
): GeoJSON.Feature | null {
  if (location) {
    const override = COUNTRY_OVERRIDES[location.toLowerCase()];
    if (override) {
      return countries.features.find((f) => f.properties?.name === override) ?? null;
    }
  }
  for (const [dlat, dlng] of NUDGES) {
    const ptLng = lng + dlng;
    const ptLat = lat + dlat;
    const pt: [number, number] = [ptLng, ptLat];
    for (let i = 0; i < countries.features.length; i++) {
      const bbox = countryBboxes[i];
      const feat = countries.features[i];
      if (!bbox || !feat) continue;
      const [minLng, minLat, maxLng, maxLat] = bbox;
      if (ptLng < minLng || ptLng > maxLng || ptLat < minLat || ptLat > maxLat) continue;
      if (geoContains(feat, pt)) return feat;
    }
  }
  return null;
}

// ── Clip-angle math ────────────────────────────────────────────────────────

/** Clip angle for a country's spherical area — smaller countries get tighter
 *  clip (more zoom). Below 0.002 sr → 25°; above 0.03 sr → 70°; linear between.
 *  The 70° cap (was 90°) keeps the 1×→2× camera step feeling like a zoom
 *  instead of a warp on large countries (Russia, Canada, Brazil): delta drops
 *  from 6× to ~3.9× tighter at the cost of slightly less "this nation is
 *  vast" framing. Also reduces per-frame land/country vertex draws at 1× for
 *  big countries (clipCircle keeps fewer points after the test). */
export function clipAngleForArea(area: number): number {
  if (area < 0.002) return 25;
  if (area < 0.03) return 25 + ((area - 0.002) / (0.03 - 0.002)) * 45;
  return 70;
}

/** Clip angle for a named country (lookup `countryAreas`, fall back to 1 sr). */
export function clipAngleForCountry(countryName: string | null): number {
  const area = countryName ? (countryAreas[countryName] ?? 1) : 1;
  return clipAngleForArea(area);
}
