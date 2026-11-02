// Run: node --test scripts/lib/page-css.test.js

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { dropRulesNeedingClass, KEPT_MAP_CLASSES } from './page-css.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const drop = (css, kept) => dropRulesNeedingClass(css, /\.map-[\w-]+/, kept)

test('a rule that needs a map class goes, and one that does not stays', () => {
  assert.equal(drop('.a{color:red}.map-x{color:red}.b .map-y{top:0}'), '.a{color:red}')
})

test('a selector list stays whole while any selector in it could match', () => {
  assert.equal(drop('.map-x,.doc-page{top:0}'), '.map-x,.doc-page{top:0}')
})

test('at-rules are walked, emptied ones go, and others are left alone', () => {
  assert.equal(drop('@media(min-width:1px){.map-x{top:0}}.a{top:0}'), '.a{top:0}')
  assert.equal(drop('@media(min-width:1px){.map-x{top:0}.a{top:0}}'), '@media(min-width:1px){.a{top:0}}')
  assert.equal(drop('@font-face{font-family:"a{b"}'), '@font-face{font-family:"a{b"}')
  assert.equal(drop('@keyframes map-spin{0%{top:0}to{top:1px}}'), '@keyframes map-spin{0%{top:0}to{top:1px}}')
})

test('nesting goes with its parent, and a brace in a string is not a brace', () => {
  assert.equal(drop('.map-x{top:0;&:hover{top:1px}}.a{content:"}"}'), '.a{content:"}"}')
})

test('a class inside a functional pseudo is not a requirement', () => {
  assert.equal(drop('.a:not(.map-x){top:0}'), '.a:not(.map-x){top:0}')
})

test('a borrowed class keeps its rules', () => {
  assert.equal(drop('.map-popup-loading{top:0}.map-x{top:0}', ['map-popup-loading']), '.map-popup-loading{top:0}')
})

test('every map class outside the map is on the kept list', () => {
  // Islands that mount off the map, and the templates of pages that are not it.
  const mapOnly = new Set(['situation-map.ts'])
  const dir = join(ROOT, 'public', 'islands')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !mapOnly.has(f))
    .map((f) => join(dir, f))
  for (const t of ['article', 'category', 'entity', 'country', 'static-page']) files.push(join(ROOT, 'templates', `${t}.html`))
  files.push(join(ROOT, 'scripts', 'lib', 'site-chrome.js'), join(ROOT, 'scripts', 'lib', 'list-row.js'))
  const seen = new Set()
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/['"` .]map-[a-z][a-z0-9-]*/g)) seen.add(m[0].slice(1))
  }
  assert.deepEqual([...seen].filter((c) => !KEPT_MAP_CLASSES.includes(c)), [])
})
