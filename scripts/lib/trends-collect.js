// The trends snapshot's rows: each source asked in turn, and what is done
// about one that does not answer.
//
// This was the body of `fetch-trends.js`, a loop at the top level of a script,
// so nothing about it could be tested: not the order of the rows, not which
// rows are carried from the previous snapshot (`trends-carry.js`), and not
// what one source's failure costs the others. The sources and the registry
// are parameters, so a test hands it its own.

import { carriedRow } from './trends-carry.js'

/** @typedef {import('./trends-registry.js').SourceDef} SourceDef */
/**
 * A registry row as this reads it: `source` is whichever key of `sources` it
 * belongs to, which a test's own sources need not be the registry's seven.
 * @typedef {Omit<import('./trends-registry.js').IndicatorDef, 'source'> & { source: string }} RegistryRow
 */

/**
 * Merge a fetched series into its registry entry, producing a snapshot row.
 *
 * The series says where it is from when that is not where the registry
 * pointed: a futures row answered by its fallback (`trends-sources/futures.js`)
 * is that other series, and is published under its `source`, `seriesId` and
 * source line, not the contract's.
 *
 * A row that declares `decimals` is rounded to them here: FRED's year on year
 * of the CPI comes back as `3.35302`, and the Bureau publishes `3.4`.
 *
 * @param {RegistryRow} ind
 * @param {any} data
 */
function buildIndicatorEntry(ind, data) {
  const places = ind.decimals
  const values = typeof places === 'number' ? data.values.map((/** @type {number} */ v) => Number(v.toFixed(places))) : data.values
  return {
    id: ind.id,
    label: ind.label,
    unit: ind.unit,
    source: data.source ?? ind.source,
    seriesId: data.seriesId ?? ind.seriesId,
    ...(ind.field ? { field: ind.field } : {}),
    cadence: ind.cadence,
    ...(typeof places === 'number' ? { decimals: places } : {}),
    topicTags: ind.topicTags,
    countryTags: ind.countryTags || [],
    defaultHighlight: ind.defaultHighlight || 'last',
    sourceLabel: data.sourceLabel ?? ind.sourceLabel,
    values,
    periods: data.periods,
    ...(data.dates ? { dates: data.dates, completed: data.completed } : {}),
    asOf: data.asOf,
  }
}

/**
 * Ask every source, one at a time and in the order given, and return the rows.
 *
 * Generic dispatch: each source declares its mode in `trends-registry.js`.
 * Adding a source is one entry in `SOURCES` and its registry rows.
 *
 * **In order, and never at once.** The snapshot's row order is the sources'
 * and then the registry's, and readers lean on it: `offerFor` breaks a tie
 * between two contracts by it.
 *
 * **One source's failure is that source's.** A fetcher catches its own errors
 * and answers null, so a throw that reaches here is a shape it did not
 * expect. Thrown from the loop it took every source's rows with it, fetched
 * or not, because the snapshot is written once, at the end. It is caught per
 * source: the rows it had not answered for fall to the previous snapshot and
 * the next source runs.
 *
 * A registry row with no fresh answer takes the previous snapshot's row where
 * that may stand (`carriedRow`). A batched source is carried only when its
 * call failed: one that answered and left a series out has judged it (the BIS
 * fetcher drops a rate older than its `STALE_DAYS`), and carrying the old row
 * would print as current what it refused. A source skipped for a missing key
 * is carried like a failed one.
 *
 * A source that declares `after` is handed its own rows once they are all in,
 * to settle what one row owes another (`alignSessions`).
 *
 * @param {object} o
 * @param {Record<string, SourceDef>} o.sources
 * @param {RegistryRow[]} o.registry
 * @param {any} o.prior the snapshot being replaced, or none
 * @param {Set<string>} [o.charted] the indicator ids published articles draw as their chart
 * @param {Record<string, string | undefined>} [o.env]
 * @param {string} [o.fxCache] where the batched currency source keeps its history
 * @param {number} [o.now]
 * @param {Pick<Console, 'log' | 'warn' | 'error'>} [o.say]
 * @returns {Promise<{ indicators: any[], carried: any[] }>} the rows in
 *   snapshot order, and those among them that were carried
 */
export async function collectRows({ sources, registry, prior, charted = new Set(), env = process.env, fxCache, now = Date.now(), say = console }) {
  const indicators = []
  const carried = []

  for (const [name, def] of Object.entries(sources)) {
    const matched = registry.filter((i) => i.source === name)
    /** The source's registry rows already answered for: by a fetch, a carry or a refusal. */
    const settled = new Set()
    /** The registry rows this source has put in the snapshot, fetched or carried. */
    const own = []
    const settle = (ind, data) => {
      settled.add(ind.id)
      const row = data ? buildIndicatorEntry(ind, data) : carriedRow(ind, prior, now)
      if (!row) return
      indicators.push(row)
      own.push(row)
      if (!data) carried.push(row)
    }

    try {
      const missingEnv = def.requiredEnv.filter((k) => !env[k])
      if (missingEnv.length > 0) {
        say.warn(`  ⚠ ${name}: missing env ${missingEnv.join(', ')} — skipping`)
        for (const ind of matched) settle(ind, null)
        continue
      }

      if (def.mode === 'dynamic') {
        // "top markets" was printed here for Wikipedia's concepts too.
        say.log(`${name}: rows of its own choosing`)
        // The previous snapshot's rows for this source, so a sticky fetcher
        // can recognise them. A fetcher that ignores the argument (Wikipedia)
        // is unaffected.
        const incumbents = (prior?.indicators ?? []).filter((i) => i?.source === name)
        const results = await def.fetcher({ incumbents, charted })
        if (results) for (const r of results) indicators.push(r)
        continue
      }

      if (matched.length === 0) continue

      if (def.mode === 'perIndicator') {
        say.log(`${name}: ${matched.length} series`)
        const apiKey = def.requiredEnv[0] ? env[def.requiredEnv[0]] : undefined
        for (const ind of matched) {
          settle(ind, apiKey != null ? await def.fetcher(ind, apiKey) : await def.fetcher(ind))
        }
        continue
      }

      if (def.mode === 'batched') {
        say.log(`${name}: ${matched.length} series (batched)`)
        const seriesIds = matched.map((i) => i.seriesId)
        const apiKey = env[def.requiredEnv[0]]
        const map = await def.fetcher(seriesIds, apiKey, fxCache)
        for (const ind of matched) {
          const data = map?.[ind.seriesId]
          if (data || !map) settle(ind, data)
          else settled.add(ind.id)
        }
      }
    } catch (err) {
      say.error(`  ✗ ${name}: ${/** @type {Error} */ (err)?.stack ?? err} — its unanswered rows fall to the previous snapshot`)
      for (const ind of matched) if (!settled.has(ind.id)) settle(ind, null)
    } finally {
      // Last, and over the carried rows too: a row carried beside a fresh one
      // is a session short of it. In `finally`, because the modes above leave
      // by `continue`; and caught, because a throw from here would take every
      // source's rows with it.
      try {
        def.after?.(own)
      } catch (err) {
        say.error(`  ✗ ${name}: ${/** @type {Error} */ (err)?.stack ?? err} — its rows stand as fetched`)
      }
    }
  }

  return { indicators, carried }
}
