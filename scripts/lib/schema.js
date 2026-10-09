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
 * The four desks. Also spelled in `shared/types.ts` (the app's `Category`),
 * `CATEGORY_FLOORS`, `build.js`, the MCP worker and both prompts, none of
 * which can import this; `article.test.js` reads each copy.
 */
export const CATEGORIES = Object.freeze(['politics', 'economy', 'science', 'tech'])

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
 * @property {string[]} [conceptUris] not written since 2026-10-09 (nothing read it); on a story from before, until it fades
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
 * @property {{ slug: string, reason: string }[]} [flagged] the stories it let through with something wrong, and what
 * @property {string} [skipped] why it did nothing: a missing key, an empty input
 * @property {string} [degraded] why it kept the last good output instead of a new one
 * @property {string} [error]
 */

/**
 * One source of a feed story. `body` is what the writer is given to work
 * from, so a story whose every `body` is a teaser is thin and is dropped
 * before the writer (`THIN_BODY`, `lib/dedup.js`). The selector reads a copy
 * of the feed with every `body` taken out.
 *
 * @typedef {object} FeedSource
 * @property {string} name
 * @property {string} url
 * @property {string | null} country ISO alpha-2
 * @property {string} [body] absent in the slim feed
 * @property {string | null} [image]
 * @property {number | null} [importanceRank] NewsAPI stories only
 * @property {number | null} [sentiment] NewsAPI stories only
 */

/**
 * One story in the feed the selector picks from (`/tmp/zuhd-feed.json`, under
 * `multiSourceStories` or `nicheStories`).
 *
 * Five places build one, `fetch-news.js` for RSS and four in
 * `fetch-news-api.js`, and they do not build the same thing: an RSS story has
 * no `eventDate`, `socialScore` or `sentimentDivergence`, a tracked series
 * has no `eventDate`. The optional keys below are that difference, written
 * down and not yet removed. The selector reads these objects as they stand,
 * so making them uniform is a change to its input.
 *
 * @typedef {object} FeedItem
 * @property {string} title
 * @property {string} description
 * @property {string} link
 * @property {string} pubDate ISO; the dateline time on every surface
 * @property {string} category
 * @property {string} source the primary outlet's name
 * @property {string} suggestedSlug `YYYY-MM-DD-words`; the article's filename, and the key every later stage joins on
 * @property {string | null} eventUri NewsAPI's event id; null for RSS
 * @property {number | null} eventCoverage how many articles NewsAPI filed under the event
 * @property {FeedSource[]} sources
 * @property {(string | { label: string, uri: string })[]} concepts
 * @property {'rss' | 'api'} origin
 * @property {string} [eventDate] NewsAPI events only
 * @property {number | null} [socialScore] NewsAPI events only
 * @property {number | null} [sentiment]
 * @property {number | null} [sentimentDivergence] NewsAPI events with a panel of sources
 * @property {unknown} [location]
 * @property {true} [thin] slim feed only: no source carries enough text (`prefilter-feed.js`)
 */

/**
 * One story the selector picked (`/tmp/zuhd-selection.json`, an array). The
 * selector writes the first block; three stages then rewrite the file in turn.
 *
 * @typedef {object} SelectionEntry
 * @property {string} title the selector, copied from the feed
 * @property {string} link
 * @property {string} source
 * @property {string} pubDate
 * @property {string} category one of `CATEGORIES`
 * @property {string} angle the selector: what the writer should lead with
 * @property {string} suggestedSlug the article's filename, and the join key from here on
 * @property {FeedSource[]} sources the selector's, then replaced by the feed's own copies, bodies included (`enrich-selection.js`)
 * @property {string | null} [eventUri]
 * @property {number | null} [eventCoverage]
 * @property {(string | { label: string, uri: string })[]} [concepts]
 * @property {number | null} [sentimentDivergence]
 * @property {unknown[]} [indicators] `attach-indicators.js`: the live levels the writer may cite
 * @property {unknown[]} [calendar] `attach-indicators.js`
 */

const SLUG = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * What is wrong with a selection, as short phrases; empty when nothing is.
 * The selector is a model writing JSON to a file, and until now the only
 * check between it and the writer was whether the file held an array.
 *
 * It reports. Dropping an entry is the business of the stage that reads it.
 *
 * @param {unknown} selection
 * @returns {string[]}
 */
export function selectionProblems(selection) {
  if (!Array.isArray(selection)) return ['not an array']
  /** @type {string[]} */
  const problems = []
  const seen = new Set()
  selection.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      problems.push(`#${i + 1}: not an object`)
      return
    }
    const at = entry.suggestedSlug || `#${i + 1}`
    for (const k of ['suggestedSlug', 'category', 'title', 'sources']) if (!entry[k]) problems.push(`${at}: missing ${k}`)
    if (entry.suggestedSlug && !SLUG.test(entry.suggestedSlug)) problems.push(`${at}: slug is not YYYY-MM-DD-words`)
    if (entry.category && !CATEGORIES.includes(entry.category)) problems.push(`${at}: invalid category ${entry.category}`)
    if (entry.sources && !Array.isArray(entry.sources)) problems.push(`${at}: sources is not a list`)
    if (entry.suggestedSlug && seen.has(entry.suggestedSlug)) problems.push(`${at}: slug picked twice`)
    seen.add(entry.suggestedSlug)
  })
  return problems
}
