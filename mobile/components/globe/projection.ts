/**
 * Pure math + data helpers for MiniGlobe. No Skia, no Reanimated, no React —
 * everything here is unit-testable in isolation and safe to import from
 * anywhere. The rendering pipeline in MiniGlobe.tsx composes these into the
 * per-frame projection.
 */

import { COUNTRY_OVERRIDES } from '@shared/globe/coordinates';
import { geoContains } from 'd3-geo';
import { getGlobeGeography } from './geography';
import { countries, countryAreas, countryBboxes } from './shared';

// ── Astronomical / time constants ──────────────────────────────────────────

/** Exponential decay λ for story-pin opacity — Math.LN2 / 18h = 18-hour half-life. */
export const DECAY_LAMBDA = Math.LN2 / 18;

// ── Zoom / clip thresholds ─────────────────────────────────────────────────

/** Non-anchor neighbour labels and water-feature labels fade in from
 *  clip=25°, full opacity at 10°. The story framings (18°–24°,
 *  `clipAngleForArea`) sit inside the ramp, so a closer framing names more of
 *  its neighbours, and the wider view a swipe rises through names fewer.
 *  Anchor-tier countries (`area ≥ ANCHOR_COUNTRY_AREA`) bypass this gate
 *  and render at all zooms — they exist as persistent continental anchors
 *  that orient the reader before the zoom pill is touched. The zoom pill
 *  (level 1 = clip 18°, level 2 = clip 10°) reveals the rest of the atlas. */
export const PLACES_APPEAR_CLIP = 25;
export const PLACES_FULL_CLIP = 10;

/** Spherical-area threshold (steradians on the unit sphere) above which a
 *  country renders as an always-on anchor label at 1× ambient zoom. ~40
 *  countries qualify worldwide by area alone. Tuned against the area
 *  histogram of the 110m topology (`geoArea` per feature):
 *    0.030 → 25 anchors  (intentionally sparse)
 *    0.020 → 38 anchors  (adds Egypt, Nigeria, Pakistan, Chile, …)
 *    0.018 → 40 anchors  (adds Turkey — too important to omit)
 *    0.015 → 45 anchors  (starts crowding the eastern hemisphere)
 *  Pure-area gating undercounts Europe (geographically compact) and
 *  several primary Asian states, so the recognition-tier set below
 *  (`ANCHOR_NAMES_EXTRA`) rebalances. */
export const ANCHOR_COUNTRY_AREA = 0.018;

/** Recognition-tier anchor countries — names a global news reader expects
 *  to see oriented in 1× framings, but whose spherical area falls below
 *  ANCHOR_COUNTRY_AREA. Geography means a pure area threshold underweights
 *  Europe (a continent compact in real surface area) and several primary
 *  Asian states, so this curated list rebalances. Sized at the bigger end
 *  of each region — small enough that Europe doesn't outweigh Africa, large
 *  enough that the camera lands on at least one familiar name in any view.
 *  Membership criterion is recognition by a global reader, not population
 *  or GDP — easy to argue at the margin, but the set is intentionally
 *  conservative (additions invite a follow-on debate; subtractions don't). */
export const ANCHOR_NAMES_EXTRA: ReadonlySet<string> = new Set([
  // Europe — a deliberately sparse recognition spine, not full coverage.
  // Europe is geographically compact, so at 1× ambient zoom a generous list
  // packs into a wall of names (the densest cluster on the globe). We keep
  // only the large, centroid-isolated members that orient the reader; the
  // rest (Portugal, Netherlands, Switzerland, Ireland, the Nordics minus
  // Sweden, and the whole Central/Eastern band) are de-anchored and resurface
  // through the non-anchor label path as the zoom pill tightens the clip.
  'France',
  'Germany',
  'Spain',
  'Italy',
  'United Kingdom',
  'Poland',
  'Ukraine',
  'Sweden',
  'Greece',
  // Africa — Maghreb completion (Algeria/Libya/Egypt anchor by area),
  // Gulf of Guinea coast (Nigeria is the only nearby anchor), East Africa
  // recognition anchor (Kenya), and the Mozambique-Channel isolate.
  'Morocco',
  'Tunisia',
  "Côte d'Ivoire",
  'Ghana',
  'Kenya',
  'Madagascar',
  // Asia / Middle East
  'Japan',
  'Vietnam',
  'Thailand',
  'Philippines',
  'Malaysia',
  'Iraq',
  'Yemen',
  'Syria',
  'Lebanon',
  'Palestine',
  'Jordan',
  'Bangladesh',
  'South Korea',
  'North Korea',
  'Taiwan',
  // Pacific / Caribbean — geographic isolates that benefit from the label
  'New Zealand',
  'Cuba',
  'Papua New Guinea',
  'Sri Lanka',
  'Iceland',
  // Latin America — fills the Pacific-coast gap between Colombia/Peru and
  // adds a Southern Cone counterweight to Chile/Argentina.
  'Ecuador',
  'Uruguay',
]);

