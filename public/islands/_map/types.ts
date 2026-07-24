// Shapes of the four feeds the map draws, and the one curve they all age on.
//
// These used to live next to the canvas renderer that consumed them. MapLibre
// replaced that renderer, but the payloads are unchanged — they are the build's
// published output — so the types outlived the drawing code and belong on their
// own rather than inside whichever module happens to read them.

/** A story from `/api/map.json`. */
export interface MapPoint {
  lat: number
  lng: number
  /** Event time in ms — when the thing happened, not when we published. */
  t: number
  /** Raw eventCoverage. Kept for display; `w` is what drives the radius. */
  c: number
  cat: string
  slug: string
  title: string
  loc: string
  /** Number of sources the article cites. */
  n: number
  /**
   * Coverage as a 0..1 percentile rank across the window, computed at build
   * time. Absent when the story carries no coverage figure at all — which is
   * different from carrying a low one, and the map renders it differently.
   */
  w?: number
  /** Sentiment spread across the outlets covering the story, 0..~1. */
  d?: number
}

/** A GDACS disaster alert from `/api/gdacs.json`. */
export interface GdacsAlert {
  eventid: string
  eventtype: string
  alertlevel: string
  name: string
  country: string
  lat: number
  lng: number
  fromDate: string
  severityText?: string
  reportUrl?: string
  narrative?: string
}

/** A maritime chokepoint from `/api/chokepoints.json`. */
export interface Chokepoint {
  id: string
  name: string
  blurb: string
  lat: number
  lng: number
  primaryField: string
  delta7vs90?: Record<string, number>
  relatedArticles?: Array<{ slug: string; title: string }>
}

/** A UCDP conflict event from `/api/conflict.json`. */
export interface ConflictEvent {
  id: string
  eventDate: string
  family: string
  subEvent: string
  actor1: string
  actor2?: string
  country: string
  location: string
  lat: number
  lng: number
  fatalities: number
  notes?: string
  conflictName?: string
  region?: string
  numSources?: number
}

/**
 * Story decay, as a half-life in hours.
 *
 * The canvas map used 18 hours, borrowed from the mobile globe, where the
 * window is 72 hours. Over this map's 14-day window that curve is far too
 * steep: it puts 85% of the corpus below 2% weight, so almost every beacon
 * bottoms out at the alpha floor and the recency channel collapses to
 * "today" versus "not today". A 72-hour half-life spends the visible range on
 * the window it actually has — a day-old story still reads as clearly hotter
 * than a week-old one — while two weeks still fades to an ember.
 */
export const DECAY_HALF_LIFE_HOURS = 72
export const DECAY_LAMBDA = Math.LN2 / DECAY_HALF_LIFE_HOURS

export const decayAt = (t: number, now: number) => {
  const ageHours = Math.max(0, (now - t) / 3_600_000)
  return Math.exp(-DECAY_LAMBDA * ageHours)
}
