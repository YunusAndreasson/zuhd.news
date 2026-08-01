// Run: node --test scripts/lib/selection.test.js
//
// Audits the latest /tmp/zuhd-selection.json the way a pre-writer gate
// would. The corpus audit on 2026-04-19 found 74 same-day duplicate
// articles that shipped because dedup-selection.js only compares against
// disk, never against other entries in the same batch. This test catches
// that at the point it's introduced — before the writer runs, before
// anything lands on disk.
//
// Intended use: run after dedup-selection.js and before write-prompt.md
// is invoked. If CI/the cycle script gates on this, the 74-pair bug
// stops being a corpus-level property and becomes a blocking precondition.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'
import { slugWords } from './dedup.js'

const SELECTION = '/tmp/zuhd-selection.json'

function load() {
  if (!existsSync(SELECTION)) return null
  try { return JSON.parse(readFileSync(SELECTION, 'utf8')) } catch { return null }
}

test('selection has no intra-batch duplicates', () => {
  const sel = load()
  if (!sel) { console.log('no selection file; skipping'); return }
  const recs = sel.map(s => ({ slug: s.suggestedSlug, words: slugWords(s.suggestedSlug || '') }))
  const dupes = []
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      const a = recs[i].words, b = recs[j].words
      if (a.size === 0 || b.size === 0) continue
      const overlap = [...a].filter(w => b.has(w)).length
      const ratio = overlap / Math.min(a.size, b.size)
      if (ratio >= 0.7 && overlap >= 4) dupes.push(`${recs[i].slug} ~ ${recs[j].slug} (${overlap}w, ${ratio.toFixed(2)})`)
    }
  }
  assert.deepEqual(dupes, [], `intra-batch duplicate selections:\n  ${dupes.join('\n  ')}`)
})

test('selection has no duplicate eventUri within batch', () => {
  const sel = load()
  if (!sel) return
  const seen = new Map()
  const dupes = []
  for (const s of sel) {
    if (!s.eventUri) continue
    if (seen.has(s.eventUri)) dupes.push(`${seen.get(s.eventUri)} ~ ${s.suggestedSlug} (eventUri=${s.eventUri})`)
    else seen.set(s.eventUri, s.suggestedSlug)
  }
  assert.deepEqual(dupes, [], `duplicate eventUri in selection:\n  ${dupes.join('\n  ')}`)
})

test('selection has no duplicate suggestedSlug within batch', () => {
  const sel = load()
  if (!sel) return
  const seen = new Set()
  const dupes = []
  for (const s of sel) {
    if (seen.has(s.suggestedSlug)) dupes.push(s.suggestedSlug)
    seen.add(s.suggestedSlug)
  }
  assert.deepEqual(dupes, [], `duplicate slugs: ${dupes.join(', ')}`)
})

// Structural contract: the writer stage expects specific fields. If the
// selector prompt drifts and omits one, the writer silently writes
// broken articles. Enforce the contract here.
test('every selection has writer-required fields', () => {
  const sel = load()
  if (!sel) return
  const REQUIRED = ['suggestedSlug', 'category', 'title', 'sources']
  const broken = []
  for (const s of sel) {
    for (const k of REQUIRED) if (!(k in s)) broken.push(`${s.suggestedSlug || '?'}: missing ${k}`)
    if (Array.isArray(s.sources) && s.sources.length === 0) broken.push(`${s.suggestedSlug}: empty sources`)
  }
  assert.deepEqual(broken, [], `selection schema violations:\n  ${broken.join('\n  ')}`)
})
