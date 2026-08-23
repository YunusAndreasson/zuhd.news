#!/usr/bin/env node
// Validates new articles from /tmp/zuhd-new-articles.txt.
// Moves malformed files to .bad so they don't get deployed.
import { readFileSync, existsSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { splitBlocks } from './lib/blocks.js'
import { parseFrontmatter } from './lib/frontmatter.js'

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

  // Parse with the same function build.js uses, not just string-match it.
  // The string checks below pass on frontmatter that js-yaml rejects, so an
  // unparseable article reached Stage 3b and took the whole build down with
  // it — a no-publish cascade off one file. Quarantining it here is what the
  // .bad mechanism is for: 12 good articles ship, the broken one does not.
  try {
    parseFrontmatter(raw)
  } catch (err) {
    markBad(`unparseable frontmatter: ${err.reason || err.message}`)
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
