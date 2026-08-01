// Which part of the world a dateline is in.
//
// Three copies of this bbox ladder — `compute-metrics.js`, the dashboard
// server, and the autoresearch scorer, whose copy carried the comment "Bbox
// match used by production compute-metrics.js" and was a hand-transcription of
// it. The scorer's job is to reproduce what the production metric measures, so
// a transcription is the one thing it must not be: the two could part without
// either looking wrong, and the whole point of the scorer is that its numbers
// mean the same thing as the pipeline's.
//
// It is a coarse ladder of boxes, evaluated in order, and the order is what
// resolves the overlaps: the Middle East box is tested first because it sits
// inside both the Asia and the Africa boxes. Coarse is the intent — this
// attributes coverage to a continent for a tally, and a point-in-polygon
// resolver against real borders is `country-pages.js`'s job, on a different
// question.

/** The regions, and the ISO-2 codes that belong to each. */
export const REGION_CODES = {
  ME: ['SA', 'AE', 'EG', 'IL', 'IR', 'IQ', 'JO', 'KW', 'LB', 'OM', 'PS', 'QA', 'SY', 'TR', 'YE', 'BH'],
  AS: ['IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'AF', 'CN', 'JP', 'KR', 'KP', 'MN', 'TW', 'HK', 'ID', 'MY', 'PH', 'SG', 'TH', 'VN', 'KH', 'LA', 'MM', 'TJ', 'UZ', 'KG', 'TM', 'KZ'],
  AF: ['DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CM', 'CV', 'CF', 'TD', 'KM', 'CG', 'CD', 'DJ', 'GQ', 'ER', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'CI', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RW', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD', 'SZ', 'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW'],
  EU: ['AL', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'MD', 'NL', 'NO', 'PL', 'PT', 'RO', 'RU', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'BY', 'BA', 'MK', 'ME', 'XK'],
  AM: ['AR', 'BO', 'BR', 'CA', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'SV', 'GT', 'GY', 'HT', 'HN', 'JM', 'MX', 'NI', 'PA', 'PY', 'PE', 'SR', 'TT', 'US', 'UY', 'VE', 'BS'],
  OC: ['AU', 'NZ', 'FJ', 'PG', 'SB', 'VU', 'WS', 'TO'],
}

/**
 * A dateline's region, or `null` where there is no usable coordinate.
 *
 * `null` rather than `'unknown'`, because "we hold no coordinate for this
 * story" and "this story is somewhere we have no box for" are different facts
 * and the second one already has a name (`GL`). Callers tallying into a chart
 * apply their own `?? 'unknown'` label.
 */
export function regionFromCoords(lat, lng) {
  if (lat == null || lng == null) return null
  const y = Number(lat)
  const x = Number(lng)
  if (Number.isNaN(y) || Number.isNaN(x)) return null
  if (y > 15 && y < 45 && x > 25 && x < 75) return 'ME' // Middle East + Central Asia
  if (y > -10 && y < 55 && x > 60 && x < 150) return 'AS' // Asia-Pacific
  if (y > -40 && y < 40 && x > -20 && x < 55) return 'AF' // Africa
  if (y > 35 && y < 72 && x > -25 && x < 60) return 'EU' // Europe
  if (y > -60 && y < 75 && x > -170 && x < -30) return 'AM' // Americas
  if (y > -50 && y < -10 && x > 110 && x < 180) return 'OC' // Oceania
  return 'GL'
}
