// The graticule: meridians and parallels, so the sphere reads as a sphere.
//
// ── Why a map that had rationed lines this hard added a line family ────────
//
// Because the projection was making a claim the drawing could not support. The
// map became a globe, and on the night hemisphere there is nothing to say so:
// space and sea are the *same colour by construction* (`--map-ground` is
// `MAP_COLOURS.ocean`, so the scrims over the canvas keep meaning what they
// meant on the flat map), and MapLibre lights the atmosphere from the sun's own
// direction, so the limb is a crescent along the day side and unlit everywhere
// else. Half the planet therefore had no edge at all — it ended wherever the
// last coastline happened to be.
//
// Darkening space to give it one is not available: the ocean is `#080a0d`, so
// everything below it is inside 1.09:1 of black, which is the same wall the
// terminator hit over water and the reason `day-shade` lifts the lit side
// instead of darkening the dark one.
//
// A graticule solves it from the other direction, and it is the honest solution
// rather than a clever one: **the curvature of the lines is the encoding.**
// Meridians converging toward a pole and parallels bowing away from the equator
// are what a sphere looks like, at any tone, on any ground — so the cue costs no
// contrast, works identically on the day and night sides, and its outermost arcs
// trace exactly the limb the atmosphere cannot draw. And it is real geography:
// this map already prints Yafa and Al-Quds and refuses Mercator over area, and a
// coordinate grid is the plainest true thing that can be drawn on a globe.
//
// It is furniture, not data, and every parameter says so — see the layer in
// `situation-map.ts` for the tone, the width and the fade.

import type { Feature, LineString } from 'geojson'

/**
 * Degrees between lines.
 *
 * Thirty gives twelve meridians and five parallels, which is the spacing an
 * atlas uses at world scale and about half what feels busy here. Twenty was
 * tried and reads as a net over the oceans — the same failure the ungated river
 * layer had, in another vocabulary.
 */
const STEP = 30

/**
 * Degrees between the points a line is walked in.
 *
 * A meridian is a straight line in longitude and a curve on screen, so the
 * chord error is the projection's, not the geometry's: five degrees keeps a
 * meridian smooth at the limb, where a globe compresses longitude hardest and a
 * coarse walk shows as a polygon.
 */
const WALK = 5

/**
 * Where the meridians stop.
 *
 * Not the poles. Twelve lines meeting at a point draw a star at each cap — a
 * mark, and a loud one, at the two places on this map with the least to say. It
 * also degenerates: within a few degrees of the pole the twelve are inside one
 * pixel of each other and composite into a solid dot. Stopping at 85° leaves the
 * convergence legible, which is the part that reads as curvature, and leaves the
 * cap to the parallels.
 */
const CAP = 85

const line = (coordinates: number[][], id: string): Feature<LineString> => ({
  type: 'Feature',
  properties: { id },
  geometry: { type: 'LineString', coordinates },
})

/**
 * The grid, as one collection.
 *
 * Generated rather than fetched: it is 761 points of pure arithmetic, so a file
 * for it would be a request and a cache key (`BASEMAP_V`) bought for something
 * the client can produce before the first frame.
 *
 * **Nothing crosses the antimeridian.** A parallel runs from −180 to +180 and
 * stops; it does not wrap, so the bar-across-the-map failure `prayer.ts`
 * documents cannot arise here. The meridian *at* −180 is drawn and its +180 twin
 * is not, because with `renderWorldCopies: false` they are the same edge of the
 * same world and drawing both puts two lines on one seam.
 */
export function graticuleLines(): Feature<LineString>[] {
  const out: Feature<LineString>[] = []

  for (let lng = -180; lng < 180; lng += STEP) {
    const coordinates: number[][] = []
    for (let lat = -CAP; lat <= CAP; lat += WALK) coordinates.push([lng, lat])
    out.push(line(coordinates, `m${lng}`))
  }

  for (let lat = -90 + STEP; lat <= 90 - STEP; lat += STEP) {
    const coordinates: number[][] = []
    for (let lng = -180; lng <= 180; lng += WALK) coordinates.push([lng, lat])
    out.push(line(coordinates, `p${lat}`))
  }

  return out
}
