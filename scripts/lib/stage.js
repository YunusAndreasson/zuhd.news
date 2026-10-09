// What every stage does around its own work.
//
// A stage script ran on import, exported nothing, and decided for itself how
// to say what had happened: the shell script that ran the cycle acted on the
// exit status of four of the thirty-nine it ran and read the rest out of their
// prose. With
//
//     export async function main() { … return { counts: { kept, dropped } } }
//     await runStage(import.meta, 'merge-feeds', main)
//
// the file can be imported by a test without running, and each run leaves one
// line of JSON saying how it went, where an orchestrator can read it.
//
// `runStage` prints nothing. Several stages' stdout is somebody's input (the
// coverage map goes into the selector's prompt, the metrics into the tuner's
// file) and a line added here would be a line added there.

import { appendFileSync, realpathSync } from 'node:fs'

/**
 * What a stage's `main` may return. Anything else it has to say, it prints.
 *
 * @typedef {object} StageOutcome
 * @property {Record<string, number>} [counts]
 * @property {{ slug: string, reason: string }[]} [dropped]
 * @property {{ slug: string, reason: string }[]} [flagged]
 * @property {string} [skipped] why it did nothing
 * @property {string} [degraded] why it kept the last good output
 */

/**
 * Whether the module that owns `meta` is the script node was started with.
 * By path, not `import.meta.main`, which this Node still marks experimental.
 *
 * @param {{ filename?: string }} meta
 */
function isMain(meta) {
  try {
    return Boolean(meta.filename && process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(/** @type {string} */ (meta.filename))
  } catch {
    return false
  }
}

/**
 * Append one result line to the file `$ZUHD_STAGE_RESULT` names. No variable,
 * no line: a stage run by hand behaves exactly as it did. A result that cannot
 * be written is never the stage's failure.
 *
 * @param {import('./schema.js').StageResult} result
 */
function report(result) {
  const path = process.env.ZUHD_STAGE_RESULT
  if (!path) return
  try {
    appendFileSync(path, `${JSON.stringify(result)}\n`)
  } catch {
    /* the stage's own work is what matters */
  }
}

/**
 * Run `main` if this file is the script that was started, and report how it
 * went. Imported from anywhere else, it does nothing.
 *
 * A throw is reported and then thrown again, so node prints it and exits 1
 * exactly as it would have. A `process.exit()` inside `main` is reported too,
 * from its status: an old habit in these scripts, and no reason to lose the
 * line.
 *
 * @param {{ filename?: string }} meta the stage module's own `import.meta`
 * @param {string} name
 * @param {() => StageOutcome | void | Promise<StageOutcome | void>} main
 */
export async function runStage(meta, name, main) {
  if (!isMain(meta)) return
  const started = Date.now()
  let reported = false
  /** @param {Partial<import('./schema.js').StageResult>} rest */
  const finish = (rest) => {
    if (reported) return
    reported = true
    report({
      stage: name,
      at: new Date().toISOString(),
      status: 'ok',
      seconds: Math.round((Date.now() - started) / 100) / 10,
      ...rest,
    })
  }
  process.once('exit', (code) => finish(code === 0 ? {} : { status: 'failed', error: `exit ${code}` }))
  try {
    const outcome = /** @type {StageOutcome} */ ((await main()) ?? {})
    finish({ ...outcome, status: outcome.skipped ? 'skipped' : 'ok' })
  } catch (err) {
    finish({ status: 'failed', error: /** @type {Error} */ (err)?.message ?? String(err) })
    throw err
  }
}
