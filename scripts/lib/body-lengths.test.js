// Run: node --test scripts/lib/body-lengths.test.js
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

// The body is what lies under the frontmatter block, and the block ends at a
// line that is `---` alone. Until 2026-10-09 the body was taken to start after
// the second `---` anywhere in the file, and this test pinned it, on the count
// that the corpus held no file where the two differ (0 of 11,207). It held none
// because the validator cut the same way and had moved each one aside: two of
// the 126 `.md.bad`, and they are the fixtures below.
test('the body starts under the frontmatter, wherever a `---` stands inside it', () => {
  assert.equal(bodyLengthLine('a.md', 'Just prose, no frontmatter at all.\n'), 'ok 0 chars  0 blocks  a.md')
  assert.equal(bodyLengthLine('a.md', ''), 'ok 0 chars  0 blocks  a.md')
  assert.equal(bodyLengthLine('a.md', `${FM.replace('Trade Body', 'Trade --- Body')}${FOUR}\n`), `ok ${FOUR.length} chars  4 blocks  a.md`, 'dashes in a title are in the title')
  // No YAML is read, so a block that does not parse still gets its line.
  assert.equal(bodyLengthLine('a.md', `${FM.replace('"Trade Body', '"Trade "Body')}${FOUR}\n`), `ok ${FOUR.length} chars  4 blocks  a.md`)

  // 2026-10-01 14:02 UTC: the editor was told the first of these was OVER at
  // 1,099 characters, and wrote "the file on disk is about 450".
  const quarantined = (/** @type {string} */ name) => readFileSync(new URL(`./fixtures/quarantined/${name}`, import.meta.url), 'utf8')
  assert.equal(bodyLengthLine('x.md', quarantined('2026-10-01-uae-prosecutor-probes-flydubai-cockpit-attack-pilot-vetting.md')), 'ok 481 chars  5 blocks  x.md')
  assert.equal(bodyLengthLine('x.md', quarantined('2026-09-27-oleshky-drone-food-deliveries-occupied-kherson.md')), 'ok 474 chars  5 blocks  x.md')
})

// The harness's `node` is a stand-in, so nothing there starts this file, and
// its stdout is a part of the editor's prompt. It reads the list in /tmp if a
// cycle left one and writes nothing; with no list it stops on that.
test('the entry script itself loads and runs', () => {
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts/body-lengths.js')], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } })
  if (res.status === 0) assert.match(res.stdout, /^$|^(ok|OVER) \d+ chars {2}\d+ blocks {2}\S+\n/)
  else assert.match(res.stderr, /ENOENT: no such file or directory, open '\/tmp\/zuhd-new-articles\.txt'/)
})
