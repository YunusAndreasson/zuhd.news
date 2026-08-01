// `--flag value` off `process.argv`, for the scripts run by name from
// `run-cycle.sh` and by hand from a terminal.
//
// Five copies, under three names: `argAt` in the two posters, `arg` in the
// three perf instruments — the same two lines each time, with the only
// difference being whether the fallback was a parameter or hardcoded
// `undefined`. Nothing here justifies a dependency; it justifies one file.

/**
 * The value after `--name`, or `fallback`.
 *
 * `indexOf` on the raw argv, deliberately: these scripts take a handful of
 * long flags and nothing else, and `node:util`'s `parseArgs` would want every
 * one of them declared up front — which is a config block per script for a
 * parser that also rejects the unknown flags a shell script is free to grow.
 *
 * Only the `--name value` form. `--name=value` is not supported and never was;
 * a caller using it gets `fallback`, silently, as before.
 */
export const argAt = (name, fallback = undefined) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** Whether `--name` was passed at all. */
export const hasFlag = (name) => process.argv.includes(`--${name}`)
