// How long a fetcher gives itself: its stage's deadline, less what it needs
// after the last answer.
//
// The cycle runs each fetcher under `timeout <N>` (`cycle/stages.js`), and
// every request a fetcher makes has a deadline of its own, shorter than N. The
// sum does not. Thirty exchanges at two hosts and ten seconds each is 600
// seconds in a stage of 90; 108 thermal cells four at a time and thirty
// seconds each is 810 in 180; the famine fetch is 435 in 240. On a slow day
// `timeout` kills the stage, the log says `exit: 124` and nothing else, and
// what had arrived by then, which three of these fetchers know how to publish
// as a partial result with its counts, is thrown away with the rest.
//
// So a fetcher takes one signal from here at its start and passes it with
// every request. When it fires, what is in flight is cut and what has not
// begun fails at once; the fetcher gets to the end of its own code inside its
// stage, and either writes what it has, counted, or keeps the last snapshot
// with a line that says why. Never observed in the 41 cycles whose logs are
// kept: the slowest of these stages took 29 seconds.

/**
 * The stage deadlines these fetchers run under, in seconds: the `timeout` of
 * each one's entry in `scripts/cycle/stages.js`. That list is the authority
 * and this is a copy, because a fetcher cannot be handed its deadline (the
 * runner starts it with `timeout`, not with an argument) and importing the
 * stage list here would pull the whole orchestrator into every fetch. The
 * test holds the two together.
 */
export const STAGE_TIMEOUT_SECONDS = {
  'fetch-markets': 90,
  'fetch-companies': 90,
  'fetch-gdacs': 120,
  'fetch-conflict': 120,
  'fetch-firms': 180,
  'fetch-ipc': 240,
  'fetch-analytics': 60,
}

/** Kept back for what follows the last answer: the arithmetic, the write, the last line. */
const KEPT_BACK_MS = 10_000

/**
 * A signal that fires when `stage` has used its time, less `keptBack`.
 *
 * Its timer is not one the process waits on, so a fetcher that finishes early
 * exits when it is done.
 *
 * @param {keyof typeof STAGE_TIMEOUT_SECONDS} stage
 * @param {{ keptBack?: number }} [opts] ms held in reserve; more for a fetcher
 *   whose requests cannot be cut and must be waited out
 * @returns {AbortSignal}
 */
export function stageBudget(stage, { keptBack = KEPT_BACK_MS } = {}) {
  const seconds = STAGE_TIMEOUT_SECONDS[stage]
  if (!seconds) throw new Error(`stageBudget: no stage named "${stage}"`)
  return AbortSignal.timeout(seconds * 1000 - keptBack)
}
