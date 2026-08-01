#!/usr/bin/env node
// Outputs a compact topic-grouped coverage map of articles published in the last 24 hours.
// Uses frontmatter date (not mtime — git ops change mtime, breaking the window).
import { readdirSync, readFileSync } from 'node:fs'
import { parseFrontmatter } from './lib/frontmatter.js'

const cutoff = Date.now() - 24 * 60 * 60 * 1000

let slugs = []
try {
  slugs = readdirSync('content/articles')
    .filter(f => {
      if (!f.endsWith('.md')) return false
      try {
        const content = readFileSync(`content/articles/${f}`, 'utf-8')
        const { meta } = parseFrontmatter(content)
        const date = meta.date ? new Date(meta.date).getTime() : 0
        return date >= cutoff
      } catch { return false }
    })
    .map(f => f.slice(11, -3)) // strip YYYY-MM-DD- prefix and .md suffix
} catch {}
if (!slugs.length) process.exit(0)

const groups = {}
for (const s of slugs) {
  const key = s.split('-')[0]
  if (!groups[key]) groups[key] = []
  groups[key].push(s.split('-').slice(1).join(' '))
}

const lines = Object.entries(groups)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([k, v]) => `${k}: ${v.slice(0, 3).join('; ')}${v.length > 3 ? ` (+${v.length - 3} more)` : ''}`)

process.stdout.write(`${lines.join('\n')}\n`)
