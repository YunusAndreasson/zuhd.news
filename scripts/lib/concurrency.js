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
