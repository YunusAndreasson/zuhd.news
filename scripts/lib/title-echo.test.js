import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT } from './paths.js'
import { contentWords, hookOf, titleEcho } from './title-echo.js'

// Every pair is a published one (2026-09-20 to 10-03).

test('flags a hook that says the title again with a verb change', () => {
  const r = titleEcho(
    'Settlers Attack Olive Pickers',
    'Israeli settlers attacked Palestinian olive pickers Monday during a closure.',
  )
  assert.equal(r.covered, 1)
  assert.equal(r.echo, true)
})

test('a figure the title already carries is not a new one', () => {
  const hook = "[Pakistan](country:PK)'s finance secretary says the IMF wants 174 amendments."
  assert.equal(titleEcho('IMF Seeks 174 Amendments', hook).echo, true)
})

test('a figure the title does not carry is what a hook is for', () => {
  const r = titleEcho('Nvidia’s Record Share Buyback', 'Nvidia authorized a record $150 billion share buyback.')
  assert.equal(r.covered, 1)
  assert.equal(r.figure, true)
  assert.equal(r.echo, false)
})

test('leaves a hook that tells the reader something else', () => {
  const r = titleEcho('Rains Fail Across Darfur', '400 litres of water in Geneina now costs 25,000 pounds.')
  assert.equal(r.echo, false)
})

// Pinned on purpose: the measure cannot see a stake written in words, which is
// why it is a flag for the editor's own test and never a gate.
test('flags a stake in words too — the editor decides', () => {
  const hook = '[Russia](country:RU) threatens nuclear response if NATO isolates Kaliningrad.'
  assert.equal(titleEcho('Russia Threatens NATO Over Kaliningrad', hook).echo, true)
})

test('reads link markup as its words, possessives as the name', () => {
  assert.deepEqual(contentWords("[China](country:CN)'s copper"), contentWords('China copper'))
  assert.deepEqual(contentWords('Nvidia’s buyback'), contentWords('nvidia buyback'))
  assert.deepEqual(contentWords('the Nvidia of it'), ['nvidia'])
})

test('the hook is the first block without its dateline', () => {
  const body = 'Kano — Nigeria’s Kano State banned processions.\n\nThe ban aims to head off clashes.'
  assert.equal(hookOf(body, 'Kano'), 'Nigeria’s Kano State banned processions.')
  assert.equal(hookOf(body), 'Nigeria’s Kano State banned processions.')
})

// One reading of what a dateline is (`stripDateline`, `lib/article.js`): the
// location when there is one, and otherwise what the validator takes for a
// dateline, up to 60 characters before the dash. This had its own, up to 40.
test('the dateline comes off by the location, and without one by the validator\'s pattern', () => {
  assert.equal(hookOf('Brasília — Lula leads the first round.\n\nSecond.', 'Brasília'), 'Lula leads the first round.')
  const long = 'Dadra and Nagar Haveli and Daman and Diu, India — A court ruled.'
  assert.equal(long.indexOf(' — '), 47)
  assert.equal(hookOf(long), 'A court ruled.')
  // A location the body does not open with strips nothing by itself, and no dash is no dateline.
  assert.equal(hookOf('A court ruled on Tuesday.', 'Geneva'), 'A court ruled on Tuesday.')
  assert.equal(hookOf('', 'Geneva'), '')
})

test('a title with no words of substance flags nothing', () => {
  assert.equal(titleEcho('', 'Anything at all.').echo, false)
})

// The entry script, started on a list of its own as the cycle starts it on the
// batch. Its stdout is the editor's `<title-echo>` block, so an empty one has
// to mean that no hook echoes its title. It took the list's paths from the
// working directory: started anywhere but the root it could read none of
// them, skipped each in silence, and printed the same nothing.
test('the script prints the flagged articles of a list, named as the list names them, from any directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'title-echo-'))
  const list = join(dir, 'new-articles.txt')
  const echo = 'scripts/lib/fixtures/batch/2026-10-08-council-closes-the-bridge.md'
  const sound = 'scripts/lib/fixtures/quarantined/2026-10-01-uae-prosecutor-probes-flydubai-cockpit-attack-pilot-vetting.md'
  writeFileSync(list, `${sound}\n${echo}\nscripts/lib/fixtures/batch/not-there.md\n`)
  const run = (/** @type {string} */ cwd, file = list) =>
    spawnSync(process.execPath, [join(ROOT, 'scripts/flag-title-echo.js'), file], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } })
  const flagged = `ECHO ${echo}\n  title: Council Votes To Close The Bridge\n  hook:  The council voted on Tuesday to close the bridge.\n`

  const fromRoot = run(ROOT)
  assert.deepEqual([fromRoot.status, fromRoot.stdout, fromRoot.stderr], [0, flagged, ''])
  assert.equal(run(dir).stdout, flagged, 'the list is read from the root, wherever the script is started')
  // No list is no batch: nothing printed and nothing failed.
  const none = run(ROOT, join(dir, 'no-such-list.txt'))
  assert.deepEqual([none.status, none.stdout], [0, ''])
})
