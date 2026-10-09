// Run: node --test scripts/lib/body-lengths.test.js
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { ARTICLE_CEILING } from './article.js'
import { bodyLengthLine } from './body-lengths.js'
import { ROOT } from './paths.js'

const FM = '---\ntitle: "Trade Body Doubles Its Forecast"\ndate: "2026-10-08T17:00:00Z"\nsources:\n  - name: "Dawn"\n    url: "https://www.dawn.com/news/1"\n---\n\n'
const FOUR = 'Lyon — The first block.\n\nThe second block.\n\nThe third block.\n\nThe fourth block.'

test('a line gives the visible length, the blocks and the file, as the editor is shown them', () => {
  assert.equal(bodyLengthLine('content/articles/2026-10-08-wto.md', `${FM}${FOUR}\n`), `ok ${FOUR.length} chars  4 blocks  content/articles/2026-10-08-wto.md`)
})

test('link markup costs its label and nothing more', () => {
  const linked = 'Tehran — [Iran](country:IR) and [Iraq](country:IQ) signed.\n\nA second block.'
  assert.equal(bodyLengthLine('a.md', FM + linked), `ok ${'Tehran — Iran and Iraq signed.\n\nA second block.'.length} chars  2 blocks  a.md`)
})

test('OVER is said one character past the ceiling, counted as the reader sees it', () => {
  const body = (/** @type {number} */ n) => `${FM}${'x'.repeat(n)}\n`
  assert.match(bodyLengthLine('a.md', body(ARTICLE_CEILING)), /^ok 560 chars /)
  assert.match(bodyLengthLine('a.md', body(ARTICLE_CEILING + 1)), /^OVER 561 chars /)
  const links = `${FM}${'[Iran](country:IR) and [Iraq](country:IQ) signed it. '.repeat(20)}`
  assert.ok(links.length - FM.length > ARTICLE_CEILING)
  assert.equal(bodyLengthLine('a.md', links), `ok ${'Iran and Iraq signed it. '.repeat(20).trim().length} chars  1 blocks  a.md`, 'over the ceiling as written, under it as read')
})

test('a block is text between blank lines, and five characters or fewer is not one', () => {
  assert.match(bodyLengthLine('a.md', `${FM}One block here.\n\nab\n\n \n\nThird one.\n`), / 2 blocks /)
  assert.match(bodyLengthLine('a.md', `${FM}One block here.\n  \t \nTwo after a line of spaces.\n\n\n\nThree after three breaks.\n`), / 3 blocks /)
  assert.match(bodyLengthLine('a.md', `${FM}One block here.\n\n---\n\nAnother after a rule.\n`), / 2 blocks /, 'a rule in the body stays in it and is too short to count')
})

// As it stands. The body is taken as what follows the second `---` anywhere in
// the file, which the article reader does differently only for shapes the
// corpus does not hold (0 of 11,207 on 2026-10-09).
test('where the probe\'s own way of finding the body shows', () => {
  assert.equal(bodyLengthLine('a.md', 'Just prose, no frontmatter at all.\n'), 'ok 0 chars  0 blocks  a.md')
  assert.equal(bodyLengthLine('a.md', ''), 'ok 0 chars  0 blocks  a.md')
  assert.match(bodyLengthLine('a.md', `${FM.replace('Trade Body', 'Trade --- Body')}${FOUR}\n`), /^ok \d+ chars {2}5 blocks /, 'dashes in a title move the start of the body')
})

// The harness's `node` is a stand-in, so nothing there starts this file, and
// its stdout is a part of the editor's prompt. It reads the list in /tmp if a
// cycle left one and writes nothing; with no list it stops on that.
test('the entry script itself loads and runs', () => {
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts/body-lengths.js')], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } })
  if (res.status === 0) assert.match(res.stdout, /^$|^(ok|OVER) \d+ chars {2}\d+ blocks {2}\S+\n/)
  else assert.match(res.stderr, /ENOENT: no such file or directory, open '\/tmp\/zuhd-new-articles\.txt'/)
})
