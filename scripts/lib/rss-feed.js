// What the RSS fetcher decides, apart from the fetching.
//
// `scripts/fetch-news.js` is requests from top to bottom, and the few
// decisions it takes between them could only be tried by running a cycle.
// They are here as functions of what a request returned.

/**
 * The Hacker News stories in the order the fetcher takes them: of the ones
 * whose page was fetched, those that gave a body come first.
 *
 * Five pages are fetched and three stories used, "buffer for failures". The
 * three used were the top three by comments whether or not their fetch had
 * worked. On 2026-10-09 10:00, three of the five pages gave a body, and the
 * feed carried two stories whose whole text was "875 points, 1487 comments on
 * Hacker News" while two fetched pages went unused; 25 of the 40 cycles to
 * that date fetched fewer than five of five.
 *
 * @template {{ bodyText?: string | null }} T
 * @param {T[]} stories by comments, most first
 * @param {number} fetched how many of them, from the top, had their page fetched
 * @returns {T[]}
 */
export function bodiesFirst(stories, fetched) {
  const tried = stories.slice(0, fetched)
  return [...tried.filter((s) => s.bodyText), ...tried.filter((s) => !s.bodyText), ...stories.slice(fetched)]
}
