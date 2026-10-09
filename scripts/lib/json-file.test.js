import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readJson, writeJson, writeText } from './json-file.js'

const dir = mkdtempSync(join(tmpdir(), 'json-file-'))

test('readJson: a missing file is the fallback, silently', () => {
  assert.deepEqual(readJson(join(dir, 'nope.json'), { a: 1 }), { a: 1 })
  assert.equal(readJson(join(dir, 'nope.json')), null)
})

test('readJson: a truncated file is the fallback, not a crash', () => {
  const p = join(dir, 'bad.json')
  writeFileSync(p, '{"items": [1, 2')
  assert.deepEqual(readJson(p, []), [])
})

test('writeJson round-trips, ends in a newline, and leaves no tmp file', () => {
  const p = join(dir, 'sub', 'out.json')
  writeJson(p, { b: [1, 2] })
  assert.deepEqual(readJson(p), { b: [1, 2] })
  assert.ok(readFileSync(p, 'utf8').endsWith('}\n'))
  writeJson(p, { c: 1 }, { pretty: false })
  assert.equal(readFileSync(p, 'utf8'), '{"c":1}\n')
  assert.deepEqual(readdirSync(join(dir, 'sub')), ['out.json'])
})

test('writeText writes the bytes it was given, over what was there, and leaves no tmp file', () => {
  const p = join(dir, 'text', 'article.md')
  writeText(p, '---\ntitle: "A"\n---\nBody.\n')
  writeText(p, '---\ntitle: "B"\n---\nBody.')
  assert.equal(readFileSync(p, 'utf8'), '---\ntitle: "B"\n---\nBody.')
  assert.deepEqual(readdirSync(join(dir, 'text')), ['article.md'])
})
