// Run: node --test scripts/lib/mcp-sources.test.js
//
// zuhd://sources called itself the complete list while omitting 30 of the 36
// outlets the cycle reads. What it says it reads directly is held to the table.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RSS_SOURCE_NAMES, sourceCountry } from './rss-sources.js'
import { SOURCES } from '../../workers/mcp/src/resources.js'

const direct = SOURCES.filter(s => s.via === 'direct')

test('every outlet the cycle reads is listed as read directly, and nothing else is', () => {
  assert.deepEqual(direct.map(s => s.name).sort(), [...RSS_SOURCE_NAMES].sort())
})

test('a directly read outlet has the country the table gives it', () => {
  for (const s of direct) assert.equal(s.country, sourceCountry(s.name), s.name)
})

test('no outlet is listed twice', () => {
  const names = SOURCES.map(s => s.name)
  assert.equal(new Set(names).size, names.length)
})
