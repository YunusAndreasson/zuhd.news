// Loaded ahead of a stage by the replay (`node --import`, `lib/stage-replay.js`):
// `Date.now()` and `new Date()` answer the one moment `$ZUHD_FROZEN_NOW` names.
//
// A stage stamps what it writes and cuts its windows from the clock, so two
// runs of the same code on the same inputs differ unless the clock is held
// still, and a run of old code against new could not be compared at all.
// `new Date(value)` is untouched; only "now" is fixed.
//
// Chance is held still with it. The block cache re-probes a blocked outlet one
// time in twenty (`lib/block-cache.js`), so a stage that fetches pages rolled
// a die the comparison could lose. `Math.random()` answers from a fixed
// sequence, seeded by the moment.

const at = Date.parse(process.env.ZUHD_FROZEN_NOW ?? '')
if (Number.isNaN(at)) throw new Error('frozen-clock: ZUHD_FROZEN_NOW is not a date')

const RealDate = Date
globalThis.Date = /** @type {DateConstructor} */ (
  /** @type {unknown} */ (
    class extends RealDate {
      /** @param {any[]} args */
      constructor(...args) {
        super(.../** @type {[any]} */ (args.length ? args : [at]))
      }

      static now() {
        return at
      }
    }
  )
)

let seed = at >>> 0
// mulberry32
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
