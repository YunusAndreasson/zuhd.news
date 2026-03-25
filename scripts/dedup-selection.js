#!/usr/bin/env node
// Removes entries from /tmp/zuhd-selection.json whose article already exists.
// Runs between selector and writer to avoid wasting LLM turns on duplicates.
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const SELECTION = '/tmp/zuhd-selection.json'
if (!existsSync(SELECTION)) process.exit(0)

const selection = JSON.parse(readFileSync(SELECTION, 'utf-8'))
const before = selection.length

const filtered = selection.filter(s => {
  const path = join('content/articles', s.suggestedSlug + '.md')
  if (existsSync(path)) {
    console.log(`Removed (already published): ${s.suggestedSlug}`)
    return false
  }
  return true
})

if (filtered.length < before) {
  writeFileSync(SELECTION, JSON.stringify(filtered, null, 2))
  console.log(`Deduped selection: ${before} → ${filtered.length} (${before - filtered.length} already published)`)
} else {
  console.log(`Dedup check: all ${before} stories are new`)
}
