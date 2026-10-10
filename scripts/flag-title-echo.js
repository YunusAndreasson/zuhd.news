#!/usr/bin/env node
// Lists this cycle's articles whose hook says the title again, for the
// editor's `<title-echo>` block (`editor`, `lib/cycle-steps.js`). The measure
// and why it is a flag rather than a gate are in `lib/title-echo.js`.
//
//   node scripts/flag-title-echo.js [file-list]   (default: the cycle's new-articles list)
//
// Prints one line per flagged article and nothing for the rest. Never fails
// the cycle: an unreadable file is skipped, as `<body-lengths>` skips it.
//
// The list is read by `batchFiles` (`lib/article-files.js`), so its paths are
// taken from the repository root. They were taken from the working directory,
// and from anywhere but the root every file was unreadable, skipped, and the
// editor's block empty: no echo found and none looked for print the same.
import { readFileSync } from 'node:fs'
import { batchFiles } from './lib/article-files.js'
import { parseFrontmatter } from './lib/frontmatter.js'
import { hookOf, titleEcho } from './lib/title-echo.js'

let files = []
try {
  files = batchFiles(process.argv[2] || undefined)
} catch {
  process.exit(0)
}

for (const { rel, path } of files) {
  try {
    const { meta, body } = parseFrontmatter(readFileSync(path, 'utf8'))
    const title = String(meta.title || '')
    const hook = hookOf(body, meta.location)
    if (titleEcho(title, hook).echo) {
      console.log(`ECHO ${rel}\n  title: ${title}\n  hook:  ${hook}`)
    }
  } catch {}
}
