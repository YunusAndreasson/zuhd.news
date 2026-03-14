#!/usr/bin/env node
// Outputs a compact topic-grouped coverage map of articles published in the last 24 hours.
// Uses file mtime — no UTC date boundary, so context survives midnight without resetting.
import { readdirSync, statSync } from 'fs'

const cutoff = Date.now() - 24 * 60 * 60 * 1000

let slugs = []
try {
  slugs = readdirSync('content/articles')
    .filter(f => f.endsWith('.md') && statSync(`content/articles/${f}`).mtimeMs >= cutoff)
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
  .map(([k, v]) => k + ': ' + v.slice(0, 3).join('; ') + (v.length > 3 ? ` (+${v.length - 3} more)` : ''))

process.stdout.write(lines.join('\n') + '\n')
