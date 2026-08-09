#!/usr/bin/env node
// Validates new articles from /tmp/zuhd-new-articles.txt.
// Moves malformed files to .bad so they don't get deployed.
import { readFileSync, existsSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { splitBlocks } from './lib/blocks.js'

const files = readFileSync('/tmp/zuhd-new-articles.txt', 'utf8').trim().split('\n').filter(Boolean)
let bad = 0

for (const f of files) {
  const full = resolve(f)
  if (!existsSync(full)) continue
  const raw = readFileSync(full, 'utf8')

  const markBad = reason => {
    console.log(`SKIP (${reason}): ${f}`)
    renameSync(full, `${full}.bad`)
    bad++
  }

  const fm = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) {
    markBad('no frontmatter')
    continue
  }

  const yaml = fm[1]
  const has = k => yaml.includes(`${k}:`)
  const hasSources = yaml.includes('sources:') && yaml.includes('  - name:')
  if (!has('title') || !has('date') || !has('category') || !has('location') || !hasSources) {
    markBad('missing fields')
    continue
  }

  const body = raw.replace(/^---[\s\S]*?---\s*/, '').trim()
  const blocks = splitBlocks(body).filter(s => s.length > 5)
  if (blocks.length < 2 || blocks.length > 5) {
    markBad(`${blocks.length} blocks`)
  }
}

console.log(`Validated ${files.length} articles, ${bad} removed`)
