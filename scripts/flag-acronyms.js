#!/usr/bin/env node
// Lists this cycle's articles that carry capitals the reader may have to
// decode, for the editor's `<acronyms>` block (`editor`, `lib/cycle-steps.js`).
// What counts and why it is a flag rather than a gate are in `lib/acronyms.js`.
//
//   node scripts/flag-acronyms.js [file-list]   (default: the cycle's new-articles list)
//
// Prints one line per flagged article and nothing for the rest, each token
// with the words around it, so the editor reads the use and not the rule.
// Never fails the cycle: an unreadable file is skipped, as `<title-echo>`
// skips it.
import { readFileSync } from 'node:fs'
import { unexpandedAcronyms } from './lib/acronyms.js'
import { visibleText } from './lib/article.js'
import { batchFiles } from './lib/article-files.js'
import { parseFrontmatter } from './lib/frontmatter.js'

let files = []
try {
  files = batchFiles(process.argv[2] || undefined)
} catch {
  process.exit(0)
}

/** The token where it stands: a few words either side, on one line. */
function inContext(text, token) {
  const at = text.search(new RegExp(`\\b${token}\\b`))
  return text.slice(Math.max(0, at - 30), at + token.length + 30).replace(/\s+/g, ' ').trim()
}

for (const { rel, path } of files) {
  try {
    const { meta, body } = parseFrontmatter(readFileSync(path, 'utf8'))
    const prose = `${String(meta.title || '')}\n${visibleText(body)}`
    const tokens = unexpandedAcronyms(prose)
    if (tokens.length === 0) continue
    console.log(`ACRONYM ${rel}\n${tokens.map((t) => `  ${t}: …${inContext(prose, t)}…`).join('\n')}`)
  } catch {}
}