/** Past this the rivers draw on every frame, easing in toward 10°. Below the
 *  tightest story framing (18°, `clipAngleForArea`), so a swipe between
 *  stories never projects the ~9k-vertex set: at the framings themselves the
 *  rivers are settled-frame work (`RIVERS_REST_CLIP`). */
export const RIVERS_APPEAR_CLIP = 17;

/**
 * The widest framing that still draws rivers, on settled frames only — wider
 * than any story framing (they top out at 24°, `clipAngleForArea`), so a
 * reader who pinches out a little keeps them. Below
 * `RIVERS_APPEAR_CLIP` they draw on every frame, as before. Between the two
 * they are drawn once the camera stops, because the rank-3 set is ~9k
 * vertices and a drag must not pay for it, but a reader looking at Mali saw no
 * Niger and one looking at Australia no Murray–Darling without pinching in.
 */
export const RIVERS_REST_CLIP = 40.5;
/** How strongly the resting rivers draw: present, never louder than a border. */
export const RIVERS_REST_OPACITY = 0.5;

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
      const matched = getGlobeGeography('overview').countryNamed(override);
      // If the override names a feature the topology doesn't carry,
      // fall through to the coordinate nudge loop
      // instead of returning null — returning null here would drop the focal
      // highlight AND suppress the dot/time label for the whole story.
      if (matched) return matched;
    }
  }
  const exact = getGlobeGeography('overview').countryAt(lng, lat);
  if (exact) return exact;
  for (const [dlat, dlng] of NUDGES) {
    // Wrap a nudge that crosses the antimeridian (179.95 + 0.1 → -179.95) —
    // bboxes are clamped to [-180, 180], so an unwrapped 180.05 would fail
    // the prefilter and never reach geoContains for Fiji/Chukotka coords.
    let ptLng = lng + dlng;
    if (ptLng > 180) ptLng -= 360;
    else if (ptLng < -180) ptLng += 360;
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
 *  clip (more zoom). Below 0.002 sr → 18°; above 0.03 sr → 24°; linear between.
 *
 *  The cap was 70°, and before that 90°. Once zooming grew the planet itself
 *  rather than the ground inside a fixed disc, a swipe from a small country
 *  to a large one swelled and shrank the whole globe by 2.2× — a wobble with
 *  no meaning. 25°–45° still spanned 1.7× and read as the map jumping on
 *  every swipe; the framings now span 1.3×, and the travel between two
 *  stories is carried by the crossing's own zoom-out (`flyCurve`) instead of
 *  by the difference in their sizes.
 *
 *  Keep that spread when changing the level. At 30°–40° a story in Sudan
 *  framed everything from Russia to South Africa, and the user asked to be
 *  taken closer to each place (2026-09-19); 18°–24° is about 1.6× closer, near
 *  what the web's `flyToStory` zoom of 2.5 shows across a phone's width. */
/** The framing a story with no country of its own rests at, and the widest any
 *  story rests at. The UI thread falls back to it when a camera track runs
 *  longer than the article set behind it. */
export const FRAMING_WIDEST = 24;

function clipAngleForArea(area: number): number {
  if (area < 0.002) return 18;
  if (area < 0.03) return 18 + ((area - 0.002) / (0.03 - 0.002)) * 6;
  return FRAMING_WIDEST;
}

/** Clip angle for a named country (lookup `countryAreas`, fall back to 1 sr). */
export function clipAngleForCountry(countryName: string | null): number {
  const area = countryName ? (countryAreas[countryName] ?? 1) : 1;
  return clipAngleForArea(area);
}
