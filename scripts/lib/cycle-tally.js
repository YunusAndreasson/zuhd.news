// What the orchestrator counts between stages, to print and to branch on.
//
// Four one-line programs the shell script that ran the cycle carried inline,
// six times between them. Each said what it would answer when its file was
// missing or not what it expected, and no two said the same: that is kept,
// word for word, because one answer goes into the log's `API fetch:` line and
// another is compared with 0 to decide whether the cycle goes on.

/**
 * `80 stories from 50 events`, for the log. The API feed as
 * `fetch-news-api.js` writes it: `{ stories, events }`.
 *
 * @param {any} feed
 */
export const apiStats = (feed) => `${feed.stories.length} stories from ${feed.events} events`

/**
 * How many stories the RSS fetch left; an older shape of the file carried the
 * figure as `freshItems`.
 *
 * @param {any} feed
 * @returns {number}
 */
export const rssStats = (feed) => feed.stories?.length || feed.freshItems || 0

/**
 * `13 multi + 47 niche`, the first row of the funnel.
 *
 * @param {any} feed the merged feed
 */
export const feedStats = (feed) => `${feed.multiSourceStories?.length || 0} multi + ${feed.nicheStories?.length || 0} niche`

/**
 * How many stories a selection holds. What is not a list holds none.
 *
 * @param {any} selection
 * @returns {number}
 */
export const selectionCount = (selection) => (Array.isArray(selection) ? selection.length : 0)

/**
 * The answer for one kind, read from its file. A file that is missing or is
 * not what the count expects gets that kind's own answer: `failed` for the two
 * that are only printed, `0` for the RSS figure. The selection has none: it
 * throws, the process exits 1 with nothing on stdout, and the cycle reads
 * that as 0 (`selectionCount`, `lib/cycle-steps.js`).
 *
 * @param {string} kind `feed-api`, `feed-rss`, `feed` or `selection`
 * @param {(name: 'feedApi' | 'feedRss' | 'feed' | 'selection') => string} read the named file's text; throws when there is none
 * @returns {string | number}
 */
export function tally(kind, read) {
  switch (kind) {
    case 'feed-api':
      try {
        return apiStats(JSON.parse(read('feedApi')))
      } catch {
        return 'failed'
      }
    case 'feed-rss':
      try {
        return rssStats(JSON.parse(read('feedRss')))
      } catch {
        return '0'
      }
    case 'feed':
      try {
        return feedStats(JSON.parse(read('feed')))
      } catch {
        return 'failed'
      }
    case 'selection':
      return selectionCount(JSON.parse(read('selection')))
    default:
      throw new Error(`tally: no count named "${kind}" (feed-api, feed-rss, feed, selection)`)
  }
}
