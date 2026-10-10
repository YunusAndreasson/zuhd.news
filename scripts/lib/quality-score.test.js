// Run: node --test scripts/lib/quality-score.test.js
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { score, scoreDir } from './quality-score.js'

/** @param {Record<string, any>} meta @param {string} body */
const article = (meta, body) => ({ slug: '2026-10-09-a', meta: { title: 'Council Closes The Bridge', location: 'Lyon', ...meta }, body })

test('an article is counted on its prose: the dateline and the link targets are not part of it', () => {
  const counts = score(article({}, 'Lyon — The council closed the Pont Wilson on 3 October.\n\nIt carried 40,000 crossings a day into [Vieux Lyon](country:FR).\n\nEngineers from Lyon Metropole found two cables below strength.'))
  assert.deepEqual(counts, {
    file: '2026-10-09-a',
    title: 'Council Closes The Bridge',
    sentences: 3,
    // 3, 40 and 000: a figure with a comma in it is two runs of digits.
    digits: 3,
    // Pont, Wilson, October; Vieux, Lyon; Lyon, Metropole. Not a sentence's first word, and not "FR".
    properNouns: 7,
    specificity: 10,
    hedges: 0,
    // {council, closes, the, bridge} against the first sentence's eight different words: two shared of ten.
    titleEcho: 2 / 10,
  })
})

test('a dateline is stripped by the location the article names, accents and all', () => {
  const body = 'Brasília — Lula signed the decree.'
  assert.equal(score(article({ location: 'Brasília' }, body)).sentences, 1)
  assert.equal(score(article({ location: 'Brasília' }, body)).properNouns, 0, '"Lula" opens the sentence once the dateline is gone')
})

test('every hedge is counted, each time it is used', () => {
  assert.equal(score(article({}, 'Lyon — The vote could reshape the city. It may pass, and it may not.')).hedges, 4, 'could, could reshape, may, may')
  assert.equal(score(article({}, 'Lyon — The vote passed.')).hedges, 0)
})

test('a title its first sentence repeats word for word echoes fully', () => {
  assert.equal(score(article({ title: 'Council closes the bridge' }, 'Lyon — Council closes the bridge.')).titleEcho, 1)
  assert.equal(score(article({ title: '' }, 'Lyon — Council closes the bridge.')).titleEcho, 0)
})

test('the newest articles of a directory are scored and averaged, and one that does not parse is left out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'quality-score-'))
  const file = (name, title, body) => writeFileSync(join(dir, name), `---\ntitle: "${title}"\nlocation: "Lyon"\n---\n\n${body}\n`)
  file('2026-10-07-old.md', 'Old', 'Lyon — Nothing in 1999.')
  file('2026-10-08-a.md', 'First', 'Lyon — The council met in Paris on 3 June.')
  file('2026-10-09-b.md', 'Second', 'Lyon — It could pass.')
  writeFileSync(join(dir, '2026-10-09-c.md'), '---\ntitle: "A "Quote" Inside"\n---\n\nLyon — Broken.\n')
  writeFileSync(join(dir, 'notes.txt'), 'not an article')

  const { rows, mean } = scoreDir(dir, 3)
  assert.deepEqual(rows.map((r) => r.file), ['2026-10-08-a', '2026-10-09-b'], 'the newest three by name, less the one that does not parse')
  assert.deepEqual(mean, { specificity: 1.5, digits: 0.5, properNouns: 1, hedges: 0.5, titleEcho: 0, sentences: 1, articleCount: 2 })
  assert.equal(scoreDir(dir).rows.length, 3, 'with no limit, all of them')
  assert.deepEqual(scoreDir(mkdtempSync(join(tmpdir(), 'quality-score-'))), { rows: [], mean: null })
})
