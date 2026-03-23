#!/usr/bin/env node
// Validates new articles from /tmp/zuhd-new-articles.txt.
// Moves malformed files to .bad so they don't get deployed.
import { readFileSync, existsSync, renameSync } from 'fs'
import { resolve } from 'path'

const SENTENCE_RE = /(?<=[.!?][\u201C\u201D\u2018\u2019"']?)\s+(?=[A-Z\u00C0-\u024F])/

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
  const sentences = body.split(SENTENCE_RE).filter(s => s.length > 5)
  if (sentences.length < 2 || sentences.length > 5) {
    console.log(`SKIP (${sentences.length} sentences): ` + f)
    renameSync(full, full + '.bad'); bad++; continue
  }
}

console.log(`Validated ${files.length} articles, ${bad} removed`)
