// Where the news is, as places rather than as pixels.
//
// The map used to aggregate stories with supercluster: `clusterRadius: 30` in
// screen pixels, which at the world-fit zoom the map opens at is about nine
// degrees of longitude. Measured against a real payload that put **92% of the
// corpus (646 of 705 stories) inside a merged disc**, and the largest of them
// read `116` — 16.5% of everything — standing at a coordinate no story holds,
// merging Washington, New York, Atlanta, Indianapolis and 23 more labels. One
// merged London with Paris, Brussels and Geneva. One merged Gaza with Cairo,
// Beirut and Damascus.
//
// A count is precise about a quantity and wrong about a place. That is the whole
// argument for this module: every aggregation across cities invents a
// coordinate, and this is a map. A numeral is only honest standing at a place
// that exists.
//
// It also could not be escaped. `expandCluster` offered a descent, but the
// coordinates in this corpus are city-level — 353 distinct lat/lng are really
// ~300 places carrying 1–2 km of jitter, and 63% of stories share their exact
// coordinate with another — so **coincident stories never separate at any
// zoom**. The gesture the disc offered was one it could not deliver.
//
// Pure, DOM-free and free of any MapLibre import, so `map-geo.test.js` can
// bundle it with esbuild and pin the arithmetic. That matters: every expression
// the cluster design was built from lived in `situation-map.ts`, which that
// suite deliberately does not bundle, so none of it was ever tested.

import { CONTESTED_D, decayAt } from './types'
import type { MapPoint } from './types'

/** One place, and everything drawn there. */
export interface StoryPlace {
  /** Stable across frames, so a card can survive a refresh. */
  key: string
  /** As the story datelined it — already through `displayLocation`, so Yafa. */
  loc: string
  /** A coordinate a story in this place actually claims. Never a centroid. */
  lat: number
  lng: number
  count: number
  /**
   * The freshest decay alpha here — what the field weights by, and what fades a
   * place of week-old stories back from one that formed this morning.
   */
  amax: number
  contested: boolean
  /** Newest first, which is the order the place card lists them in. */
  slugs: string[]
}

/** Resolved once per payload: which place each story belongs to, and where. */
export interface PlaceIndex {
  /** slug → place key. A story's place cannot change, so this is computed once. */
  of: Map<string, string>
  at: Map<string, { loc: string; lat: number; lng: number }>
}

/**
 * How far apart two stories sharing a dateline must be to be two places.
 *
 * A grid was the obvious way to absorb the jitter and it is the wrong one,
 * because a grid has boundaries: a place sitting near one splits under 2 km of
 * noise into two Washingtons of 31 each, silently, and the failure looks exactly
 * like the truth. Grouping by name and then splitting on distance cannot invent
 * a split — it can only ever find one that is really there.
 *
 * And there really is one. **`La Paz` appears twice in this corpus, 4,511 km
 * apart** — Bolivia and Mexico. 120 km is far wider than any metropolitan
 * spread the wires produce and far narrower than that, and the test pins both
 * ends.
 */
export const PLACE_SPLIT_KM = 120

/**
 * How close two stories must be to be one place whatever the wires called them.
 *
 * The dateline alone is not a key, and the corpus says so: **eight coordinates
 * carry two spellings each** — `New Delhi`/`Delhi`, `New York`/`New York City`,
 * `Sana'a`/`Sanaa`, `Gaza`/`Gaza City`, `Odessa`/`Odesa`, `Jizan`/`Jazan` — and
 * every one of those pairs is at a *byte-identical* lat/lng. Keyed on the name
 * they become two place features on one pixel, each with its own numeral: the
 * exact overlap this module exists to remove, reintroduced by the key.
 *
 * So proximity merges too. But it has to stay **tight**, and that is the whole
 * judgement: a radius wide enough to be comfortable is a radius that fuses
 * Ramallah into Al-Quds (15 km) and Bethlehem into Al-Quds (9 km), which are
 * different cities with different stories and, on this map, different peoples'.
 * The observed collisions are all at zero distance, so 5 km is already
 * generous — it absorbs a spelling variant that also drifted a little, and it
 * cannot reach the nearest pair this site must keep apart.
 *
 * The proper fix is upstream, in `displayLocation`: these are wire spellings we
 * should be canonicalising. Until then the merge is here, where it is at least
 * measured and tested.
 */
