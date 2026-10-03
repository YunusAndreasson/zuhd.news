#!/usr/bin/env node
// Lists this cycle's articles whose hook says the title again, for the
// editor's `<title-echo>` block (`run-cycle.sh`, Stage 3). The measure and why
// it is a flag rather than a gate are in `lib/title-echo.js`.
//
//   node scripts/flag-title-echo.js [file-list]   (default /tmp/zuhd-new-articles.txt)
//
// Prints one line per flagged article and nothing for the rest. Never fails
// the cycle: an unreadable file is skipped, as `<body-lengths>` skips it.
import { readFileSync } from 'node:fs'
import { parseFrontmatter } from './lib/frontmatter.js'
import { hookOf, titleEcho } from './lib/title-echo.js'

const listPath = process.argv[2] || '/tmp/zuhd-new-articles.txt'
let files = []
try {
  files = readFileSync(listPath, 'utf8').trim().split('\n').filter(Boolean)
} catch {
  process.exit(0)
}

for (const f of files) {
  try {
    const { meta, body } = parseFrontmatter(readFileSync(f, 'utf8'))
    const title = String(meta.title || '')
    const hook = hookOf(body, meta.location)
    if (titleEcho(title, hook).echo) {
      console.log(`ECHO ${f}\n  title: ${title}\n  hook:  ${hook}`)
    }
  } catch {}
}
