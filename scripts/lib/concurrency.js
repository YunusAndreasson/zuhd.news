// A bounded worker pool, for the fetch stages that make one request per item.
//
// Four byte-identical copies of this — `fetch-firms.js`, `fetch-gdacs.js`,
// `fetch-ipc.js`, `narrate-gdacs.js` — each hoisted to the bottom of a
// top-level-await script. Nothing about it is specific to any of them.

/**
 * Run `worker` over `items`, at most `limit` at a time.
 *
 * The pool is `limit` runners pulling from a shared queue rather than
 * `limit`-sized batches: a batch runs at the speed of its slowest member and
 * these are HTTP requests, where one slow response holds up everything behind
 * it. Order of completion is therefore not the order of `items`, and it
 * resolves to nothing: a caller that keeps what its workers return wants
 * `runSettled` below, which hands the results back in the order of `items`.
 *
 * Rejections propagate: `Promise.all` settles on the first one, and the
 * remaining runners keep draining the queue in the background. A caller that
 * must not lose a whole stage to one bad response catches inside `worker`, or
 * uses `runSettled`, which does.
 *
 * **The pool only overlaps work that yields.** A worker that calls `spawnSync`
 * blocks the event loop, and the pool silently runs one at a time — which is
 * how every narrator's "3 in parallel" was serial until 2026-09-25. Spawn with
 * `spawnClaude` (`claude-envelope.js`), never `spawnSync`, inside a worker.
 *
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<unknown>} worker
 */
export async function runWithConcurrency(items, limit, worker) {
  // A shared cursor rather than `queue.shift()`: shift is O(n) per call, and
  // it also stopped a runner at an `undefined` item rather than passing it on.
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++])
  })
  await Promise.all(runners)
}

/**
 * Run `worker` over `items`, at most `limit` at a time, and hand back what
 * each came to, in the order of `items`.
 *
 * For a fetcher that asks a source once per item and can lose some: a detail
 * per alert, a file per country, a box per cell. Three of them had the same
 * block written out, a `try` in the worker, a count, and the first message
 * caught, and all three kept the results in the order the answers arrived.
 * Two pushed onto an array and the third filled an object key by key, and an
 * object's keys serialise in the order they were set. A snapshot's bytes then
 * followed the network: the build holds a published file's stamp still only
 * while its bytes are (`stable-stamp.js`), and on 2026-10-09 not one of the 23
 * keys of the disaster snapshot's `details` was where its alert was.
 *
 * `values[i]` is what `worker(items[i])` resolved to, and `errors[i]` what it
 * threw: exactly one of the two is set for each item. `firstError` is the
 * message of the earliest failure by position, not by the clock, so the line
 * a fetcher logs does not depend on which answer was slowest either.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R> | R} worker
 * @returns {Promise<{ values: (R | undefined)[], errors: unknown[], failed: number, firstError: string | null }>}
 */
export async function runSettled(items, limit, worker) {
  /** @type {(R | undefined)[]} */
  const values = new Array(items.length).fill(undefined)
  /** @type {unknown[]} */
  const errors = new Array(items.length).fill(undefined)
  let failed = 0
  const indexed = items.map((item, index) => ({ item, index }))
  await runWithConcurrency(indexed, limit, async ({ item, index }) => {
    try {
      values[index] = await worker(item, index)
    } catch (err) {
      // `undefined` thrown would read as a success; nothing here throws it,
      // and a slot that says so keeps the two arrays honest.
      errors[index] = err ?? new Error('threw nothing')
      failed++
    }
  })
  const first = errors.find((err) => err !== undefined)
  const message = first instanceof Error ? first.message : String(first)
  return { values, errors, failed, firstError: first === undefined ? null : message }
}
