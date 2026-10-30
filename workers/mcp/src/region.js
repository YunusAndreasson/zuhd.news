// Which part of the world a point on the coverage map is in.
//
// `scripts/lib/regions.js` answers this for the pipeline's tallies in six codes;
// this one is read by people and draws the finer lines they expect, so Mexico
// City is not filed with Washington, and it has to bundle into the worker alone.
//
// A ladder of boxes, tried in order. Turkey and Egypt are the Middle East and
// Russia is Europe, as they are in `REGION_CODES`. Coarse is the intent: Rhodes
// comes back Middle East and Tijuana North America, which a tally of a day's
// stories can stand.

// The Urals, and Iran's border with Pakistan and Afghanistan.
const ASIA_WEST = 60.5

export function classifyRegion(lat, lng) {
  if (lat < -60) return 'Other'

  // First, because the Africa and Asia boxes below would both claim parts of it.
  // Egypt to Iran, Turkey and the Caucasus; then south Arabia, whose Red Sea
  // coast runs against the Horn; then Central Asia.
  if (lng >= 25 && lng < ASIA_WEST && lat >= 22 && lat < 42.5) return 'Middle East & Central Asia'
  if (lng >= 39 && lng < ASIA_WEST && lat >= 12.4 && lat < 22) return 'Middle East & Central Asia'
  if (lng >= 50 && lng < 80 && lat >= 37 && lat < 52) return 'Middle East & Central Asia'

  // The Mediterranean is at no one latitude: Tangier is south of Gibraltar,
  // Tunis north of Malta.
  const africaNorth = lng < -1 ? 35.95 : lng < 12 ? 37.4 : 33.5
  if (lng >= -26 && lng < ASIA_WEST && lat < africaNorth) return 'Africa'
  // Russia entire, north of Central Asia: a story with no city sits on its centroid in Siberia.
  if (lng >= -32 && lat >= 33 && (lng < ASIA_WEST || lat >= 55)) return 'Europe'

  if (lng >= ASIA_WEST && lng < 150 && lat >= 22 && lat < 55) return 'East & South Asia'
  if (lng >= ASIA_WEST && lng < 92 && lat >= -11 && lat < 22) return 'East & South Asia'
  if (lng >= 92 && lng < 141 && lat >= -11 && lat < 22) return 'Southeast Asia'
  if (lat < -11 && lng >= 92) return 'Oceania'
  if (lat < 24.5 && (lng >= 141 || lng < -120)) return 'Oceania'

  // Mexico reaches north of the Caribbean's line only west of the Rio Grande's bend.
  if (lng >= -120 && lng < -32 && (lat < 24.5 || (lat < 31.7 && lng < -100))) return 'Latin America'
  if (lng >= -170 && lng < -32 && lat >= 24.5) return 'North America'
  return 'Other'
}
