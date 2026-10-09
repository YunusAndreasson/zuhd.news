// What the editor is told about each article's length before it reads one:
// `ok 452 chars  4 blocks  content/articles/…md`, or `OVER` past the ceiling.
//
// The line is the only form of the ceiling that reaches the editor as data,
// and it goes into the editor's prompt as written. It was computed by a
// program inside the shell script that ran the cycle, with its own way of finding the body and
// counting its blocks; both are kept exactly, since a different count is a
// different prompt.

import { ARTICLE_CEILING, visibleText } from './article.js'

/**
 * One article's line.
 *
 * Visible characters only: link markup (`[Iran](country:IR)`) is invisible to
 * readers, so it does not eat the budget. The body is what follows the second
 * `---` in the file, and a block is a run of text between blank lines.
 *
 * @param {string} file the path as the list names it
 * @param {string} txt the file
 */
export function bodyLengthLine(file, txt) {
  const body = txt.split('---').slice(2).join('---').trim()
  const len = visibleText(body).length
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.length > 5).length
  const flag = len > ARTICLE_CEILING ? 'OVER' : 'ok'
  return `${flag} ${len} chars  ${blocks} blocks  ${file}`
}
