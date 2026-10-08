// The pipeline's records, each written down once.
//
// A shape here used to be whatever its readers assumed. The run record is the
// first to get a definition because it is new; the records the stages pass
// each other (feed item, selection entry, article frontmatter, ledger story)
// join it as their stages are converted.

/**
 * Bumped when a field changes meaning, so a reader of `logs/cycles.jsonl` can
 * tell the generations apart: the series is append-only and never rewritten.
 */
export const RUN_RECORD_SCHEMA = 1

/**
 * One attempt at a stage.
 *
 * @typedef {object} StageAttempt
 * @property {number | null} exit
 * @property {number | null} seconds
 */

/**
 * A stage as the cycle ran it. `exit` and `seconds` are the last attempt's,
 * which is the one whose output the cycle used; `attempts` is present only
 * when there was more than one.
 *
 * @typedef {object} RunStage
 * @property {string} id `selector`, `source-angles`, `audio-rebuild`
 * @property {number | null} exit null where the cycle prints a duration and no status
 * @property {number | null} seconds null where it prints a status and no duration
 * @property {boolean} retried
 * @property {StageAttempt[]} [attempts]
 */

/**
 * What became of one article the cycle wrote. `unpublished` is written and
 * valid but not deployed: the build or the deploy failed, and the file waits
 * on disk for the next cycle.
 *
 * @typedef {object} RunArticle
 * @property {string} slug
 * @property {'published' | 'quarantined' | 'unpublished'} outcome
 * @property {string} [reason] the validator's, for a quarantined article
 */

/**
 * One cycle. Written to `logs/runs/<id>/run.json` and as one line of
 * `logs/cycles.jsonl`.
 *
 * `source` says where the values came from: `log` is a record read back out of
 * the cycle's own log, `runner` one the orchestrator wrote as it went.
 *
 * @typedef {object} RunRecord
 * @property {number} schema
 * @property {'log' | 'runner'} source
 * @property {string} id the log's stamp, `2026-10-08_1804`
 * @property {string | null} startedAt ISO
 * @property {string | null} finishedAt ISO; null for a cycle that was killed
 * @property {number | null} totalSeconds
 * @property {number | null} exit the script's own status; null when rebuilt from an old log
 * @property {{ daily: boolean, tuning: boolean, weekly: boolean } | null} jobs which scheduled jobs this cycle carried; null when it ended before saying
 * @property {{ head: string | null, scriptsDirty: boolean | null }} git the commit the cycle started from, and whether `scripts/` differed from it
 * @property {string[]} ran the stage numbers whose headers were printed and not skipped
 * @property {RunStage[]} stages
 * @property {{ apiStories: number | null, apiEvents: number | null, rssStories: number | null, multi: number | null, niche: number | null }} feed
 * @property {{ target: number | null, selected: number | null, deduped: number | null, alreadyPublished: number | null, written: number | null, validated: number | null, removed: number | null, published: number | null }} funnel
 * @property {{ sha: string, subject: string }[]} commits
 * @property {{ kind: 'breaking' | 'briefing', slug: string | null, pushed: number | null }[]} pushes
 * @property {number | null} newsApiTokens
 * @property {string | null} abort the line that ended the editorial path early
 * @property {string | null} alert
 * @property {string[]} warnings
 * @property {RunArticle[]} articles
 */
