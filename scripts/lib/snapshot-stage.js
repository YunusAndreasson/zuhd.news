// What every snapshot fetcher does around its own fetch.
//
// Nine of them, and each wrote the same things out for itself: the path of its
// snapshot, a read of the last one, whether that one is fresh enough to stand,
// the atomic write, and the sentence it leaves when it keeps the last snapshot
// instead. A dozen of those sentences, no two alike, every one followed by
// `process.exit(0)`. Three things came of each fetcher keeping the rules by
// hand:
//
// - **Three did not keep the one that matters.** `cycle.md`: "Degrade to the
//   previous snapshot, never to nothing". The disaster, conflict and outage
//   fetchers wrote an empty result over a good snapshot and logged success.
//   Here the write will not happen without the fetcher saying what empty means
//   for it (`isEmpty` is required), so the rule is the shape of the call and
//   not a habit.
// - **A kept snapshot was invisible.** The exit status is 0 either way, and
//   the dashboard counts a stage's complaints by the form `✗ name: message`
//   (`MARK`, `lib/cycle-log.js`). "✗ no usable exchange data returned — …" has
//   no name in it and was never counted. There is one line now, in that form,
//   and it says which snapshot is being kept: a line that reads the same on
//   its fortieth day as on its first is how the conflict layer stood still for
//   a week in August.
// - **Two freshness gates, two ways.** One read `fetched` through `readJson`
//   and refused a stamp from the future; the other parsed the file by hand and
//   did not.
//
// What it leaves alone is everything that differs: how a source is asked, what
// a partial answer is worth, what is counted and logged. That is `produce`,
// and it is the fetcher's.
//
// Exit statuses are what they were. A fetcher's expected failures are thrown
// as `Degrade` and end in the line and a normal return, which is the exit 0 its
// `process.exit(0)` was. Anything else `produce` throws is a bug and is thrown
// on, which is the exit 1 it always was: a fetcher that swallowed its own
// TypeError would be keeping snapshots for a reason nobody could read.

import { pathOf } from './datasets.js'
import { readJson, writeJson } from './json-file.js'

/**
 * Thrown by a fetcher to keep the last snapshot. The message is the reason,
 * written for the log: what was asked, and what came back.
 */
export class Degrade extends Error {}

/**
 * Thrown by a fetcher that has nothing to do and nothing wrong: a key that is
 * not set. `cycle.md`: "a missing key logs a skip".
 */
export class Skip extends Error {}

/**
 * @typedef {object} SnapshotOptions
 * @property {(snapshot: any) => boolean} isEmpty what "nothing came back" is
 *   for this source. Required, because there is no safe default: a list of
 *   alerts with none in it is a changed response, and a day with no fire beside
 *   a story is a true empty layer (`() => false`, said out loud).
 * @property {boolean} [pretty] indented, for a file a person diffs; `writeJson`'s default
 * @property {number} [freshFor] milliseconds the last snapshot stands for before the source is asked again
 * @property {string} [freshBy] the stamp inside the snapshot the gate reads; `generated`.
 *   Never the file's mtime: the cycle pulls with `--autostash`, which rewrites it.
 * @property {(previous: any) => boolean} [freshIf] what else must hold for the last
 *   snapshot to stand, such as the release it was read from still being the one pinned
 * @property {boolean} [force] ask whatever the last snapshot's age
 * @property {string} [path] in place of the dataset's own path: a test's
 * @property {number} [now] epoch ms; the clock's when absent
 */

/**
 * @typedef {object} SnapshotResult
 * @property {boolean} written
 * @property {any} [snapshot] what was written
 * @property {any} previous the snapshot that was there, or null
 * @property {string} [skipped] why nothing was asked
 * @property {string} [degraded] why the last snapshot was kept
 */

/**
 * Fetch one snapshot: read the last, ask `produce` for the next, and write it
 * or keep the last one and say why.
 *
 * The result is a `StageOutcome` (`lib/stage.js`) with the snapshot beside it,
 * so a fetcher's `main` can hand it straight back once it has one.
 *
 * @param {string} name the stage's, as the log will name it: `fetch-gdacs`
 * @param {string} dataset the snapshot's name in `lib/datasets.js`
 * @param {(context: { previous: any, path: string }) => any} produce the next snapshot, or a throw
 * @param {SnapshotOptions} options
 * @returns {Promise<SnapshotResult>}
 */
export async function snapshotStage(name, dataset, produce, options) {
  const { isEmpty, pretty = true, freshFor, freshBy = 'generated', freshIf, force = false, now = Date.now() } = options ?? {}
  if (typeof isEmpty !== 'function') throw new TypeError(`snapshotStage(${name}): isEmpty is required`)
  const path = options.path ?? pathOf(dataset)
  const previous = readJson(path)

  if (freshFor !== undefined && !force && previous) {
    const age = now - Date.parse(previous[freshBy])
    // A stamp from the future is not a fresh one: it would stand until the
    // clock caught up with it.
    if (age >= 0 && age < freshFor && (freshIf?.(previous) ?? true)) {
      const hours = (ms) => (ms / 3600_000).toFixed(1)
      console.log(`${name}: the snapshot is ${hours(age)}h old, under ${hours(freshFor)}h — keeping it`)
      return { written: false, previous, skipped: 'fresh' }
    }
  }

  const keep = (/** @type {string} */ reason) => {
    const kept = previous ? `keeping the snapshot of ${previous[freshBy] ?? 'an unknown time'}` : 'and there is no snapshot to keep'
    console.error(`  ✗ ${name}: ${reason} — ${kept}`)
    return { written: false, previous, degraded: reason }
  }

  let snapshot
  try {
    snapshot = await produce({ previous, path })
  } catch (err) {
    if (err instanceof Skip) {
      console.log(`${name}: ${err.message} — skipping, previous snapshot kept`)
      return { written: false, previous, skipped: err.message }
    }
    if (err instanceof Degrade) return keep(err.message)
    throw err
  }
  if (isEmpty(snapshot)) return keep('the result is empty')

  writeJson(path, snapshot, { pretty })
  return { written: true, snapshot, previous }
}
