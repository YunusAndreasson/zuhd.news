// Which article files could fall inside a time window, decided from the name.
//
// Articles are named `YYYY-MM-DD-slug.md`, so a window over the corpus is
// mostly a string comparison over `readdirSync`. Three stages parsed every
// file instead — 10.8k files, 44MB — to keep a day or a fortnight of them:
// the dedup context (~750ms, three times a cycle), the FIRMS seed scan and the
// briefing collector. Two others (`coverage-window.js`, `translate-swedish.js`)
// already had the guard; this is it once, with the margin measured.

import { readdirSync } from 'node:fs'

/**
 * How far an article's frontmatter `date` may run ahead of its filename's.
 * The prefix comes from the source's pubDate and `date` can be set later by
 * the writer; over 10,844 articles on 2026-10-02 the widest gap was 7 days.
 * Generous on purpose: a file wrongly skipped is a duplicate published or a
 * story missing from the briefing, while the margin costs reading a month of
 * files rather than every file.
 */
export const FILENAME_DATE_MARGIN_MS = 31 * 86_400_000

const DATED = /^\d{4}-\d{2}-\d{2}/

/**
 * The `.md` names in `dir` whose frontmatter `date` could be at or after
 * `sinceMs`. A superset: callers still apply their own test to what they
 * parse. A name without a date prefix is always included, so nothing is
 * skipped on a guess.
 *
 * @param {string} dir
 * @param {number} sinceMs
 * @returns {string[]}
 */
export function articleFilesSince(dir, sinceMs) {
  const floor = new Date(sinceMs - FILENAME_DATE_MARGIN_MS).toISOString().slice(0, 10)
  return readdirSync(dir).filter((f) => f.endsWith('.md') && (!DATED.test(f) || f.slice(0, 10) >= floor))
}
