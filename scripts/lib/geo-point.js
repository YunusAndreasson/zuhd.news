// One point standing for one shape.
//
// Two surfaces need this and for the same reason: a polygon has to be reduced to
// a single coordinate, and the obvious reduction is wrong. The country card's
// globe used to average the United States with Alaska and Hawaii and land in the
// Pacific; the IPC layer reduces 63 MB of subnational livelihood zones to one
// mark each, and averaging a multipart zone puts the mark off its own ground.
//
// `geoCentroid` and `geoArea` are injected rather than imported, because both
// callers already resolve `d3-geo` on their own schedule — `country-pages.js`
// dynamically, inside the builder — and a static import here would decide that
// for them.

/**
 * The centroid of a feature's largest polygon.
 *
 * `geoCentroid` over the whole feature is wrong for exactly the shapes people
 * care about most: it averages a mainland with its islands and lands in the sea
 * between them. Taking the centroid of the *largest* ring instead puts the point
 * on the landmass a reader would recognise, which is the only job it has.
 *
 * Returns `null` rather than a plausible-looking coordinate when the geometry is
 * missing or unusable — a `{ lat: 0, lng: 0 }` fallback is null island, and
 * nothing downstream has any reason to doubt it.
 */
export const largestPolygonCentroid = (feat, geoCentroid, geoArea) => {
  const g = feat?.geometry
  if (!g) return null
  let target = null
  if (g.type === 'Polygon') {
    target = g
  } else if (g.type === 'MultiPolygon') {
    let bestArea = -1
    for (const coordinates of g.coordinates) {
      const poly = { type: 'Polygon', coordinates }
      const area = geoArea(poly)
      if (area > bestArea) {
        bestArea = area
        target = poly
      }
    }
  }
  if (!target) return null
  const [lng, lat] = geoCentroid(target)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

/**
 * A representative point for any IPC feature.
 *
 * The IPC's own files mix geometry types inside one collection — Somalia is 63
 * `Point` features (urban and IDP caseloads) beside 26 `Polygon` and 18
 * `MultiPolygon` livelihood zones — so a reducer that only handles polygons
 * silently drops the urban areas, which in Somalia is most of the caseload. A
 * `Point` is already the answer and is passed through.
 */
export const representativePoint = (feat, geoCentroid, geoArea) => {
  const g = feat?.geometry
  if (!g) return null
  if (g.type === 'Point') {
    const [lng, lat] = g.coordinates ?? []
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  }
  return largestPolygonCentroid(feat, geoCentroid, geoArea)
}
