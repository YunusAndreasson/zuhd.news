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
 * What the reader sees is the figure itself, `884 reports` (the user asked
 * for the number, 2026-09-23), and only on the stories over the bar:
 * printed everywhere, the three in five with no figure would read as zero.
 * The unit is `reports`, the newsroom word for an article, which is what is
 * counted — one wire story syndicated two hundred times is two hundred of
 * them — never `outlets` or `sources`, which would claim that many
 * newsrooms. It is the count when the pipeline picked the story, not a live
 * one. The words it replaced were `most covered`; before that
 * `widely reported` read as unclear, a coloured bar was not understood, and
 * `trending` promised attention rising now, which nothing here measures.
 *
 * Figures past `COVERAGE_CEILING` are dropped as the nonsense the corpus
 * occasionally holds (157,957 is not a number of reports); the real maximum
 * in the sample is under 2,000.
 */
export const MOST_COVERED = 400;
const COVERAGE_CEILING = 20_000;

/** `884 reports`, `1,907 reports`: the kicker's and the tooltip's words
 *  for a most-covered story, or null. Grouped by hand, not `toLocaleString`,
 *  which goes through ICU on Android. */
export function coverageLabel(article: Pick<Article, 'eventCoverage'>): string | null {
  if (!isMostCovered(article)) return null;
  const n = Math.round(article.eventCoverage ?? 0);
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} reports`;
}

export function isMostCovered(article: Pick<Article, 'eventCoverage'>): boolean {
  const c = article.eventCoverage;
  return typeof c === 'number' && Number.isFinite(c) && c >= MOST_COVERED && c <= COVERAGE_CEILING;
}
