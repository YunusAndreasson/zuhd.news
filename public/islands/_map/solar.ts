// Solar geometry, and the night polygon it produces.
//
// The day/night terminator is the one layer on the map that is not news: it
// says what time it is where the news is happening, which is most of what makes
// a coordinate feel like a place rather than a dot. The canvas map drew it by
// hand; MapLibre wants it as geometry, so the same equations now emit a polygon
// instead of a stroke.

// Imported rather than reached for as the ambient `GeoJSON.*` UMD global:
// @types/geojson only exposes that global to non-module files, so every module
// referencing it was relying on a namespace TypeScript will not resolve here.
// esbuild erases type-only imports, so this costs the bundle nothing.
import type { Feature, LineString, Polygon } from 'geojson'
import { subsolarPoint } from '@shared/sun'

const DEG = Math.PI / 180

export { daysSinceJ2000, gmstHours, subsolarPoint, sunEquatorial } from '@shared/sun'

/**
 * Latitude of the terminator at a given longitude, for a sub-solar point.
 * Returns null when the sun is close enough to the equator that the terminator
 * runs pole to pole and the closed-polygon form below degenerates.
 */
export function terminatorLat(lng: number, sun: { lat: number; lng: number }) {
  const tanDec = Math.tan(sun.lat * DEG)
  if (Math.abs(tanDec) < 1e-6) return null
  const hourAngle = (lng - sun.lng) * DEG
  return Math.atan(-Math.cos(hourAngle) / tanDec) / DEG
}

/**
 * One hemisphere: the terminator ring, closed over a pole.
 *
 * `nightPolygon` and `dayPolygon` were the same twenty lines twice, differing
 * only in the sign of the pole they close over — and that sign is the whole
 * correctness of both. Reversed, the map lights the wrong half of the planet
 * and nothing throws; `map-geo.test.js` pins it precisely because the failure
 * is silent. One copy makes the relationship between the two a `* side` rather
 * than two independently-maintained ternaries free to disagree.
 *
 * `side` is +1 for the lit half and −1 for the dark one. The ring is walked
 * west to east at 1° and closed at the appropriate pole, latitudes clamped to
 * ±89.9 — which is why, at an equinox, the cap can only be identified by the
 * closing vertex being at *exactly* ±90.
 *
 * Returns null where `terminatorLat` degenerates, which is a twelve-second
 * window twice a year; the honest answer there is to draw nothing.
 */
/**
 * The terminator itself, walked west to east at 1°, clamped to ±89.9.
 *
 * Split out when `terminatorBand` needed the same curve *open* rather than
 * closed over a pole. Two copies of this walk would have been two chances to
 * drift on the clamp, the step and the inclusive `<= 180` — and the second copy
 * would have looked exactly like the first while the shade and the band it is
 * drawn against slowly parted.
 */
function terminatorRing(sun: { lat: number; lng: number }): Array<[number, number]> | null {
  if (terminatorLat(0, sun) === null) return null
  const ring: Array<[number, number]> = []
  for (let lng = -180; lng <= 180; lng += 1) {
    const lat = terminatorLat(lng, sun)
    if (lat === null) return null
    ring.push([lng, Math.max(-89.9, Math.min(89.9, lat))])
  }
  return ring
}

function hemisphere(date: Date, side: 1 | -1): Feature<Polygon> | null {
  const sun = subsolarPoint(date)
  const ring = terminatorRing(sun)
  if (!ring) return null

  const pole = (sun.lat >= 0 ? 90 : -90) * side
  ring.push([180, pole], [-180, pole], ring[0])

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  }
}

/**
 * The unlit hemisphere as a single GeoJSON polygon.
 *
 * Walking the terminator west to east gives its southern or northern edge; the
 * shape is then closed along whichever pole is currently in darkness. Which
 * pole that is flips with the season — in northern summer the sun never sets
 * over the Arctic, so the night cap is the *southern* one — and getting it
 * backwards lights the wrong half of the planet.
 *
 * At an equinox `terminatorLat` degenerates and this draws nothing. That window
 * is about twelve seconds, twice a year — `prayer.ts` measured it; the comment
 * here used to say "a few hours".
 */
