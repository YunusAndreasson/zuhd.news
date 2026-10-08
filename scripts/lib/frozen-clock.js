// Loaded ahead of a stage by the replay (`node --import`, `lib/stage-replay.js`):
// `Date.now()` and `new Date()` answer the one moment `$ZUHD_FROZEN_NOW` names.
//
// A stage stamps what it writes and cuts its windows from the clock, so two
// runs of the same code on the same inputs differ unless the clock is held
// still, and a run of old code against new could not be compared at all.
// `new Date(value)` is untouched; only "now" is fixed.

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