export const PLACE_SAME_KM = 5

/**
 * What one story contributes to the density field before the ramp sees it.
 *
 * This is the calibration, and it has to be arithmetic rather than taste because
 * a heatmap shader cannot take a logarithm: `heatmap-weight` is evaluated
 * per feature and the accumulation is a plain sum, so the compression has to be
 * baked into the weight.
 *
 * Story counts per place are long-tailed — measured over the 14-day window:
 * `{1:208, 2:42, 3:15, 4:10, 5:6, 6:3, 7:3, 8:3, 10:1, 11:2, 15:2, 20:1, 23:1,
 * 28:1, 40:1, 62:1}`. A linear weight either saturates Washington across half a
 * continent (which is the gold blob, in greyscale) or leaves a two-story place
 * under the ramp's toe. `sqrt` is the standard cartographic compression for
 * point magnitude and it is the same reasoning `METRICS[key].scale` already
 * applies to the land — log for counts and long-tailed rates. It takes the range
 * 1..62 to 1..7.87.
 *
 * See `placeDensity` for what these weights actually come out as.
 */
export const placeWeight = (count: number, amax: number): number =>
  amax * Math.sqrt(Math.max(0, count))

/**
 * MapLibre's own heatmap kernel coefficient.
 *
 * Not a constant of ours, and the reason it is written down is that leaving it
 * out silently costs a factor of 2.5. The fragment shader is
 *
 *     float d = -0.5 * 3.0 * 3.0 * dot(v_extrude, v_extrude);
 *     float val = weight * u_intensity * GAUSS_COEF * exp(d);
 *
 * so the density accumulated at a kernel's centre is `weight × intensity ×
 * 0.3989`, not `weight × intensity`. Calibrating against the product without it
 * puts every figure 60% low — a field whose busiest place on earth sits barely
 * past the ramp's first visible stop, which renders as a map with no field on it
 * and nothing anywhere reporting a problem.
 *
 * `exp(-4.5 · (d/r)²)` also means the kernel is tight: at the full
 * `heatmap-radius` a point contributes 1.1% of its peak, so the radius has to be
 * read as "where this fades out", not "how big the patch looks".
 */
export const GAUSS_COEF = 0.3989422804014327

/**
 * The field's base multiplier, handed to `heatmap-intensity`.
 *
 * Deliberately **fixed**, not rescaled to the visible set the way the cluster
 * domain was. That rescale was right for what it governed: a disc's radius, rim
 * weight and label size only ever *rank* marks within one view, and nobody reads
 * a disc radius as an absolute rate. A density field over geography is read as an
 * absolute — brighter means more news, full stop — so rescaling it per range
 * would draw a 5-story Washington at 24h identically to a 62-story one at 14d.
 * That is the "same numeral, two different facts" objection that made
 * `population` the default ground metric, one layer down.
 *
 * The consequence is that a quiet day looks quiet, which is the honest picture.
 * The 24-hour view was fixed by giving the beacons presence and by opening on
 * 3d, not by inflating a wash.
 *
 * Chosen so a one-story place lands at exactly 0.085 — just under
 * `DENSITY_STOPS`' 0.10 toe, so a lone story raises no field at all.
 */
export const DENSITY_INTENSITY = 0.085 / GAUSS_COEF

/**
 * What a place actually contributes at its own centre, in `heatmap-density`.
 *
 * The number the ramp is read against, so the table in `DENSITY_STOPS` and the
 * tests are talking about the same quantity the shader is. Kernels **sum**, so a
 * region of medium places reaches further up the ramp than any of them alone —
 * which is the extent reading the whole layer exists for.
 *
 * Measured across the 14-day window: 1 story → 0.085 (invisible, under the toe),
 * 2 → 0.120, 3 → 0.147, 5 → 0.190, 10 → 0.269, 20 → 0.380, 40 → 0.538, and
 * Washington's 62 → 0.669. London + Paris + Brussels, whose kernels overlap at
 * world zoom, reach about 0.98. Nothing clips.
 *
 * `@knipignore` because the six assertions that pin those figures live in
 * `map-geo.test.js`, which reaches this through the esbuild bundle
 * `scripts/lib/island-bundle.js` builds at run time — a string path, not an
 * import edge, so an export analyser sees nothing and calls it dead.
 *
 * @knipignore
 */
