// What the editor is told about each article's length before it reads one:
// `ok 452 chars  4 blocks  content/articles/…md`, or `OVER` past the ceiling.
//
// The line is the only form of the ceiling that reaches the editor as data,
// and it goes into the editor's prompt as written. It was computed by a
// program inside the shell script that ran the cycle, with its own way of
// counting blocks, which is kept exactly: a different count is a different
// prompt.
//
// Its own way of finding the body is not kept. It took the body to start after
// the second `---` anywhere in the file, and a source URL holding one put the
// rest of the frontmatter into the count: on 2026-10-01 the editor was told a
// 481-character article was `OVER` at 1,099, said so in its summary, and the
// validator, cutting the same way, moved the article aside as "6 blocks".

import { ARTICLE_CEILING, visibleText } from './article.js'
import { splitFrontmatter } from './frontmatter.js'

/**
 * One article's line.
 *
 * Visible characters only: link markup (`[Iran](country:IR)`) is invisible to
 * readers, so it does not eat the budget. The body is what `splitFrontmatter`
 * finds under the block (nothing, for a file with no block), and a block is a
 * run of text between blank lines. No YAML is read: a file whose frontmatter
 * does not parse still gets its line.
 *
 * @param {string} file the path as the list names it
 * @param {string} txt the file
 */
export function bodyLengthLine(file, txt) {
  const body = splitFrontmatter(txt)?.body ?? ''
  const len = visibleText(body).length
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.length > 5).length
  const flag = len > ARTICLE_CEILING ? 'OVER' : 'ok'
  return `${flag} ${len} chars  ${blocks} blocks  ${file}`
}