export function nightPolygon(date: Date): Feature<Polygon> | null {
  // Night lies on the far side of the terminator from the sub-solar latitude.
  return hemisphere(date, -1)
}

/**
 * The lit hemisphere — the same terminator ring, closed over the other pole.
 *
 * Needed because the night overlay cannot be seen over water. It is black at
 * 0.28 and the ocean is `#080a0d`, whose luminance is 0.003: darkening that
 * moves it by about two values out of 255. So the terminator read across the
 * land and stopped dead at the coast, which made day and night look like a
 * property of continents rather than of the planet.
 *
 * Darkening the night side further is not available — there is no room below
 * near-black. Lightening the *day* side is, and it costs nothing on land
 * because the land layer is drawn on top of this one. The ocean gets a visible
 * terminator; `--map-ground` and the CSS seam that depends on it are untouched.
 */
export function dayPolygon(date: Date): Feature<Polygon> | null {
  // The mirror of `nightPolygon`: day closes over the pole the sun is on.
  return hemisphere(date, +1)
}

/**
 * The terminator as an open curve, for the twilight band drawn along it.
 *
 * ── Why the shade needed one at all ───────────────────────────────────────
 *
 * `night-shade` is a single fill at 0.28 with a hard boundary, so the map's
 * entire lighting model is a **step function**: every point on the night side
 * is darkened by exactly the same amount, and the change from day to night
 * happens across zero degrees. A sphere lit by a step does not read as a lit
 * sphere; it reads as a disc with a shape painted on it, which is most of why
 * the globe felt flat while every individual layer measured correctly.
 *
 * ── Why a band and not a stack of caps ────────────────────────────────────
 *
 * The obvious fix is the real one: draw civil, nautical and astronomical
 * twilight as their own regions at −6°, −12° and −18°. Each of those is a
 * spherical cap of radius `90° − |alt|` around the antisolar point, and the
 * walk above can only express a cap that **spans every longitude**, which needs
 * `|declination| >= |alt|`. The sun clears 18° of declination for about two
 * months a year and 12° for about five. So a stack of caps built this way would
 * appear and disappear with the season — the night side visibly changing
 * darkness through the year, for a reason no reader could ever recover. Drawing
 * them properly means true geodesic caps split at the antimeridian, which is
 * the failure `prayer.ts` records as a bar across the whole map, and it is a
 * larger piece of work than the thing it fixes.
 *
 * A blurred band laid *along* the terminator gets the ramp with none of that:
 * the curve always exists (outside the twelve-second equinox window the walk
 * already returns null for), it needs no new spherical geometry, and if it ever
 * fails to draw the shade underneath is exactly what shipped before it.
 *
 * ── Why it lightens ───────────────────────────────────────────────────────
 *
 * The same argument `dayPolygon` above makes about water, applied to the edge
 * instead of the hemisphere: there is no room below near-black, so the ramp has
 * to be cut *upward* out of the night rather than downward into the day. Deep
 * night is therefore untouched at 0.28 and every measurement taken against it
 * still holds; what changes is the twenty degrees or so nearest the terminator.
 *
 * `side` carries the offset's sign, because the band belongs on the dark side
 * and which side that is flips with the season. The walk runs west to east and
 * MapLibre offsets a line to the **right** of its direction of travel, which is
 * south — so northern summer, whose night cap is the southern one, offsets
 * positive. Getting this backwards lights the lit half a second time, silently,
 * which is the failure `hemisphere` already keeps a test for.
 */
export function terminatorBand(date: Date): Feature<LineString> | null {
  const sun = subsolarPoint(date)
  const ring = terminatorRing(sun)
  if (!ring) return null
  return {
    type: 'Feature',
    properties: { side: sun.lat >= 0 ? 1 : -1 },
    geometry: { type: 'LineString', coordinates: ring },
  }
}
