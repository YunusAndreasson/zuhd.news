import type { Article } from '@shared/types';

/**
 * Whether a story is among the most covered: the one claim about reach the data
 * will carry.
 *
 * `eventCoverage` is the number of articles in the news API's event cluster
 * (`fetch-news-api.js`, `totalArticles`) — how many reports covered the
 * event, across outlets. Two things limit it, both measured on the corpus
 * from 2026-08-01 to 2026-09-22 (1,066 stories with a figure):
 *
 * - **About three in five stories carry none.** RSS-origin stories have no
 *   event cluster, so a missing figure means unmeasured, never quiet. That is
 *   why this is one bar and not a scale: a scale would have to draw the
 *   unmeasured majority somewhere, and anywhere it drew them would be a claim.
 * - **It is a count to judge against a fixed bar, not to rank within a day.**
 *   A day's top story by rank exists even on a slow day. 400 reports is about
 *   the corpus's 90th percentile (median 111): 0–8 stories a day, usually two
 *   to four, and zero on a day nothing broke through.
 *
 * **The figure is not printed** (2026-09-24, the user's request). For a day
 * the kicker and the scrub tooltip ended in `884 reports`; before that the
 * words were `most covered`, `widely reported` read as unclear, a coloured
 * bar was not understood, and `trending` promised attention rising now,
 * which nothing here measures. What the bar still does: it leads the river
 * (`leadWithTopStories`) and stands a story's cell taller on the dock's
 * track. If a count ever comes back, its unit is `reports` — one wire story
 * syndicated two hundred times is two hundred of them — never `outlets` or
 * `sources`, and only over the bar, or the three in five with no figure
 * read as zero.
 *
 * Figures past `COVERAGE_CEILING` are dropped as the nonsense the corpus
 * occasionally holds (157,957 is not a number of reports); the real maximum
 * in the sample is under 2,000.
 */
export const MOST_COVERED = 400;
const COVERAGE_CEILING = 20_000;

export function isMostCovered(article: Pick<Article, 'eventCoverage'>): boolean {
  const c = article.eventCoverage;
  return typeof c === 'number' && Number.isFinite(c) && c >= MOST_COVERED && c <= COVERAGE_CEILING;
}
