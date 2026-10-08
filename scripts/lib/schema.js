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

/**
 * One source of an article, in the order the pipeline published them:
 * `sources[0]` is the primary source in the APIs, the feed and the share card,
 * and is never reordered.
 *
 * @typedef {object} ArticleSource
 * @property {string} name the writer
 * @property {string} url the writer
 * @property {string} [country] ISO alpha-2; the writer
 * @property {number} [sentiment] `scaffold-articles.js` from the selection, refined by `extract-source-angles.js`
 * @property {string} [image] `scaffold-articles.js`, the feed's own
 * @property {string} [angle] `extract-source-angles.js`
 */

/**
 * An article's frontmatter, with the stage that owns each key. Seven writers
 * edit the block in turn and none of them may touch another's key.
 *
 * Every key is optional in the type because the first writer is a model:
 * `articleProblems` (`lib/article.js`) says which are missing. And the list is
 * not closed: `parseFrontmatter` returns whatever the file holds, so a reader
 * takes this with `Record<string, any>` beside it.
 *
 * @typedef {object} ArticleMeta
 * @property {string} [title] the writer; the editor may reword it
 * @property {string} [date] the writer: the event's time, ISO
 * @property {string} [category] the writer: one of `CATEGORIES`
 * @property {string} [location] the writer: the dateline city, and nothing but the city
 * @property {number} [lat] the writer
 * @property {number} [lng] the writer
 * @property {ArticleSource[]} [sources] the writer
 * @property {string[]} [concepts] the writer, or `scaffold-articles.js` when the writer left them out
 * @property {number} [eventCoverage] `scaffold-articles.js`
 * @property {number} [sentimentDivergence] `scaffold-articles.js`
 * @property {{ mention: string, indicatorId: string, kind: string }[]} [entities] `extract-entities.js`; published
 * @property {string[]} [subjects] `extract-entities.js`: `[]` is read and about none, no key is never read
 * @property {string} [chart] the writer; `validate-articles.js` removes one that was not offered
 * @property {string} [socialTitle] `pick-breaking-social.js`
 * @property {{ date: string, note: string }[]} [corrections] a person
 */

/**
 * A story the ledger is following (`content/.story-ledger.json`, in an
 * envelope `{ version: 1, stories }`). Written whole by `update-ledger.js`.
 *
 * @typedef {object} LedgerStory
 * @property {string} id the first article's slug without its date
 * @property {string} label
 * @property {string} firstSeen ISO
 * @property {string} lastCovered ISO
 * @property {number} coverageCount
 * @property {string} category
 * @property {number} importance starts at 6, falls by 1 for each cycle that does not cover it, removed at 0
 * @property {'breaking' | 'developing' | 'ongoing'} arc
 * @property {string[]} articles slugs
 * @property {string | null} eventUri
 * @property {string} summary
 * @property {string[]} conceptUris
 */

/**
 * What a stage reports about one run, as a line of JSON appended to the file
 * `$ZUHD_STAGE_RESULT` names (`lib/stage.js`). The orchestrator used to learn
 * this by reading the stage's prose.
 *
 * @typedef {object} StageResult
 * @property {string} stage
 * @property {string} at ISO, when the stage finished
 * @property {'ok' | 'skipped' | 'failed'} status
 * @property {number} seconds
 * @property {Record<string, number>} [counts]
 * @property {{ slug: string, reason: string }[]} [dropped] the stories this stage removed, and why
 * @property {string} [skipped] why it did nothing: a missing key, an empty input
 * @property {string} [degraded] why it kept the last good output instead of a new one
 * @property {string} [error]
 */