export const placeDensity = (count: number, amax = 1): number =>
  placeWeight(count, amax) * DENSITY_INTENSITY * GAUSS_COEF

const EARTH_KM = 6371

/** Great-circle distance, for the one comparison that needs to be real. */
const haversineKm = (
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number => {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLng = (bLng - aLng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** A story with no dateline falls back to its own rounded coordinate. */
const nameOf = (p: MapPoint): string =>
  p.loc?.trim() || `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`

/**
 * Group the payload into places.
 *
 * Runs once per data load, not per frame — a story's place is a fact about the
 * story. Group by dateline, then walk each name's points assigning each to the
 * first sub-group within `PLACE_SPLIT_KM` of that sub-group's anchor, opening a
 * new one otherwise. O(n·k) with k the number of distinct places sharing a name,
 * which is 1 everywhere in this corpus except `La Paz`.
 *
 * The coordinate is the **modal** one, ties broken by the newest story, and that
 * choice is the thesis in the data model: a median or a centroid of 17 jittered
 * Washingtons is an invented coordinate, which is precisely what the cluster disc
 * was wrong for. The mode is a coordinate some story actually claims.
 */
export const buildPlaceIndex = (points: MapPoint[]): PlaceIndex => {
  const n = points.length
  const parent = new Int32Array(n).map((_, i) => i)
  const find = (i: number): number => {
    let r = i
    while (parent[r] !== r) r = parent[r]
    while (parent[i] !== r) {
      const next = parent[i]
      parent[i] = r
      i = next
    }
    return r
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }

  // Relation 1 — the same dateline, close enough to be the same city. This is
  // what absorbs Washington's 17 coordinates and what refuses to merge the two
  // La Pazes.
  const byName = new Map<string, number[]>()
  points.forEach((p, i) => {
    const name = nameOf(p)
    const bucket = byName.get(name)
    if (bucket) bucket.push(i)
    else byName.set(name, [i])
  })
  for (const idx of byName.values()) {
    for (let a = 0; a < idx.length; a++) {
      for (let b = a + 1; b < idx.length; b++) {
        const p = points[idx[a]]
        const q = points[idx[b]]
        if (haversineKm(p.lat, p.lng, q.lat, q.lng) <= PLACE_SPLIT_KM) union(idx[a], idx[b])
      }
    }
  }

  // Relation 2 — near-identical coordinates, whatever the wires called them.
  // Bucketed on a 0.1° grid (~11 km) and checked against the 3x3 neighbourhood,
  // so this stays linear rather than comparing all 705 points pairwise.
  const CELL = 0.1
  const cellKey = (lat: number, lng: number) =>
    `${Math.round(lat / CELL)},${Math.round(lng / CELL)}`
  const grid = new Map<string, number[]>()
  points.forEach((p, i) => {
    const k = cellKey(p.lat, p.lng)
    const bucket = grid.get(k)
    if (bucket) bucket.push(i)
    else grid.set(k, [i])
  })
  points.forEach((p, i) => {
    const cy = Math.round(p.lat / CELL)
    const cx = Math.round(p.lng / CELL)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of grid.get(`${cy + dy},${cx + dx}`) ?? []) {
          if (j <= i) continue
          const q = points[j]
          if (haversineKm(p.lat, p.lng, q.lat, q.lng) <= PLACE_SAME_KM) union(i, j)
        }
      }
    }
  })

  // Collect, then resolve each group's name and coordinate by mode.
  const groups = new Map<number, number[]>()
  points.forEach((_, i) => {
    const r = find(i)
    const bucket = groups.get(r)
    if (bucket) bucket.push(i)
    else groups.set(r, [i])
  })

  const resolved: Array<{ loc: string; lat: number; lng: number; members: number[] }> = []
  for (const members of groups.values()) {
    // Modal coordinate, ties to the newest story. Not a centroid or a median:
    // the whole argument against the cluster disc was that it stood at a
    // coordinate no story held, and an average of 17 jittered Washingtons is
    // exactly such a coordinate. The mode is one a story actually claims.
    const coords = new Map<string, { n: number; newest: number; i: number }>()
    // Modal dateline, same rule — so `New Delhi` (20 stories) names the place
    // rather than the stray `Delhi` sharing its pixel.
    const names = new Map<string, { n: number; newest: number }>()
    for (const i of members) {
      const p = points[i]
      const ck = `${p.lat},${p.lng}`
      const c = coords.get(ck)
      if (c) {
        c.n += 1
        if (p.t > c.newest) {
          c.newest = p.t
          c.i = i
        }
      } else coords.set(ck, { n: 1, newest: p.t, i })
      const nm = nameOf(p)
      const s = names.get(nm)
      if (s) {
        s.n += 1
        s.newest = Math.max(s.newest, p.t)
      } else names.set(nm, { n: 1, newest: p.t })
    }
    let bestCoord: { n: number; newest: number; i: number } | null = null
    for (const c of coords.values()) {
      if (!bestCoord || c.n > bestCoord.n || (c.n === bestCoord.n && c.newest > bestCoord.newest)) {
        bestCoord = c
      }
    }
    let bestName = ''
    let bestNameScore = { n: -1, newest: -1 }
    for (const [nm, s] of names) {
      if (s.n > bestNameScore.n || (s.n === bestNameScore.n && s.newest > bestNameScore.newest)) {
        bestName = nm
        bestNameScore = s
      }
    }
    const anchor = points[bestCoord ? bestCoord.i : members[0]]
    resolved.push({ loc: bestName, lat: anchor.lat, lng: anchor.lng, members })
  }

  // Sorted so a name holding two places suffixes them deterministically, rather
  // than by whatever order the union-find happened to produce.
  resolved.sort((a, b) => a.loc.localeCompare(b.loc) || a.lat - b.lat || a.lng - b.lng)

  const nameCount = new Map<string, number>()
  for (const g of resolved) nameCount.set(g.loc, (nameCount.get(g.loc) ?? 0) + 1)

  const of = new Map<string, string>()
  const at = new Map<string, { loc: string; lat: number; lng: number }>()
  const seen = new Map<string, number>()
  for (const g of resolved) {
    let key = g.loc
    if ((nameCount.get(g.loc) ?? 0) > 1) {
      const i = seen.get(g.loc) ?? 0
      seen.set(g.loc, i + 1)
      key = `${g.loc}#${i}`
    }
    at.set(key, { loc: g.loc, lat: g.lat, lng: g.lng })
    for (const i of g.members) of.set(points[i].slug, key)
  }

  return { of, at }
}

