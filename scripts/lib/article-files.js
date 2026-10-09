// Which article files could fall inside a time window, decided from the name.
//
// Articles are named `YYYY-MM-DD-slug.md`, so a window over the corpus is
// mostly a string comparison over `readdirSync`. Three stages parsed every
// file instead — 10.8k files, 44MB — to keep a day or a fortnight of them:
// the dedup context (~750ms, three times a cycle), the FIRMS seed scan and the
// briefing collector. Two others (`coverage-window.js`, `translate-swedish.js`)
// already had the guard; this is it once, with the margin measured.
//
// And which files are this cycle's: the batch list, read one way.

import { readFileSync, readdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathOf } from './datasets.js'
import { ROOT } from './paths.js'

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

/**
 * This cycle's batch: the articles the new-articles list names, in its order.
 * The list holds one path a line from the repository root
 * (`content/articles/2026-10-09-x.md`), written by the cycle after the writer.
 *
 * Nine readers split that file nine ways: resolved against the working
 * directory, against the root, or not at all, and one without dropping the
 * empty last line, so an empty list counted as one article. They agreed only
 * because the cycle's working directory is the root.
 *
 * A list that is not there throws, as reading it always did: a stage that may
 * run without one checks first.
 *
 * @param {string} [listPath] the list; the cycle's own when absent
 * @returns {{ rel: string, path: string, name: string }[]} `rel` as the list wrote it, `path` absolute, `name` the file's name
 */
export function batchFiles(listPath = pathOf('newArticles')) {
  return readFileSync(listPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((rel) => ({ rel, path: resolve(ROOT, rel), name: basename(rel) }))
}
