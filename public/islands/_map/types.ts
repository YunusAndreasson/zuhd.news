// Shapes of the four feeds the map draws, and the one curve they all age on.
//
// These used to live next to the canvas renderer that consumed them. MapLibre
// replaced that renderer, but the payloads are unchanged — they are the build's
// published output — so the types outlived the drawing code and belong on their
// own rather than inside whichever module happens to read them.
//
// The three overlay feeds are *not* declared here. `/api/gdacs.json`,
// `/api/chokepoints.json` and `/api/conflict.json` are the same blobs the app
// reads, and `shared/types.ts` already describes them in full — down to the
// `${eventtype}:${eventid}` keying of the GDACS detail map and the units on
// `maxWave24hM`. What used to sit here was a hand-narrowed copy: it declared
// ten of GdacsAlert's nineteen fields and omitted `severityValue`, which is the
// number that tells an M6.2 from an M4.5. Re-exporting the real types means the
// map can only fall behind the payload if the payload's own type does.
export type {
  Chokepoint,
  ChokepointCounts,
  ChokepointWeather,
  ConflictEvent,
  GdacsAlert,
  GdacsDetail,
  GdacsEventType,
  VesselField,
} from '@shared/types'

import type { Chokepoint } from '@shared/types'

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

/**
 * A chokepoint as *this* endpoint serves it.
 *
 * `scripts/build.js` enriches the shared snapshot with matching zuhd coverage
 * before writing `/api/chokepoints.json`, so the web payload is a superset of
 * the one the app reads. The extra field lives here rather than in `shared/`
 * because only the web build produces it.
 */
export interface MapChokepoint extends Chokepoint {
  relatedArticles?: Array<{
    slug: string
    title: string
    date?: string
    dateFormatted?: string
  }>
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

/**
 * Where a beacon's ring turns on: the sentiment spread across the outlets
 * covering a story.
 *
 * Lives here rather than in the island because both the canvas (which draws
 * the ring) and the story card (which has to explain it) need the same
 * threshold, and a ring that appears without the card accounting for it is
 * the map asking a question it then refuses to answer.
 */
export const CONTESTED_D = 0.35
