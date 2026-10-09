// Run: node --test scripts/lib/csv.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { csvObjects, parseCsv } from './csv.js'

test('a quoted field holds commas and doubled quotes', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,"two, with comma",3\n'), [
    ['a', 'b', 'c'],
    ['1', 'two, with comma', '3'],
  ])
  assert.deepEqual(parseCsv('a,b\n1,"he said ""hi"""\n'), [
    ['a', 'b'],
    ['1', 'he said "hi"'],
  ])
})

test('a quoted field holds a line break, and it is still one row', () => {
  // UCDP's `source_article` does this in every release: a headline, a line
  // break, then `CR \tSource: …`. Split on lines, that is two short rows and
  // every column after it one place out.
  const text = 'id,source_article,best\n7,"Reuters,2026-03-15,Clashes in Khartoum\nCR \tSource: Reuters",5\n8,"AFP,2026-03-15,Toll rises\r\nCR",2\n'
  assert.deepEqual(parseCsv(text), [
    ['id', 'source_article', 'best'],
    ['7', 'Reuters,2026-03-15,Clashes in Khartoum\nCR \tSource: Reuters', '5'],
    ['8', 'AFP,2026-03-15,Toll rises\r\nCR', '2'],
  ])
})

test('a byte-order mark is not part of the first column', () => {
  // Four readers, three answers: one stripped it with an invisible character
  // written into a regex, one lost it by accident through `trim`, two kept it,
  // and for those a file that began with one failed its column check as
  // "missing columns: id" with every column present.
  assert.deepEqual(parseCsv('﻿id,best\n7,5\n'), [
    ['id', 'best'],
    ['7', '5'],
  ])
  assert.deepEqual(csvObjects('﻿id,best\n7,5\n', ['id', 'best']), [{ id: '7', best: '5' }])
  // Only at the start, where it is a mark and not a character.
  assert.deepEqual(parseCsv('a\n﻿b\n'), [['a'], ['﻿b']])
  assert.deepEqual(parseCsv('﻿'), [])
})

test('lines end three ways, a blank one is not a row, and the last needs no ending', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n\r\n3,4\r5,6\n\n7,8'), [
    ['a', 'b'],
    ['1', '2'],
    ['3', '4'],
    ['5', '6'],
    ['7', '8'],
  ])
  assert.deepEqual(parseCsv(''), [])
  assert.deepEqual(parseCsv('a,b\n'), [['a', 'b']])
})

test('a CSV is read by its header, and a missing column is an error', () => {
  assert.deepEqual(csvObjects('a,b\n1,"x, y"\n', ['a', 'b']), [{ a: '1', b: 'x, y' }])
  assert.throws(() => csvObjects('a,b\n1,2\n', ['a', 'c']), /missing columns: c/)
  assert.throws(() => csvObjects('', ['a']), /empty/)
  // A header and no body is no rows, not an error: what that means is the caller's.
  assert.deepEqual(csvObjects('a,b\n', ['a']), [])
  // A row cut short has empty fields, never `undefined` ones.
  assert.deepEqual(csvObjects('a,b,c\n1\n', ['a']), [{ a: '1', b: '', c: '' }])
})
