import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { RECOGNISED, unexpandedAcronyms } from './acronyms.js'
import { ROOT } from './paths.js'

test('what everybody reads as a word is not flagged, and the rest is, once', () => {
  assert.deepEqual(unexpandedAcronyms('The UN and NATO told the CEO of a UAE fund that GDP fell, NASA said.'), [])
  assert.deepEqual(unexpandedAcronyms('TASS, RT and TRT each reported it. AI is the word.'), [])
  assert.deepEqual(unexpandedAcronyms('The DMO disputes the figure. UKMTO says 2 tankers were hit, and the DMO agrees.'), ['DMO', 'UKMTO'])
  assert.deepEqual(unexpandedAcronyms('OPEC+ meets Sunday. The opposition PTI\'s march reached a BJP-run state.'), ['OPEC', 'PTI', 'BJP'])
})

test('a numeral, a designation and the capitals of a name are not abbreviations', () => {
  assert.deepEqual(unexpandedAcronyms('"Programmed death!" said Pope Leo XIV.'), [])
  assert.deepEqual(unexpandedAcronyms('GPT-6.1 hid it. Gunmen with AK-47 rifles fired. Japan\'s HTV-X docked.'), [])
  assert.deepEqual(unexpandedAcronyms('Vice President JD Vance, SK Hynix, ICICI Bank and USS Theodore Roosevelt.'), [])
  // A name in capitals that stands alone is still on the list: the editor's to read.
  assert.deepEqual(unexpandedAcronyms('Minister Karim Badawy told BP the deal would be rejected.'), ['BP'])
  assert.deepEqual(unexpandedAcronyms(''), [])
})

// The list is printed in three places a model reads and kept in one.
test('both prompts print the recognised list, whole', () => {
  const printed = [...RECOGNISED].filter((t) => t !== 'AI')
  for (const file of ['scripts/write-prompt.md', 'scripts/check-prompt.md']) {
    const text = readFileSync(join(ROOT, file), 'utf8')
    const lists = [...text.matchAll(/unless globally recognised \(([^)]+)\)/g)].map((m) => m[1].match(/\b[A-Z]{2,5}\b/g) ?? [])
    assert.ok(lists.length >= 1, file)
    for (const list of lists) assert.deepEqual([...list].sort(), [...printed].sort(), file)
  }
})

// The entry script's stdout is the editor's `<acronyms>` block.
test('the script prints each flagged article of a list with its capitals where they stand', () => {
  const dir = mkdtempSync(join(tmpdir(), 'acronyms-'))
  const article = (title, body) => `---\ntitle: "${title}"\nlocation: "Abuja"\n---\n\n${body}\n`
  writeFileSync(join(dir, 'flagged.md'), article('NNPC Picks Chinese Firms', 'Abuja — NNPC picked two firms, the [Nigeria](country:NG) DMO said.\n\nThe UN and the CEO agreed.'))
  writeFileSync(join(dir, 'clean.md'), article('Nigeria Picks Chinese Firms', 'Abuja — The UN and the CEO agreed, [Nigeria](country:NG) said.'))
  const list = join(dir, 'new-articles.txt')
  writeFileSync(list, `${join(dir, 'clean.md')}\n${join(dir, 'flagged.md')}\n${join(dir, 'not-there.md')}\n`)
  const run = (file) => spawnSync(process.execPath, [join(ROOT, 'scripts/flag-acronyms.js'), file], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } })
  const out = run(list)
  assert.deepEqual([out.status, out.stderr], [0, ''])
  assert.equal(out.stdout, `ACRONYM ${join(dir, 'flagged.md')}\n  NNPC: …NNPC Picks Chinese Firms Abuja — N…\n  DMO: …picked two firms, the Nigeria DMO said. The UN and the CEO agr…\n`)
  const none = run(join(dir, 'no-such-list.txt'))
  assert.deepEqual([none.status, none.stdout], [0, ''])
})
