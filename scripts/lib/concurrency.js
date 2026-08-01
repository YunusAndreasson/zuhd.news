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
 * it. Order of completion is therefore not the order of `items` — every caller
 * here collects into a keyed structure, not by push order.
 *
 * Rejections propagate: `Promise.all` settles on the first one, and the
 * remaining runners keep draining the queue in the background. Callers that
 * must not lose a whole stage to one bad response catch inside `worker`, which
 * all four of them do.
 *
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<unknown>} worker
 */
export async function runWithConcurrency(items, limit, worker) {
  const queue = items.slice()
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift()
      if (next === undefined) return
      await worker(next)
    }
  })
  await Promise.all(runners)
}
