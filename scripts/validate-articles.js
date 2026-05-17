#!/usr/bin/env node
// Validates new articles from /tmp/zuhd-new-articles.txt.
// Moves malformed files to .bad so they don't get deployed.
import { readFileSync, existsSync, renameSync } from 'fs'
import { resolve } from 'path'
import { splitBlocks } from './lib/blocks.js'

const files = readFileSync('/tmp/zuhd-new-articles.txt', 'utf8').trim().split('\n').filter(Boolean)
let bad = 0

for (const f of files) {
  const full = resolve(f)
  if (!existsSync(full)) continue
  const raw = readFileSync(full, 'utf8')

  const fm = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) {
    console.log('SKIP (no frontmatter): ' + f)
    renameSync(full, full + '.bad'); bad++; continue
  }

  const yaml = fm[1]
  const has = k => yaml.includes(k + ':')
  const hasSources = yaml.includes('sources:') && yaml.includes('  - name:')
  if (!has('title') || !has('date') || !has('category') || !has('location') || !hasSources) {
    console.log('SKIP (missing fields): ' + f)
    renameSync(full, full + '.bad'); bad++; continue
  }

  const body = raw.replace(/^---[\s\S]*?---\s*/, '').trim()
  const blocks = splitBlocks(body).filter(s => s.length > 5)
  if (blocks.length < 2 || blocks.length > 5) {
    console.log(`SKIP (${blocks.length} blocks): ` + f)
    renameSync(full, full + '.bad'); bad++; continue
  }
}

console.log(`Validated ${files.length} articles, ${bad} removed`)