/**
 * Count the visible slice into places.
 *
 * One O(n) pass with no distance arithmetic — every join was resolved by
 * `buildPlaceIndex`, so scrubbing costs a walk and a few map lookups where it
 * used to rebuild a supercluster KD-tree per frame.
 *
 * Returns **every** place, singletons included. The ramp's toe decides what the
 * field shows and the `text-field` threshold decides what carries a numeral; a
 * layer `filter` would delete the feature that raises the wash, which is the
 * mistake the market layer's own comment warns about.
 */
export const countPlaces = (
  index: PlaceIndex,
  visible: MapPoint[],
  now: number,
): StoryPlace[] => {
  const acc = new Map<string, StoryPlace>()
  // Sorted explicitly rather than inherited from the caller. `/api/map.json` is
  // ascending by `t` and `visiblePoints` preserves that, so reading the order off
  // the input would give the card its stories oldest-first — and would break the
  // day someone sorts the payload differently, in a place nothing looks at.
  const times = new Map<string, number>()
  for (const p of visible) {
    const key = index.of.get(p.slug)
    if (!key) continue
    const where = index.at.get(key)
    if (!where) continue
    times.set(p.slug, p.t)
    const a = decayAt(p.t, now)
    const hit = acc.get(key)
    if (hit) {
      hit.count += 1
      if (a > hit.amax) hit.amax = a
      if ((p.d ?? 0) >= CONTESTED_D) hit.contested = true
      hit.slugs.push(p.slug)
    } else {
      acc.set(key, {
        key,
        loc: where.loc,
        lat: where.lat,
        lng: where.lng,
        count: 1,
        amax: a,
        contested: (p.d ?? 0) >= CONTESTED_D,
        slugs: [p.slug],
      })
    }
  }
  for (const place of acc.values()) {
    if (place.count > 1) {
      place.slugs.sort((a, b) => (times.get(b) ?? 0) - (times.get(a) ?? 0))
    }
  }
  return [...acc.values()]
}
