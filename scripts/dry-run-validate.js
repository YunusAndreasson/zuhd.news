#!/usr/bin/env node
// Throwaway: re-validate mobile/lib/dev-context-demo.json the same way the
// mobile app will at runtime, so we can prove every block would actually
// render in the ContextSheet before committing prompt changes.
//
// Runs two checks:
//   1. Node mirror (scripts/lib/validate-blocks.js) — same rules as mobile.
//   2. Shape conformance against mobile/types.ts contract for ContextBrief.

import { readFileSync } from 'fs'
import { join } from 'path'
import { parseArticleBlock } from './lib/validate-blocks.js'

const ROOT = new URL('..', import.meta.url).pathname
const BRIEF_PATH = join(ROOT, 'mobile', 'lib', 'dev-context-demo.json')

const brief = JSON.parse(readFileSync(BRIEF_PATH, 'utf8'))

let fail = 0
const check = (cond, msg) => {
  if (!cond) { console.log(`  ✗ ${msg}`); fail++ } else { console.log(`  ✓ ${msg}`) }
}

console.log(`\n=== ContextBrief shape ===`)
check(typeof brief.id === 'string', 'id is string')
check(brief.type === 'edu' || brief.type === 'daily' || brief.type === 'weekly', `type is edu|daily|weekly (got ${brief.type})`)
check(typeof brief.label === 'string', 'label is string')
check(typeof brief.category === 'string', 'category is string')
check(Array.isArray(brief.timeline), 'timeline is array')
check(!brief.sources || Array.isArray(brief.sources), 'sources is array or omitted')

console.log(`\n=== Timeline entries (${brief.timeline.length}) ===`)
let totalBlocks = 0
let okBlocks = 0
let rejectedBlocks = []

for (const [i, entry] of brief.timeline.entries()) {
  check(typeof entry.body === 'string' && entry.body.length > 0, `entry[${i}].body non-empty string`)
  if (entry.heading !== undefined) {
    check(typeof entry.heading === 'string', `entry[${i}].heading is string`)
  }
  if (entry.blocks) {
    check(Array.isArray(entry.blocks), `entry[${i}].blocks is array`)
    for (const [j, block] of entry.blocks.entries()) {
      totalBlocks++
      const { block: parsed, reason } = parseArticleBlock(block)
      if (parsed) {
        okBlocks++
        console.log(`  ✓ entry[${i}].blocks[${j}] (${block.type}) valid`)
      } else {
        rejectedBlocks.push({ i, j, type: block.type, reason })
        console.log(`  ✗ entry[${i}].blocks[${j}] (${block.type}) REJECTED: ${reason}`)
        fail++
      }
    }
  }
}

console.log(`\n=== Summary ===`)
console.log(`  Entries: ${brief.timeline.length}`)
console.log(`  Blocks total: ${totalBlocks}`)
console.log(`  Blocks valid: ${okBlocks}`)
console.log(`  Blocks rejected: ${rejectedBlocks.length}`)
if (rejectedBlocks.length) {
  console.log(`  Rejected detail:`)
  for (const r of rejectedBlocks) console.log(`    - [${r.i}].blocks[${r.j}] ${r.type}: ${r.reason}`)
}

if (fail > 0) {
  console.log(`\n✗ ${fail} validation failure(s) — mobile app would skip/mangle these`)
  process.exit(1)
}
console.log(`\n✓ All checks pass — brief is app-renderable`)
